import { describe, expect, it } from "bun:test";
import { P } from "../../rbac/catalog";
import { outletPortalRouter } from "./outlet-portal";

const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUTLET_A = "11111111-1111-4111-8111-111111111111";
const OUTLET_B = "22222222-2222-4222-8222-222222222222";
const DISPATCH_A = "33333333-3333-4333-8333-333333333333";
const DISPATCH_B = "44444444-4444-4444-8444-444444444444";

type DispatchRow = {
  id: string;
  outletId: string;
  dispatchDate: Date;
  deliveryStatus: string;
  transporterName: string;
  vehicleNumber: string;
  lrNumber: string | null;
  estimatedDelivery: Date | null;
  deliveredAt: Date | null;
};

function createCaller(linkedOutletId: string, dispatches: DispatchRow[]) {
  const prisma = {
    user: {
      findUnique: async () => ({
        id: ACTOR_ID,
        isActive: true,
        role: { permissions: [P.dispatches.read] },
        managedWarehouse: null,
      }),
    },
    outlet: {
      findFirst: async (args: any) =>
        args.where?.id === linkedOutletId && args.where?.userId === ACTOR_ID
          ? { id: linkedOutletId }
          : null,
      findUnique: async (args: any) =>
        args.where?.userId === ACTOR_ID ? { id: linkedOutletId } : null,
    },
    dispatch: {
      findMany: async (args: any) => {
        const outletId = args.where?.lines?.some?.orderLine?.order?.outletId;
        const filtered = dispatches
          .filter((dispatch) => dispatch.outletId === outletId)
          .sort(
            (a, b) =>
              b.dispatchDate.getTime() - a.dispatchDate.getTime() ||
              b.id.localeCompare(a.id),
          );
        const start = args.skip ?? 0;
        return filtered.slice(start, start + (args.take ?? filtered.length));
      },
    },
  };

  return outletPortalRouter.createCaller({
    requestId: "outlet-portal-test",
    actor: { id: ACTOR_ID, orgId: null, sessionId: null },
    prisma: prisma as any,
    permissions: [P.dispatches.read],
    managedWarehouseId: null,
    linkedOutletId,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: [],
    sourceIp: "203.0.113.10",
  } as any);
}

describe("outletPortal.dispatchHistory", () => {
  const dispatches: DispatchRow[] = [
    {
      id: DISPATCH_A,
      outletId: OUTLET_A,
      dispatchDate: new Date("2026-06-05T10:00:00.000Z"),
      deliveryStatus: "in_transit",
      transporterName: "Routebook Logistics",
      vehicleNumber: "KA-01-AB-1234",
      lrNumber: "LR-001",
      estimatedDelivery: new Date("2026-06-07T10:00:00.000Z"),
      deliveredAt: null,
    },
    {
      id: DISPATCH_B,
      outletId: OUTLET_B,
      dispatchDate: new Date("2026-06-04T10:00:00.000Z"),
      deliveryStatus: "created",
      transporterName: "Other Logistics",
      vehicleNumber: "KA-02-CD-5678",
      lrNumber: null,
      estimatedDelivery: null,
      deliveredAt: null,
    },
  ];

  it("returns only the linked outlet dispatches in the mobile response shape", async () => {
    const caller = createCaller(OUTLET_A, dispatches);

    const result = await caller.dispatchHistory({
      outletId: OUTLET_A,
      limit: 20,
    });

    expect(result).toEqual({
      items: [
        {
          id: DISPATCH_A,
          dispatchDate: "2026-06-05T10:00:00.000Z",
          deliveryStatus: "in_transit",
          transporterName: "Routebook Logistics",
          vehicleNumber: "KA-01-AB-1234",
          lrNumber: "LR-001",
          estimatedDelivery: "2026-06-07T10:00:00.000Z",
          deliveredAt: null,
        },
      ],
      nextCursor: null,
    });
  });

  it("rejects another outlet id", async () => {
    const caller = createCaller(OUTLET_A, dispatches);

    await expect(
      caller.dispatchHistory({ outletId: OUTLET_B, limit: 20 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
