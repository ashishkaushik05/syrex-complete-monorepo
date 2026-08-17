import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import { P } from "../../rbac/catalog";
import { dispatchesRouter } from "./dispatches";
import { ACTOR_ID, makeCtx, OUTLET_A, OUTLET_B, WAREHOUSE_A, WAREHOUSE_B } from "./__testkit__";

type DispatchRow = {
  id: string;
  warehouseId: string;
  transporterName: string;
  vehicleNumber: string;
  lrNumber: string | null;
  dispatchDate: Date;
  estimatedDelivery: Date | null;
  deliveredAt: Date | null;
  deliveryStatus: "created" | "in_transit" | "delivered";
  createdById: string;
  createdAt: Date;
  outletId: string;
  lines: Array<{
    id: string;
    orderLineId: string;
    productId: string;
    sku: string;
    qtyDispatched: number;
    serialNumbers: Prisma.JsonValue;
    orderLine: { orderId: string };
  }>;
};

const DISPATCH_A = "77777777-7777-4777-8777-777777777777";
const DISPATCH_B = "88888888-8888-4888-8888-888888888888";

function makeDispatch(
  id: string,
  outletId: string,
  warehouseId: string,
  deliveryStatus: "created" | "in_transit" | "delivered" = "created",
): DispatchRow {
  return {
    id,
    warehouseId,
    transporterName: "Transporter",
    vehicleNumber: "KA-01-AB-1234",
    lrNumber: null,
    dispatchDate: new Date("2026-05-20T10:00:00.000Z"),
    estimatedDelivery: null,
    deliveredAt: null,
    deliveryStatus,
    createdById: ACTOR_ID,
    createdAt: new Date("2026-05-20T10:00:00.000Z"),
    outletId,
    lines: [
      {
        id: `line-${id}`,
        orderLineId: `ol-${id}`,
        productId: "99999999-9999-4999-8999-999999999999",
        sku: "SKU-1",
        qtyDispatched: 1,
        serialNumbers: [],
        orderLine: { orderId: `order-${id}` },
      },
    ],
  };
}

function matchesWhere(dispatch: DispatchRow, where: any): boolean {
  if (!where) return true;
  if (where.AND && Array.isArray(where.AND)) {
    return where.AND.every((clause: any) => matchesWhere(dispatch, clause));
  }
  if (where.OR && Array.isArray(where.OR)) {
    return where.OR.some((clause: any) => matchesWhere(dispatch, clause));
  }
  if (where.id && dispatch.id !== where.id) return false;
  if (where.warehouseId && dispatch.warehouseId !== where.warehouseId) return false;
  if (where.deliveryStatus && dispatch.deliveryStatus !== where.deliveryStatus) return false;
  if (where.lines?.some?.orderLine?.order?.outletId) {
    if (dispatch.outletId !== where.lines.some.orderLine.order.outletId) return false;
  }
  return true;
}

