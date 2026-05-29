import { describe, expect, it } from "bun:test";
import { TRPCError } from "@trpc/server";

import { serviceTestsRouter } from "./service-tests";
import type { TrpcContext } from "../context";

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

  return {
    requestId: "test-req",
    actor: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", orgId: "org-A", sessionId: "sess-1" },
    prisma: fakePrisma as TrpcContext["prisma"],
    permissions: ["*"],
    managedWarehouseId: null,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: [],
    sourceIp: "127.0.0.1",
  };
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
});
