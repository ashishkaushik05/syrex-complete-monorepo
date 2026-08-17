import { describe, expect, it } from "bun:test";
import { serviceWarrantyRouter } from "./service-warranty";
import { makeCtx } from "./__testkit__";

// ASVF for the service-warranty decision flow (P1). Cross-org NOT_FOUND + null-org FORBIDDEN
// are already pinned in service-idor.test.ts; this suite covers the decision state machine that
// protects warranty integrity: approval requires a submitted test result, an approved decision
// can't be re-approved, a rejected one can't be silently re-opened, and a rejection can't be
// doubled. permAny(service:approve | service:manage) is the authority gate.

const ORG = "org-1";
const COMPLAINT_ID = "c0000000-0000-4000-8000-000000000001";
const WAREHOUSE_ID = "d0000000-0000-4000-8000-000000000001";

function decisionRow(status: "pending" | "approved" | "rejected", over: Record<string, unknown> = {}) {
  return {
    id: "dec-1",
    complaintId: COMPLAINT_ID,
    status,
    decidedById: "user-1",
    sourceWarehouseId: WAREHOUSE_ID,
    claimingOutletId: null,
    proRataPercent: null,
    approvedReplacementSerial: null,
    rejectionReason: status === "rejected" ? "out of warranty" : null,
    replacementOrderId: null,
    decidedAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...over,
  };
}

type WarrantyMockOpts = {
  complaint?: { id: string; orgId: string; status: string } | null;
  existingDecision?: Record<string, unknown> | null;
};

function warrantyCtx(opts: WarrantyMockOpts, permissions: string[] = ["service:approve"], orgId: string | null = ORG) {
  const captured: { upsert?: Record<string, unknown> } = {};
  const tx: Record<string, unknown> = {
    serviceComplaint: {
      findFirst: async () => opts.complaint ?? null,
      update: async () => ({}),
    },
    serviceWarrantyDecision: {
      findUnique: async () => opts.existingDecision ?? null,
      upsert: async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        captured.upsert = args;
        const status = (args.update?.status ?? args.create?.status) as "approved" | "rejected";
        return decisionRow(status);
      },
    },
    serviceComplaintActivity: { create: async () => ({}) },
    auditLog: { create: async () => ({}) },
  };
  const prisma = {
    $transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
  };
  const ctx = makeCtx({ actorId: "user-1", actorOrgId: orgId, permissions, userType: "internal", prisma });
  return { ctx, captured };
}

const submitted = { id: COMPLAINT_ID, orgId: ORG, status: "test_result_submitted" };

describe("serviceWarranty.approve", () => {
  const input = { complaintId: COMPLAINT_ID, sourceWarehouseId: WAREHOUSE_ID };

  it("rejects an actor without service:approve or service:manage (Auth)", async () => {
    const { ctx } = warrantyCtx({ complaint: submitted }, ["service:read"]);
    await expect(serviceWarrantyRouter.createCaller(ctx).approve(input)).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("FORBIDDEN when the actor has no org context (Failure)", async () => {
    const { ctx } = warrantyCtx({ complaint: submitted }, ["service:approve"], null);
    await expect(serviceWarrantyRouter.createCaller(ctx).approve(input)).rejects.toThrow(/Org context/i);
  });

  it("NOT_FOUND for a complaint outside the actor's org (IDOR)", async () => {
    const { ctx } = warrantyCtx({ complaint: null });
    await expect(serviceWarrantyRouter.createCaller(ctx).approve(input)).rejects.toThrow(/not found/i);
  });

  it("rejects approval before a test result is submitted (state machine)", async () => {
    const { ctx } = warrantyCtx({ complaint: { id: COMPLAINT_ID, orgId: ORG, status: "assigned" } });
    await expect(serviceWarrantyRouter.createCaller(ctx).approve(input)).rejects.toThrow(/requires submitted test result/i);
  });

  it("rejects re-approving an already-approved decision (Conflict)", async () => {
    const { ctx } = warrantyCtx({ complaint: submitted, existingDecision: decisionRow("approved") });
    await expect(serviceWarrantyRouter.createCaller(ctx).approve(input)).rejects.toThrow(/already approved/i);
  });

  it("rejects approving a decision already rejected (Conflict)", async () => {
    const { ctx } = warrantyCtx({ complaint: submitted, existingDecision: decisionRow("rejected") });
    await expect(serviceWarrantyRouter.createCaller(ctx).approve(input)).rejects.toThrow(/was rejected/i);
  });

  it("approves a submitted complaint and clears any stale rejection reason", async () => {
    const { ctx, captured } = warrantyCtx({ complaint: submitted, existingDecision: null });
    const out = await serviceWarrantyRouter.createCaller(ctx).approve(input);
    expect(out.status).toBe("approved");
    expect((captured.upsert!.update as Record<string, unknown>).rejectionReason).toBeNull();
    expect((captured.upsert!.create as Record<string, unknown>).status).toBe("approved");
  });

  it("allows service:manage as an alternative authority", async () => {
    const { ctx } = warrantyCtx({ complaint: submitted, existingDecision: null }, ["service:manage"]);
    await expect(serviceWarrantyRouter.createCaller(ctx).approve(input)).resolves.toMatchObject({ status: "approved" });
  });
});

describe("serviceWarranty.reject", () => {
  const input = { complaintId: COMPLAINT_ID, reason: "out of warranty period" };

  it("rejects without authority (Auth)", async () => {
    const { ctx } = warrantyCtx({ complaint: submitted }, ["service:read"]);
    await expect(serviceWarrantyRouter.createCaller(ctx).reject(input)).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("NOT_FOUND for a cross-org complaint (IDOR)", async () => {
    const { ctx } = warrantyCtx({ complaint: null });
    await expect(serviceWarrantyRouter.createCaller(ctx).reject(input)).rejects.toThrow(/not found/i);
  });

  it("rejects a double-rejection (Conflict)", async () => {
    const { ctx } = warrantyCtx({ complaint: submitted, existingDecision: decisionRow("rejected") });
    await expect(serviceWarrantyRouter.createCaller(ctx).reject(input)).rejects.toThrow(/already rejected/i);
  });

  it("records a rejection from a submitted complaint", async () => {
    const { ctx, captured } = warrantyCtx({ complaint: submitted, existingDecision: null });
    const out = await serviceWarrantyRouter.createCaller(ctx).reject(input);
    expect(out.status).toBe("rejected");
    expect((captured.upsert!.create as Record<string, unknown>).rejectionReason).toBe("out of warranty period");
  });
});