function createCaller(opts: {
  permissions: string[];
  linkedOutletId: string | null;
  managedWarehouseId: string | null;
  dispatches: DispatchRow[];
  actorOrgId?: string | null;
}) {
  const prisma = {
    user: {
      findUnique: async (args: any) => {
        if (args.include?.role) {
          return {
            id: ACTOR_ID,
            isActive: true,
            role: { permissions: opts.permissions },
            managedWarehouse: opts.managedWarehouseId ? { id: opts.managedWarehouseId } : null,
          };
        }
        return { id: ACTOR_ID };
      },
    },
    outlet: {
      findUnique: async (args: any) => {
        if (args.where?.userId) {
          return opts.linkedOutletId ? { id: opts.linkedOutletId } : null;
        }
        return null;
      },
    },
    dispatch: {
      findMany: async (args: any) => {
        const filtered = opts.dispatches
          .filter((dispatch) => matchesWhere(dispatch, args.where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
        const start = args.skip ?? 0;
        const end = start + (args.take ?? filtered.length);
        return filtered.slice(start, end);
      },
      findFirst: async (args: any) => {
        return opts.dispatches.find((dispatch) => matchesWhere(dispatch, args.where)) ?? null;
      },
      findUnique: async (args: any) => {
        return opts.dispatches.find((dispatch) => dispatch.id === args.where?.id) ?? null;
      },
      update: async (args: any) => {
        const d = opts.dispatches.find((dispatch) => dispatch.id === args.where?.id)!;
        return {
          ...d,
          deliveryStatus: args.data.deliveryStatus ?? d.deliveryStatus,
          deliveredAt: args.data.deliveredAt ?? d.deliveredAt,
          // markDelivered's include reaches orderLine.order; markInTransit only orderLine.orderId.
          // Provide both so toDispatchItem and the complaint-resolution scan both resolve.
          lines: d.lines.map((line) => ({
            ...line,
            orderLine: {
              orderId: line.orderLine.orderId,
              order: { id: line.orderLine.orderId, orderType: "sale", sourceComplaintId: null },
            },
          })),
        };
      },
    },
    dispatchLine: {
      findFirst: async (args: any) => {
        const outletId = args.where?.orderLine?.order?.outletId;
        const dispatchId = args.where?.dispatchId;
        const d = opts.dispatches.find((dispatch) => dispatch.id === dispatchId);
        if (d && (!outletId || d.outletId === outletId)) return { id: `line-${dispatchId}` };
        return null;
      },
    },
    dispatchTimeline: {
      findMany: async (args: any) => [
        {
          id: "timeline-1",
          dispatchId: args.where.dispatchId,
          status: "created",
          actorId: ACTOR_ID,
          actorRole: "warehouse",
          note: null,
          happenedAt: new Date("2026-05-20T10:05:00.000Z"),
        },
      ],
      create: async () => ({ id: "timeline-new" }),
    },
  };

  (prisma as any).$transaction = async (fn: any) => fn(prisma);

  return dispatchesRouter.createCaller(
    makeCtx({
      actorId: ACTOR_ID,
      actorOrgId: opts.actorOrgId ?? null,
      prisma,
      permissions: opts.permissions,
      managedWarehouseId: opts.managedWarehouseId,
      linkedOutletId: opts.linkedOutletId,
    }),
  );
}

describe("dispatches route scoping", () => {
  const dispatches = [
    makeDispatch(DISPATCH_A, OUTLET_A, WAREHOUSE_A, "created"),
    makeDispatch(DISPATCH_B, OUTLET_B, WAREHOUSE_B, "in_transit"),
  ];

  it("outlet-linked users only list dispatches for their outlet", async () => {
    const caller = createCaller({
      permissions: [P.dispatches.read],
      linkedOutletId: OUTLET_A,
      managedWarehouseId: null,
      dispatches,
    });

    const result = await caller.list({ limit: 25 });
    expect(result.items.map((item) => item.id)).toEqual([DISPATCH_A]);
  });

  it("getById returns NOT_FOUND for linked outlet user outside own outlet scope", async () => {
    const caller = createCaller({
      permissions: [P.dispatches.read],
      linkedOutletId: OUTLET_A,
      managedWarehouseId: null,
      dispatches,
    });

    await expect(caller.getById({ id: DISPATCH_B })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("internal users with no derivable safe scope are forbidden in list", async () => {
    const caller = createCaller({
      permissions: [P.dispatches.read],
      linkedOutletId: null,
      managedWarehouseId: null,
      dispatches,
      actorOrgId: "99999999-9999-4999-8999-999999999999",
    });

    await expect(caller.list({ limit: 25 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ── Phase 3 ASVF hardening (DEC-20260613-010) ────────────────────────────────

const ADMIN = ["*"];

describe("dispatches auth gates (DEC-20260613-010)", () => {
  const base = { permissions: [] as string[], linkedOutletId: null, managedWarehouseId: null, dispatches: [] as DispatchRow[] };

  it("list requires dispatches:read", async () => {
    await expect(createCaller(base).list({ limit: 25 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("markInTransit requires dispatches:write", async () => {
    await expect(createCaller(base).markInTransit({ id: DISPATCH_A })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("markDelivered requires dispatches:deliver", async () => {
    await expect(createCaller(base).markDelivered({ id: DISPATCH_A })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("dispatches.markInTransit state machine (DEC-20260613-010)", () => {
  it("moves a created dispatch to in_transit (Happy)", async () => {
    const caller = createCaller({
      permissions: ADMIN,
      linkedOutletId: null,
      managedWarehouseId: null,
      dispatches: [makeDispatch(DISPATCH_A, OUTLET_A, WAREHOUSE_A, "created")],
    });
    const out = await caller.markInTransit({ id: DISPATCH_A, note: "left depot" });
    expect(out.deliveryStatus).toBe("in_transit");
  });

  it("rejects the in_transit→in_transit transition (Failure)", async () => {
    const caller = createCaller({
      permissions: ADMIN,
      linkedOutletId: null,
      managedWarehouseId: null,
      dispatches: [makeDispatch(DISPATCH_A, OUTLET_A, WAREHOUSE_A, "in_transit")],
    });
    await expect(caller.markInTransit({ id: DISPATCH_A })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects the delivered→in_transit backward transition (Failure)", async () => {
    const caller = createCaller({
      permissions: ADMIN,
      linkedOutletId: null,
      managedWarehouseId: null,
      dispatches: [makeDispatch(DISPATCH_A, OUTLET_A, WAREHOUSE_A, "delivered")],
    });
    await expect(caller.markInTransit({ id: DISPATCH_A })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("returns NOT_FOUND for an unknown dispatch (Failure)", async () => {
    const caller = createCaller({
      permissions: ADMIN,
      linkedOutletId: null,
      managedWarehouseId: null,
      dispatches: [],
    });
    await expect(caller.markInTransit({ id: DISPATCH_A })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("forbids a warehouse manager updating another warehouse's dispatch (Scope)", async () => {
    const caller = createCaller({
      permissions: [P.dispatches.write],
      linkedOutletId: null,
      managedWarehouseId: WAREHOUSE_B,
      dispatches: [makeDispatch(DISPATCH_A, OUTLET_A, WAREHOUSE_A, "created")],
    });
    await expect(caller.markInTransit({ id: DISPATCH_A })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a non-uuid id (Validation)", async () => {
    const caller = createCaller({ permissions: ADMIN, linkedOutletId: null, managedWarehouseId: null, dispatches: [] });
    await expect(caller.markInTransit({ id: "not-a-uuid" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("dispatches.markDelivered state machine (DEC-20260613-010)", () => {
  it("delivers an in_transit dispatch and stamps deliveredAt (Happy)", async () => {
    const caller = createCaller({
      permissions: ADMIN,
      linkedOutletId: null,
      managedWarehouseId: null,
      dispatches: [makeDispatch(DISPATCH_A, OUTLET_A, WAREHOUSE_A, "in_transit")],
    });
    const out = await caller.markDelivered({ id: DISPATCH_A, deliveredAt: "2026-05-21T12:00:00.000Z" });
    expect(out.deliveryStatus).toBe("delivered");
    expect(out.deliveredAt).toBe("2026-05-21T12:00:00.000Z");
  });

  it("allows delivering straight from created (Happy)", async () => {
    const caller = createCaller({
      permissions: ADMIN,
      linkedOutletId: null,
      managedWarehouseId: null,
      dispatches: [makeDispatch(DISPATCH_A, OUTLET_A, WAREHOUSE_A, "created")],
    });
    const out = await caller.markDelivered({ id: DISPATCH_A });
    expect(out.deliveryStatus).toBe("delivered");
  });

  it("rejects re-delivering an already-delivered dispatch (Failure)", async () => {
    const caller = createCaller({
      permissions: ADMIN,
      linkedOutletId: null,
      managedWarehouseId: null,
      dispatches: [makeDispatch(DISPATCH_A, OUTLET_A, WAREHOUSE_A, "delivered")],
    });
    await expect(caller.markDelivered({ id: DISPATCH_A })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lets the receiving outlet user confirm delivery of its own dispatch (Scope happy)", async () => {
    const caller = createCaller({
      permissions: [P.dispatches.deliver],
      linkedOutletId: OUTLET_A,
      managedWarehouseId: null,
      dispatches: [makeDispatch(DISPATCH_A, OUTLET_A, WAREHOUSE_A, "in_transit")],
    });
    const out = await caller.markDelivered({ id: DISPATCH_A });
    expect(out.deliveryStatus).toBe("delivered");
  });

  it("forbids an outlet user confirming a dispatch that is not theirs (Scope)", async () => {
    const caller = createCaller({
      permissions: [P.dispatches.deliver],
      linkedOutletId: OUTLET_B,
      managedWarehouseId: null,
      dispatches: [makeDispatch(DISPATCH_A, OUTLET_A, WAREHOUSE_A, "in_transit")],
    });
    await expect(caller.markDelivered({ id: DISPATCH_A })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns NOT_FOUND for an unknown dispatch (Failure)", async () => {
    const caller = createCaller({ permissions: ADMIN, linkedOutletId: null, managedWarehouseId: null, dispatches: [] });
    await expect(caller.markDelivered({ id: DISPATCH_A })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
