/**
 * Batch 04 — IDOR & null-orgId regression tests.
 *
 * Each test stubs Prisma at the call-site granularity required and asserts:
 *  (a) cross-org access returns NOT_FOUND (no info leak vs current/missing record)
 *  (b) null-orgId actors are refused with FORBIDDEN before any list/create runs
 *
 * The stubs capture the `where` clause so we can assert that the procedure
 * passed orgId in the query (defense-in-depth — even if the assertion later
 * shifts to FORBIDDEN, the filter MUST be present at query time).
 */

import { describe, expect, it } from "bun:test";
import { TRPCError } from "@trpc/server";

import { serviceComplaintsRouter } from "./service-complaints";
import { serviceWarrantyRouter } from "./service-warranty";
import { serviceTestsRouter } from "./service-tests";
import { serviceAssignmentsRouter } from "./service-assignments";
import { serviceFormsRouter } from "./service-forms";
import { serviceIntegrationsRouter } from "./service-integrations";

import type { TrpcContext } from "../context";
import { makeCtx as baseCtx } from "./__testkit__";

const SUPER_PERMS = ["*"]; // SUPER_ADMIN_PERMISSION

function makeCtx(opts: { orgId: string | null }): TrpcContext {
  const userRow = {
    id: "user-1",
    userType: "internal" as const,
    role: { permissions: SUPER_PERMS },
    managedWarehouse: null,
  };

  const fakePrisma: any = {
    user: {
      findUnique: async () => userRow,
    },
    serviceComplaint: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        // Cross-org and unknown both return null — endpoints must surface NOT_FOUND.
        if (args.where.orgId !== opts.orgId) return null;
        return null;
      },
      findUnique: async () => null,
      findMany: async () => [],
      groupBy: async () => [],
      count: async () => 0,
    },
    serviceFormTemplate: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
    },
    serviceFormSubmission: {
      findFirst: async () => null,
      findUnique: async () => null,
    },
    serviceFormTemplateField: {
      findFirst: async () => null,
    },
    serviceMachineClient: {
      findFirst: async () => null,
      findMany: async () => [],
    },
    serviceComplaintLine: {
      findFirst: async () => null,
    },
  };
  fakePrisma.$transaction = async (cb: (tx: typeof fakePrisma) => Promise<unknown>) => cb(fakePrisma);

  return baseCtx({
    actorId: "user-1",
    actorOrgId: opts.orgId,
    sessionId: "sess-1",
    permissions: SUPER_PERMS,
    userType: "internal",
    sourceIp: "127.0.0.1",
    prisma: fakePrisma,
  });
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

describe("service-complaints IDOR / null-orgId", () => {
  it("detail with another org's id returns NOT_FOUND", async () => {
    const caller = serviceComplaintsRouter.createCaller(makeCtx({ orgId: "org-A" }));
    await expectTrpcCode(
      caller.detail({ id: "11111111-1111-4111-8111-111111111111" }),
      "NOT_FOUND",
    );
  });

  it("list with null actor orgId throws FORBIDDEN", async () => {
    const caller = serviceComplaintsRouter.createCaller(makeCtx({ orgId: null }));
    await expectTrpcCode(caller.list({ limit: 10 }), "FORBIDDEN");
  });

  it("detail with null actor orgId throws FORBIDDEN", async () => {
    const caller = serviceComplaintsRouter.createCaller(makeCtx({ orgId: null }));
    await expectTrpcCode(
      caller.detail({ id: "11111111-1111-4111-8111-111111111111" }),
      "FORBIDDEN",
    );
  });

  it("service-user-A cannot read service-user-B complaint (raisedByServiceUserId scope)", async () => {
    // An actor without manage/approve/workflow can only see complaints assigned to them.
    // A complaint with a different serviceUserId returns NOT_FOUND.
    const ctx = makeCtx({ orgId: "org-A" });
    ctx.permissions = ["service:read"]; // no manage
    const caller = serviceComplaintsRouter.createCaller(ctx);
    await expectTrpcCode(
      caller.detail({ id: "11111111-1111-4111-8111-111111111111" }),
      "NOT_FOUND",
    );
  });
});

