import { describe, expect, it } from "bun:test";

import type { TrpcContext } from "../context";
import { serviceWarrantyRouter } from "./service-warranty";
import { makeCtx as baseCtx } from "./__testkit__";

const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPLAINT_ID = "11111111-1111-4111-8111-111111111111";
const WAREHOUSE_ID = "22222222-2222-4222-8222-222222222222";

function warrantyContext(
  updates: Record<string, unknown>[],
): TrpcContext {
  const prisma: any = {
    serviceComplaint: {
      findFirst: async () => ({
        id: COMPLAINT_ID,
        orgId: "org-A",
        status: "test_result_submitted",
      }),
      update: async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return {};
      },
    },
    serviceWarrantyDecision: {
      findUnique: async () => null,
      upsert: async (args: { create: Record<string, unknown> }) => ({
        id: "decision-1",
        complaintId: COMPLAINT_ID,
        sourceWarehouseId: null,
        approvedReplacementSerial: null,
        rejectionReason: null,
        replacementOrderId: null,
        updatedAt: new Date("2026-06-12T00:00:00.000Z"),
        ...args.create,
      }),
    },
    serviceComplaintActivity: { create: async () => ({}) },
    auditLog: { create: async () => ({}) },
  };
  prisma.$transaction = async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma);
  return baseCtx({
    actorId: ACTOR_ID,
    actorOrgId: "org-A",
    permissions: ["service:approve"],
    userType: "internal",
    prisma,
  });
}

describe("Release 4 stage timestamp evidence", () => {
  it("records complaint decidedAt on warranty approval", async () => {
    const updates: Record<string, unknown>[] = [];
    const caller = serviceWarrantyRouter.createCaller(warrantyContext(updates));

    await caller.approve({
      complaintId: COMPLAINT_ID,
      sourceWarehouseId: WAREHOUSE_ID,
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]?.decidedAt).toBeInstanceOf(Date);
  });

  it("records the same decision stage on warranty rejection", async () => {
    const updates: Record<string, unknown>[] = [];
    const caller = serviceWarrantyRouter.createCaller(warrantyContext(updates));

    await caller.reject({
      complaintId: COMPLAINT_ID,
      reason: "Warranty conditions were not met",
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]?.status).toBe("resolved");
    expect(updates[0]?.decidedAt).toBeInstanceOf(Date);
    expect(updates[0]?.closedAt).toBe(updates[0]?.decidedAt);
  });
});
