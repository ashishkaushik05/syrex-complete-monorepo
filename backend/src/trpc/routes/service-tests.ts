import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { recordComplaintActivity, resolveTransition } from "./service-shared";

const testOutputSchema = z.object({
  id: z.string(),
  complaintId: z.string(),
  complaintLineId: z.string().nullable(),
  submittedById: z.string(),
  verdict: z.string(),
  summary: z.string().nullable(),
  structuredData: z.unknown().nullable(),
  createdAt: z.string(),
});

export const serviceTestsRouter = createTRPCRouter({
  submit: perm(P.service.manage)
    .input(
      z.object({
        complaintId: z.string().uuid(),
        complaintLineId: z.string().uuid().nullable().optional(),
        verdict: z.enum(["tested_ok", "warranty_candidate", "failed", "needs_retest"]),
        summary: z.string().max(2000).optional(),
        structuredData: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .output(testOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      if (!actorId) throw apiError("UNAUTHORIZED", "Missing actor context");

      const created = await ctx.prisma.$transaction(async (tx) => {
        const complaint = await tx.serviceComplaint.findUnique({
          where: { id: input.complaintId },
          select: { id: true, status: true },
        });
        if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");

        const transition = resolveTransition(complaint.status, "test_submitted");

        // Gate: at least one non-disabled form submission required
        const activeSubs = await tx.serviceFormSubmission.findMany({
          where: { complaintId: input.complaintId, isDisabled: false },
          include: { values: true },
        });
        if (activeSubs.length === 0) {
          throw apiError("BAD_REQUEST", "At least one form submission is required before test can be submitted");
        }
        const invalidValues = activeSubs.flatMap((s) => s.values.filter((v) => !v.isValid));
        if (invalidValues.length > 0) {
          const keys = invalidValues.map((v) => v.fieldKey).join(", ");
          throw apiError("BAD_REQUEST", `Form submissions have invalid fields: ${keys}`);
        }

        const test = await tx.serviceTestReport.create({
          data: {
            complaintId: input.complaintId,
            complaintLineId: input.complaintLineId ?? null,
            submittedById: actorId,
            verdict: input.verdict,
            summary: input.summary ?? null,
            structuredData: (input.structuredData as Prisma.InputJsonValue | undefined) ?? undefined,
          },
        });

        await tx.serviceComplaint.update({
          where: { id: input.complaintId },
          data: { status: transition.nextStatus },
        });

        // Link unlinked submissions to this test report
        const unlinkedIds = activeSubs.filter((s) => !s.testReportId).map((s) => s.id);
        if (unlinkedIds.length > 0) {
          await tx.serviceFormSubmission.updateMany({
            where: { id: { in: unlinkedIds } },
            data: { testReportId: test.id },
          });
        }

        await recordComplaintActivity(tx, {
          complaintId: input.complaintId,
          actorId,
          action: "test_submitted",
          fromStatus: complaint.status,
          toStatus: transition.nextStatus,
          note: input.summary ?? null,
          meta: {
            verdict: input.verdict,
            complaintLineId: input.complaintLineId ?? null,
          },
        });

        return test;
      });

      return {
        id: created.id,
        complaintId: created.complaintId,
        complaintLineId: created.complaintLineId,
        submittedById: created.submittedById,
        verdict: created.verdict,
        summary: created.summary,
        structuredData: created.structuredData ?? null,
        createdAt: created.createdAt.toISOString(),
      };
    }),

  requestRetest: perm(P.service.retest)
    .input(
      z.object({
        complaintId: z.string().uuid(),
        note: z.string().min(2).max(2000),
      }),
    )
    .output(
      z.object({
        complaintId: z.string(),
        status: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      if (!actorId) throw apiError("UNAUTHORIZED", "Missing actor context");

      const updated = await ctx.prisma.$transaction(async (tx) => {
        const complaint = await tx.serviceComplaint.findUnique({
          where: { id: input.complaintId },
          select: { id: true, status: true },
        });
        if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");

        const transition = resolveTransition(complaint.status, "retest_requested");
        const row = await tx.serviceComplaint.update({
          where: { id: input.complaintId },
          data: { status: transition.nextStatus },
          select: { id: true, status: true },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.complaintId,
          actorId,
          action: "retest_requested",
          fromStatus: complaint.status,
          toStatus: transition.nextStatus,
          note: input.note,
        });

        return row;
      });

      return {
        complaintId: updated.id,
        status: updated.status,
      };
    }),
});
