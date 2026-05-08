import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type HeadersMap = Record<string, string>;

const ROOT_DIR = path.resolve(import.meta.dir, "../..");
const SNAPSHOT_DIR = path.join(ROOT_DIR, "plan/phase-gates/snapshots");
const BASE_URL = process.env.PHASE2_BASE_URL ?? "http://127.0.0.1:3002";

const ACTOR_ADMIN = "21000000-0000-4000-8000-000000000001";
const IDS = {
  warehouse: "31000000-0000-4000-8000-000000000001",
  outlet: "81000000-0000-4000-8000-000000000001",
  productA: "61000000-0000-4000-8000-000000000001",
  productB: "61000000-0000-4000-8000-000000000002"
} as const;

async function saveSnapshot(name: string, payload: unknown) {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const file = path.join(SNAPSHOT_DIR, name);
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function trpcQuery(procedure: string, input: unknown, headers?: HeadersMap) {
  const query = encodeURIComponent(JSON.stringify(input));
  const res = await fetch(`${BASE_URL}/trpc/${procedure}?input=${query}`, {
    method: "GET",
    headers
  });
  return res.json();
}

async function trpcMutation(procedure: string, input: unknown, headers?: HeadersMap) {
  const res = await fetch(`${BASE_URL}/trpc/${procedure}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers ?? {})
    },
    body: JSON.stringify({ json: input })
  });
  return res.json();
}

function getData(response: any) {
  if (response?.error) {
    throw new Error(JSON.stringify(response.error));
  }
  return response?.result?.data?.json;
}

async function main() {
  const goodsReceipt = await trpcMutation(
    "inventory.createGoodsReceipt",
    {
      warehouseId: IDS.warehouse,
      sourceType: "manual",
      sourceBatchId: "PHASE2-GRN-001",
      receiptDate: "2026-05-08T00:00:00.000Z",
      notes: "Phase2 smoke receipt",
      lines: [
        { productId: IDS.productA, qtyReceived: 50 },
        { productId: IDS.productB, qtyReceived: 20 }
      ]
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase2_inventory_createGoodsReceipt.json", goodsReceipt);

  const stockAdjustment = await trpcMutation(
    "inventory.createStockAdjustment",
    {
      warehouseId: IDS.warehouse,
      productId: IDS.productA,
      adjustmentQty: -5,
      reason: "Damaged units"
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase2_inventory_createStockAdjustment.json", stockAdjustment);

  const stockList = await trpcQuery(
    "inventory.stockList",
    { warehouseId: IDS.warehouse, limit: 20 },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase2_inventory_stockList.json", stockList);

  const orderCreate = await trpcMutation(
    "orders.create",
    {
      outletId: IDS.outlet,
      orderDate: "2026-05-08T01:00:00.000Z",
      deliveryAddress: "Phase2 Delivery Address",
      priority: "high",
      notes: "Phase2 smoke order",
      lines: [
        { productId: IDS.productA, qtyOrdered: 3, unitPrice: "1200.00" },
        { productId: IDS.productB, qtyOrdered: 2, unitPrice: "2200.00" }
      ]
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase2_orders_create.json", orderCreate);
  const orderId = getData(orderCreate).id as string;

  const orderList = await trpcQuery(
    "orders.list",
    { outletId: IDS.outlet, limit: 20 },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase2_orders_list.json", orderList);

  const orderGet = await trpcQuery("orders.getById", { id: orderId }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase2_orders_getById.json", orderGet);

  const orderHold = await trpcMutation(
    "orders.transition",
    { id: orderId, action: "hold", note: "Need manager review" },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase2_orders_transition_hold.json", orderHold);

  const orderApprove = await trpcMutation(
    "orders.transition",
    { id: orderId, action: "approve", note: "Approved after review" },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase2_orders_transition_approve.json", orderApprove);

  const orderCancel = await trpcMutation(
    "orders.transition",
    { id: orderId, action: "cancel", note: "Customer requested cancellation" },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase2_orders_transition_cancel.json", orderCancel);

  const orderCreateRejected = await trpcMutation(
    "orders.create",
    {
      outletId: IDS.outlet,
      orderDate: "2026-05-08T02:00:00.000Z",
      deliveryAddress: "Phase2 Delivery Address 2",
      priority: "medium",
      notes: "Phase2 order to reject",
      lines: [{ productId: IDS.productA, qtyOrdered: 1, unitPrice: "1200.00" }]
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase2_orders_create_rejectPath.json", orderCreateRejected);
  const rejectOrderId = getData(orderCreateRejected).id as string;

  const orderReject = await trpcMutation(
    "orders.transition",
    { id: rejectOrderId, action: "reject", note: "Credit policy fail" },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase2_orders_transition_reject.json", orderReject);

  await saveSnapshot("phase2_smoke_summary.json", {
    status: "ok",
    baseUrl: BASE_URL,
    orderId,
    rejectOrderId,
    generatedAt: new Date().toISOString()
  });

  console.log("phase2 smoke client completed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
