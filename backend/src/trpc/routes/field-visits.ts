import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { assertCanReadAgent, assertFieldEnabled, resolveReadOrgId } from "./field-helpers";
import type { TrpcContext } from "../context";

const visitSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  shiftId: z.string(),
  orgId: z.string(),
  lat: z.number(),
  lng: z.number(),
  description: z.string().nullable(),
  audioUrl: z.string().nullable(),
  outletId: z.string().nullable(),
  customerId: z.string().nullable(),
  recordedAt: z.string(),
  createdAt: z.string()
});

const VISIT_SELECT = {
  id: true,
  agentId: true,
  shiftId: true,
  orgId: true,
  lat: true,
  lng: true,
  description: true,
  audioUrl: true,
  outletId: true,
  customerId: true,
  recordedAt: true,
  createdAt: true
} as const;

function toVisit(v: {
  id: string;
  agentId: string;
  shiftId: string;
  orgId: string;
  lat: number;
  lng: number;
  description: string | null;
  audioUrl: string | null;
  outletId: string | null;
  customerId: string | null;
  recordedAt: Date;
  createdAt: Date;
}) {
  return {
    ...v,
    recordedAt: v.recordedAt.toISOString(),
    createdAt: v.createdAt.toISOString()
  };
}

async function resolveOrgIdForShiftRead(ctx: TrpcContext, shiftId: string) {
  if (ctx.actor.orgId) return resolveReadOrgId(ctx);
  const shift = await ctx.prisma.shift.findUnique({
    where: { id: shiftId },
    select: { agentId: true, orgId: true }
  });
  if (!shift) throw apiError("NOT_FOUND", "Shift not found");
  assertCanReadAgent(ctx, shift.agentId);
  return shift.orgId;
}

export const fieldVisitsRouter = createTRPCRouter({
  log: perm(P.field.write)
    .input(
      z.object({
        agentId: z.string().uuid().optional(),
        lat: z.number(),
        lng: z.number(),
        description: z.string().min(1).optional(),
        // M-05: audioUrl must be HTTPS only; reject file://, data://, http://
        audioUrl: z
          .string()
          .url()
          .refine((u) => u.startsWith("https://"), {
            message: "audioUrl must use HTTPS"
          })
          .optional(),
        outletId: z.string().uuid().optional(),
        customerId: z.string().uuid().optional(),
        recordedAt: z.string().datetime().optional()
      })
    )
    .output(visitSchema)
    .mutation(async ({ ctx, input }) => {
      const agentId = ctx.actor.id!;
      await assertFieldEnabled(ctx.prisma, agentId);
      // H-11: if the client passes agentId, it MUST match the actor. Check BEFORE
      // the shift lookup so a spoofed agentId can't be used to probe shifts.
      if (input.agentId && input.agentId !== agentId) {
        throw apiError(
          "FORBIDDEN",
          "Cannot create records on another agent's shift"
        );
      }
      const shift = await ctx.prisma.shift.findFirst({
        where: {
          agentId,
          status: "active",
          orgId: ctx.actor.orgId ?? undefined
        },
        select: { id: true, orgId: true }
      });
      if (!shift) throw apiError("BAD_REQUEST", "No active shift — visits require an active shift");

      if (input.outletId) {
        // C-18: Outlet has no orgId column (pre-Batch-08), so the previous
        // `orgId: shift.orgId` filter was silently a no-op. Org isolation here
        // is enforced indirectly: the resulting visit row is stamped with
        // shift.orgId, and the customer must own the outlet (checked below).
        // Once Batch 08 adds Outlet.orgId, add `orgId: shift.orgId` back.
        const outlet = await ctx.prisma.outlet.findFirst({
          where: { id: input.outletId, isActive: true },
          select: { id: true, userId: true }
        });
        if (!outlet) throw apiError("BAD_REQUEST", "Outlet not found or inactive");

        if (input.customerId) {
          // C-18: User model has no orgId column either; scope is enforced
          // transitively via outlet.userId === customer.id.
          const customer = await ctx.prisma.user.findFirst({
            where: { id: input.customerId, isActive: true, userType: "outlet" },
            select: { id: true }
          });
          if (!customer) throw apiError("BAD_REQUEST", "Customer not found or inactive");
          if (customer.id !== outlet.userId) {
            throw apiError("BAD_REQUEST", "Customer does not belong to selected outlet");
          }
        }
      }

      const visit = await ctx.prisma.fieldVisit.create({
        data: {
          agentId,
          shiftId: shift.id,
          orgId: shift.orgId,
          lat: input.lat,
          lng: input.lng,
          description: input.description ?? null,
          audioUrl: input.audioUrl ?? null,
          outletId: input.outletId ?? null,
          customerId: input.customerId ?? null,
          recordedAt: input.recordedAt ? new Date(input.recordedAt) : new Date()
        },
        select: VISIT_SELECT
      });
      return toVisit(visit);
    }),

  list: perm(P.field.read)
    .input(
      z.object({
        agentId: z.string().uuid().optional(),
        shiftId: z.string().uuid().optional(),
        date: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(200).default(50)
      })
    )
    .output(z.array(visitSchema))
    .query(async ({ ctx, input }) => {
      if (input.agentId) assertCanReadAgent(ctx, input.agentId);
      const orgId = input.shiftId
        ? await resolveOrgIdForShiftRead(ctx, input.shiftId)
        : resolveReadOrgId(ctx);
      const timeFilter: Record<string, Date> = {};
      if (input.from) timeFilter.gte = new Date(input.from);
      if (input.to) timeFilter.lte = new Date(input.to);

      let dateWhere = {};
      if (input.date && !input.from && !input.to) {
        dateWhere = {
          recordedAt: {
            gte: new Date(`${input.date}T00:00:00.000Z`),
            lt: new Date(`${input.date}T23:59:59.999Z`)
          }
        };
      } else if (Object.keys(timeFilter).length > 0) {
        dateWhere = { recordedAt: timeFilter };
      }

      const visits = await ctx.prisma.fieldVisit.findMany({
        where: {
          orgId,
          agentId: input.agentId,
          shiftId: input.shiftId,
          ...dateWhere
        },
        select: VISIT_SELECT,
        orderBy: { recordedAt: "desc" },
        take: input.limit
      });
      return visits.map(toVisit);
    }),

  forShift: perm(P.field.read)
    .input(z.object({ shiftId: z.string().uuid() }))
    .output(z.array(visitSchema))
    .query(async ({ ctx, input }) => {
      const orgId = await resolveOrgIdForShiftRead(ctx, input.shiftId);
      const visits = await ctx.prisma.fieldVisit.findMany({
        where: { shiftId: input.shiftId, orgId },
        select: VISIT_SELECT,
        orderBy: { recordedAt: "asc" }
      });
      return visits.map(toVisit);
    })
});
