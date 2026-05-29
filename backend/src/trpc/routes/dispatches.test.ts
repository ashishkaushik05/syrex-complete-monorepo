import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import { P } from "../../rbac/catalog";
import { dispatchesRouter } from "./dispatches";

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

const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUTLET_A = "11111111-1111-4111-8111-111111111111";
const OUTLET_B = "22222222-2222-4222-8222-222222222222";
const WAREHOUSE_A = "33333333-3333-4333-8333-333333333333";
const WAREHOUSE_B = "44444444-4444-4444-8444-444444444444";
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
    },
  };

  return dispatchesRouter.createCaller({
    requestId: "test",
    actor: { id: ACTOR_ID, orgId: opts.actorOrgId ?? null, sessionId: null },
    prisma: prisma as any,
    permissions: [],
    managedWarehouseId: null,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: [],
    sourceIp: "203.0.113.10",
  } as any);
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
