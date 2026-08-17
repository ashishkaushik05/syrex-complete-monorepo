import { describe, expect, it } from "bun:test";
import { TRPCError } from "@trpc/server";

import { serviceAssignmentsRouter } from "./service-assignments";
import type { TrpcContext } from "../context";

const SUPER_PERMS = ["*"];
const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASI_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_ASI_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SALES_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

type FakeUser = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  userType: "internal" | "outlet";
  role: { permissions?: string[]; name: string } | null;
  managedWarehouse?: { id: string } | null;
};

function makeCtx(opts?: {
  actorId?: string;
  complaint?: { status?: string; latestAsiUserId?: string | null; latestSeUserId?: string | null };
  users?: Record<string, FakeUser>;
  onComplaintUpdate?: (data: Record<string, unknown>) => void;
}): TrpcContext {
  const actorId = opts?.actorId ?? ADMIN_ID;
  const users: Record<string, FakeUser> = {
    [ADMIN_ID]: {
      id: ADMIN_ID,
      email: "admin@example.com",
      name: "Admin",
      isActive: true,
      userType: "internal",
      role: { name: "Admin", permissions: SUPER_PERMS },
      managedWarehouse: null,
    },
    [ASI_ID]: {
      id: ASI_ID,
      email: "asi@example.com",
      name: "Area Service Inspector",
      isActive: true,
      userType: "internal",
      role: { name: "ASI", permissions: ["service:assign"] },
      managedWarehouse: null,
    },
    [OTHER_ASI_ID]: {
      id: OTHER_ASI_ID,
      email: "other-asi@example.com",
      name: "Other ASI",
      isActive: true,
      userType: "internal",
      role: { name: "ASI", permissions: ["service:assign"] },
      managedWarehouse: null,
    },
    [SE_ID]: {
      id: SE_ID,
      email: "se@example.com",
      name: "Service Engineer",
      isActive: true,
      userType: "internal",
      role: { name: "Service Engineer", permissions: ["service:workflow"] },
      managedWarehouse: null,
    },
    [SALES_ID]: {
      id: SALES_ID,
      email: "sales@example.com",
      name: "Sales User",
      isActive: true,
      userType: "internal",
      role: { name: "Sales", permissions: [] },
      managedWarehouse: null,
    },
    ...opts?.users,
  };

  const complaint = {
    id: "11111111-1111-4111-8111-111111111111",
    orgId: "org-A",
    status: opts?.complaint?.status ?? "raised",
    assignments: opts?.complaint?.latestAsiUserId !== undefined || opts?.complaint?.latestSeUserId !== undefined
      ? [{
          asiUserId: opts.complaint.latestAsiUserId ?? null,
          seUserId: opts.complaint.latestSeUserId ?? null,
        }]
      : [],
  };

  const fakePrisma: any = {
    user: {
      findUnique: async (args: { where: { id: string } }) => users[args.where.id] ?? null,
      findMany: async () => Object.values(users),
    },
    serviceComplaint: {
      findFirst: async (args: { where: any }) => {
        const filters = args.where.AND ?? [args.where];
        const requested = filters.find((filter: any) => typeof filter.id === "string")?.id;
        const scopedIds = filters.find((filter: any) => filter.id?.in)?.id.in as string[] | undefined;
        const orgId = filters.find((filter: any) => filter.orgId)?.orgId;
        if (requested !== complaint.id || orgId !== "org-A") return null;
        if (scopedIds && !scopedIds.includes(complaint.id)) return null;
        return complaint;
      },
      update: async (args: { data: Record<string, unknown> }) => {
        opts?.onComplaintUpdate?.(args.data);
        return { id: complaint.id, status: "assigned" };
      },
    },
    serviceAssignmentHistory: {
      findMany: async () => complaint.assignments.map((assignment) => ({
        complaintId: complaint.id,
        ...assignment,
      })),
      create: async (args: { data: Record<string, unknown> }) => ({
        id: "assignment-1",
        createdAt: new Date("2026-05-26T00:00:00.000Z"),
        ...args.data,
      }),
    },
    serviceComplaintActivity: {
      create: async () => ({}),
    },
    auditLog: {
      create: async () => ({}),
    },
  };
  fakePrisma.$transaction = async (cb: (tx: typeof fakePrisma) => Promise<unknown>) => cb(fakePrisma);

  return {
    requestId: "test-req",
    actor: { id: actorId, orgId: "org-A", sessionId: "sess-1" },
    serviceUser: null,
    prisma: fakePrisma as TrpcContext["prisma"],
    permissions: SUPER_PERMS,
    managedWarehouseId: null,
    userType: "internal",
    linkedOutletId: null,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: [],
    sourceIp: "127.0.0.1",
  };
}

async function expectTrpcCode(promise: Promise<unknown>, code: TRPCError["code"]) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof TRPCError) {
      expect(err.code).toBe(code);
      return;
    }
    throw err;
  }
  throw new Error(`expected TRPCError(${code}) but procedure resolved`);
}

describe("service assignment role boundaries", () => {
  it("initial assignment requires an ASI user", async () => {
    const caller = serviceAssignmentsRouter.createCaller(makeCtx());

    await expectTrpcCode(
      caller.assign({
        complaintId: "11111111-1111-4111-8111-111111111111",
        asiUserId: SALES_ID,
      }),
      "BAD_REQUEST",
    );
  });

  it("initial assignment appoints an ASI and moves raised complaint to assigned", async () => {
    let updateData: Record<string, unknown> | undefined;
    const caller = serviceAssignmentsRouter.createCaller(makeCtx({
      onComplaintUpdate: (data) => { updateData = data; },
    }));

    const result = await caller.assign({
      complaintId: "11111111-1111-4111-8111-111111111111",
      asiUserId: ASI_ID,
      note: null,
    });

    expect(result.asiUserId).toBe(ASI_ID);
    expect(result.seUserId).toBeNull();
    expect(result.action).toBe("assign");
    expect(updateData?.status).toBe("assigned");
    expect(updateData?.assignedAt).toBeInstanceOf(Date);
  });

  it("cannot assign a service engineer before an ASI owns the complaint", async () => {
    const caller = serviceAssignmentsRouter.createCaller(makeCtx());

    await expectTrpcCode(
      caller.reassign({
        complaintId: "11111111-1111-4111-8111-111111111111",
        seUserId: SE_ID,
      }),
      "CONFLICT",
    );
  });

  it("ASI can assign service engineers only on complaints assigned to that ASI", async () => {
    const caller = serviceAssignmentsRouter.createCaller(
      makeCtx({
        actorId: ASI_ID,
        complaint: { status: "assigned", latestAsiUserId: OTHER_ASI_ID },
      }),
    );

    await expectTrpcCode(
      caller.reassign({
        complaintId: "11111111-1111-4111-8111-111111111111",
        seUserId: SE_ID,
      }),
      "NOT_FOUND",
    );
  });
});
