import { describe, expect, it } from "bun:test";
import { TRPCError } from "@trpc/server";

import { serviceTestsRouter } from "./service-tests";
import type { TrpcContext } from "../context";
import { ACTOR_ID, makeCtx as baseCtx } from "./__testkit__";

const COMPLAINT_ID = "11111111-1111-4111-8111-111111111111";

function makeCtx(): TrpcContext {
  const fakePrisma: any = {
    user: {
      findUnique: async () => ({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        isActive: true,
        role: { permissions: ["*"] },
        managedWarehouse: null,
      }),
    },
    serviceComplaint: {
      findFirst: async () => ({
        id: COMPLAINT_ID,
        orgId: "org-A",
        status: "visit",
        lines: [{ id: "22222222-2222-4222-8222-222222222222", serialNumber: null }],
      }),
    },
    serviceComplaintLine: {
      findFirst: async () => null,
    },
    serviceFormSubmission: {
      findMany: async () => [],
      updateMany: async () => ({}),
    },
    serviceTestReport: {
      create: async () => {
        throw new Error("test report should not be created without line serials");
      },
    },
    serviceComplaintActivity: {
      create: async () => ({}),
    },
  };
  fakePrisma.$transaction = async (cb: (tx: typeof fakePrisma) => Promise<unknown>) => cb(fakePrisma);

  return baseCtx({
    actorId: ACTOR_ID,
    actorOrgId: "org-A",
    sessionId: "sess-1",
    permissions: ["*"],
    userType: "internal",
    sourceIp: "127.0.0.1",
    prisma: fakePrisma,
  });
}

describe("service test report serial gate", () => {
  it("rejects test submission when any complaint line has no serial number", async () => {
    const caller = serviceTestsRouter.createCaller(makeCtx());

    try {
      await caller.submit({
        complaintId: COMPLAINT_ID,
        verdict: "warranty_candidate",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("BAD_REQUEST");
      expect((err as TRPCError).message).toContain("Serial number is required");
      return;
    }

    throw new Error("expected missing serial submission to be rejected");
  });

  it("records testedAt when a valid test report advances the complaint", async () => {
    let updateData: Record<string, unknown> | undefined;
    const fakePrisma: any = {
      user: {
        findUnique: async () => ({ role: { name: "Admin" } }),
      },
      serviceComplaint: {
        findFirst: async () => ({
          id: COMPLAINT_ID,
          orgId: "org-A",
          status: "visit",
          lines: [{
            id: "22222222-2222-4222-8222-222222222222",
            serialNumber: "SERIAL-1",
          }],
        }),
        update: async (args: { data: Record<string, unknown> }) => {
          updateData = args.data;
          return {};
        },
      },
      serviceComplaintLine: { findFirst: async () => null },
      serviceFormSubmission: {
        findMany: async () => [{
          id: "submission-1",
          testReportId: null,
          values: [{ fieldKey: "voltage", isValid: true }],
        }],
        updateMany: async () => ({ count: 1 }),
      },
      serviceTestReport: {
        create: async (args: { data: Record<string, unknown> }) => ({
          id: "test-1",
          complaintLineId: null,
          createdAt: new Date("2026-06-12T00:00:00.000Z"),
          ...args.data,
        }),
      },
      serviceComplaintActivity: { create: async () => ({}) },
      auditLog: { create: async () => ({}) },
    };
    fakePrisma.$transaction = async (cb: (tx: typeof fakePrisma) => Promise<unknown>) => cb(fakePrisma);
    const caller = serviceTestsRouter.createCaller(baseCtx({
      actorId: ACTOR_ID,
      actorOrgId: "org-A",
      permissions: ["*"],
      userType: "internal",
      prisma: fakePrisma,
    }));

    await caller.submit({
      complaintId: COMPLAINT_ID,
      verdict: "tested_ok",
      summary: "All checks passed",
    });

    expect(updateData?.status).toBe("test_result_submitted");
    expect(updateData?.testedAt).toBeInstanceOf(Date);
  });
});