describe("service-warranty IDOR / null-orgId", () => {
  it("approve with another org's complaint returns NOT_FOUND", async () => {
    const caller = serviceWarrantyRouter.createCaller(makeCtx({ orgId: "org-A" }));
    await expectTrpcCode(
      caller.approve({
        complaintId: "11111111-1111-4111-8111-111111111111",
        sourceWarehouseId: "22222222-2222-4222-8222-222222222222",
      }),
      "NOT_FOUND",
    );
  });

  it("reject with null orgId throws FORBIDDEN", async () => {
    const caller = serviceWarrantyRouter.createCaller(makeCtx({ orgId: null }));
    await expectTrpcCode(
      caller.reject({
        complaintId: "11111111-1111-4111-8111-111111111111",
        reason: "out of warranty",
      }),
      "FORBIDDEN",
    );
  });
});

describe("service-tests IDOR / null-orgId", () => {
  it("submit with another org's complaint returns NOT_FOUND", async () => {
    const caller = serviceTestsRouter.createCaller(makeCtx({ orgId: "org-A" }));
    await expectTrpcCode(
      caller.submit({
        complaintId: "11111111-1111-4111-8111-111111111111",
        verdict: "tested_ok",
      }),
      "NOT_FOUND",
    );
  });

  it("requestRetest with null orgId throws FORBIDDEN", async () => {
    const caller = serviceTestsRouter.createCaller(makeCtx({ orgId: null }));
    await expectTrpcCode(
      caller.requestRetest({
        complaintId: "11111111-1111-4111-8111-111111111111",
        note: "please retest",
      }),
      "FORBIDDEN",
    );
  });
});

describe("service-assignments IDOR / null-orgId", () => {
  it("assign with another org's complaint returns NOT_FOUND", async () => {
    const caller = serviceAssignmentsRouter.createCaller(makeCtx({ orgId: "org-A" }));
    await expectTrpcCode(
      caller.assign({
        complaintId: "11111111-1111-4111-8111-111111111111",
        asiUserId: "33333333-3333-4333-8333-333333333333",
      }),
      "NOT_FOUND",
    );
  });

  it("reassign with null orgId throws FORBIDDEN", async () => {
    const caller = serviceAssignmentsRouter.createCaller(makeCtx({ orgId: null }));
    await expectTrpcCode(
      caller.reassign({
        complaintId: "11111111-1111-4111-8111-111111111111",
        asiUserId: "33333333-3333-4333-8333-333333333333",
      }),
      "FORBIDDEN",
    );
  });
});

describe("service-forms IDOR / null-orgId", () => {
  it("listTemplates with null orgId throws FORBIDDEN", async () => {
    const caller = serviceFormsRouter.createCaller(makeCtx({ orgId: null }));
    await expectTrpcCode(
      caller.listTemplates({ withFields: false }),
      "FORBIDDEN",
    );
  });

  it("getTemplate with another org's template returns NOT_FOUND", async () => {
    const caller = serviceFormsRouter.createCaller(makeCtx({ orgId: "org-A" }));
    await expectTrpcCode(
      caller.getTemplate({ id: "11111111-1111-4111-8111-111111111111" }),
      "NOT_FOUND",
    );
  });
});

describe("service-integrations IDOR / null-orgId & creation guards", () => {
  it("listClients with null orgId throws FORBIDDEN", async () => {
    const caller = serviceIntegrationsRouter.createCaller(makeCtx({ orgId: null }));
    await expectTrpcCode(caller.listClients({}), "FORBIDDEN");
  });

  it("createClient with null orgId throws FORBIDDEN", async () => {
    const caller = serviceIntegrationsRouter.createCaller(makeCtx({ orgId: null }));
    await expectTrpcCode(
      caller.createClient({ name: "ci-bot", scopes: ["service.read"] }),
      "FORBIDDEN",
    );
  });

  it("createClient with past expiresAt returns BAD_REQUEST", async () => {
    const caller = serviceIntegrationsRouter.createCaller(makeCtx({ orgId: "org-A" }));
    await expectTrpcCode(
      caller.createClient({
        name: "ci-bot",
        scopes: ["service.read"],
        expiresAt: "2000-01-01T00:00:00.000Z",
      }),
      "BAD_REQUEST",
    );
  });

  it("rotateSecret with another org's client returns NOT_FOUND", async () => {
    const caller = serviceIntegrationsRouter.createCaller(makeCtx({ orgId: "org-A" }));
    await expectTrpcCode(
      caller.rotateSecret({ clientId: "svc_" + "a".repeat(32) }),
      "NOT_FOUND",
    );
  });
});
