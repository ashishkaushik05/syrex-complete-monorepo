import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type HeadersMap = Record<string, string>;

const ROOT_DIR = path.resolve(import.meta.dir, "../..");
const SNAPSHOT_DIR = path.join(ROOT_DIR, "plan/phase-gates/snapshots");
const BASE_URL = process.env.PHASE3_BASE_URL ?? "http://127.0.0.1:3003";

const ACTOR_ADMIN = "22000000-0000-4000-8000-000000000001";
const IDS = {
  warehouse: "32000000-0000-4000-8000-000000000001",
  outlet: "82000000-0000-4000-8000-000000000001",
  productA: "62000000-0000-4000-8000-000000000001",
  productB: "62000000-0000-4000-8000-000000000002"
} as const;

async function saveSnapshot(name: string, payload: unknown) {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const file = path.join(SNAPSHOT_DIR, name);
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function trpcQuery(procedure: string, input: unknown, headers?: HeadersMap) {
  const query = encodeURIComponent(JSON.stringify({ json: input }));
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
      sourceBatchId: "PHASE3-GRN-001",
      receiptDate: "2026-05-08T00:00:00.000Z",
      notes: "Phase3 stock bootstrap",
      lines: [
        { productId: IDS.productA, qtyReceived: 30 },
        { productId: IDS.productB, qtyReceived: 20 }
      ]
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase3_inventory_createGoodsReceipt.json", goodsReceipt);

  const orderCreate = await trpcMutation(
    "orders.create",
    {
      outletId: IDS.outlet,
      orderDate: "2026-05-08T01:00:00.000Z",
      deliveryAddress: "Phase3 Delivery Address",
      priority: "high",
      notes: "Phase3 order",
      lines: [
        { productId: IDS.productA, qtyOrdered: 4, unitPrice: "1500.00" },
        { productId: IDS.productB, qtyOrdered: 3, unitPrice: "2300.00" }
      ]
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase3_orders_create.json", orderCreate);

  const orderId = getData(orderCreate).id as string;

  const orderApprove = await trpcMutation(
    "orders.transition",
    { id: orderId, action: "approve", note: "Phase3 approval" },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase3_orders_transition_approve.json", orderApprove);

  const invoicesList = await trpcQuery("invoices.list", { outletId: IDS.outlet, limit: 20 }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase3_invoices_list.json", invoicesList);

  const invoiceId = getData(invoicesList).items[0]?.id as string;
  const invoiceGet = await trpcQuery("invoices.getById", { id: invoiceId }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase3_invoices_getById.json", invoiceGet);

  const approvedOrder = await trpcQuery("orders.getById", { id: orderId }, { "x-actor-id": ACTOR_ADMIN });
  const orderLines = getData(approvedOrder).lines as Array<{ id: string }>;

  const dispatchCreate = await trpcMutation(
    "dispatches.create",
    {
      warehouseId: IDS.warehouse,
      transporterName: "Phase3 Logistics",
      vehicleNumber: "KA-01-PH3-1234",
      lrNumber: "LR-PH3-001",
      dispatchDate: "2026-05-08T02:00:00.000Z",
      estimatedDelivery: "2026-05-09T02:00:00.000Z",
      lines: [
        { orderLineId: orderLines[0].id, qtyDispatched: 2, serialNumbers: ["P3-A-001", "P3-A-002"] },
        { orderLineId: orderLines[1].id, qtyDispatched: 1, serialNumbers: ["P3-B-001"] }
      ]
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase3_dispatches_create.json", dispatchCreate);

  const dispatchId = getData(dispatchCreate).id as string;

  const dispatchGet = await trpcQuery("dispatches.getById", { id: dispatchId }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase3_dispatches_getById.json", dispatchGet);

  const dispatchDelivered = await trpcMutation(
    "dispatches.markDelivered",
    { id: dispatchId, deliveredAt: "2026-05-08T03:00:00.000Z" },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase3_dispatches_markDelivered.json", dispatchDelivered);

  const duplicateDelivered = await trpcMutation(
    "dispatches.markDelivered",
    { id: dispatchId, deliveredAt: "2026-05-08T03:30:00.000Z" },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase3_negative_dispatches_markDelivered_duplicate.json", duplicateDelivered);

  const excessiveDispatch = await trpcMutation(
    "dispatches.create",
    {
      warehouseId: IDS.warehouse,
      transporterName: "Phase3 Logistics",
      vehicleNumber: "KA-01-PH3-EXCESS",
      dispatchDate: "2026-05-08T03:45:00.000Z",
      lines: [{ orderLineId: orderLines[0].id, qtyDispatched: 9999, serialNumbers: [] }]
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase3_negative_dispatches_create_insufficient_stock.json", excessiveDispatch);

  const paymentCreate = await trpcMutation(
    "payments.create",
    {
      outletId: IDS.outlet,
      amount: "5000.00",
      paymentDate: "2026-05-08T04:00:00.000Z",
      reference: "PAY-PH3-001",
      description: "Phase3 payment"
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase3_payments_create.json", paymentCreate);

  const invalidPaymentAmount = await trpcMutation(
    "payments.create",
    {
      outletId: IDS.outlet,
      amount: "not-a-number",
      paymentDate: "2026-05-08T04:00:00.000Z",
      reference: "PAY-PH3-INVALID",
      description: "Phase3 invalid payment"
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase3_negative_payments_create_invalid_amount.json", invalidPaymentAmount);

  const paymentId = getData(paymentCreate).id as string;

  const paymentList = await trpcQuery("payments.list", { outletId: IDS.outlet, limit: 20 }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase3_payments_list.json", paymentList);

  const paymentGet = await trpcQuery("payments.getById", { id: paymentId }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase3_payments_getById.json", paymentGet);

  const orderAfterDispatch = await trpcQuery("orders.getById", { id: orderId }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase3_orders_getById_afterDispatch.json", orderAfterDispatch);

  await saveSnapshot("phase3_smoke_summary.json", {
    status: "ok",
    baseUrl: BASE_URL,
    orderId,
    invoiceId,
    dispatchId,
    paymentId,
    generatedAt: new Date().toISOString()
  });

  console.log("phase3 smoke client completed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
