import type { TrpcContext } from "../../context";
import { ACTOR_ID } from "./ids";

// The shared context factory. Identity lives on `ctx`, NEVER through the prisma mock —
// production builds ctx exactly this way (app.ts:resolveActorFromBearer →
// context.ts:createRequestContext), and the scope helpers + perm() middleware read
// identity only from ctx. A harness that populates identity through prisma tests a
// fiction (see plan/testing/TEST_STRATEGY.md §4).
//
// The prisma mock is for DATA (rows the endpoint reads), never for identity.

export type CtxOverrides = {
  actorId?: string | null;
  actorOrgId?: string | null;
  sessionId?: string | null;
  permissions?: string[];
  managedWarehouseId?: string | null;
  linkedOutletId?: string | null;
  userType?: string | null;
  prisma?: unknown;
  serviceUser?: TrpcContext["serviceUser"];
  serviceClientId?: string | null;
  serviceClientSecret?: string | null;
  serviceScopes?: string[];
  requestId?: string;
  sourceIp?: string;
};

export function makeCtx(overrides: CtxOverrides = {}): TrpcContext {
  return {
    requestId: overrides.requestId ?? "test-req",
    actor: {
      id: overrides.actorId === undefined ? ACTOR_ID : overrides.actorId,
      orgId: overrides.actorOrgId ?? null,
      sessionId: overrides.sessionId ?? null,
    },
    serviceUser: overrides.serviceUser ?? null,
    prisma: (overrides.prisma ?? {}) as TrpcContext["prisma"],
    permissions: overrides.permissions ?? [],
    managedWarehouseId: overrides.managedWarehouseId ?? null,
    userType: overrides.userType ?? null,
    linkedOutletId: overrides.linkedOutletId ?? null,
    serviceClientId: overrides.serviceClientId ?? null,
    serviceClientSecret: overrides.serviceClientSecret ?? null,
    serviceScopes: overrides.serviceScopes ?? [],
    sourceIp: overrides.sourceIp ?? "203.0.113.10",
  } as unknown as TrpcContext;
}
