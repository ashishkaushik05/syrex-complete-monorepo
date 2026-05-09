import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type HeadersMap = Record<string, string>;

const ROOT_DIR = path.resolve(import.meta.dir, "../..");
const SNAPSHOT_DIR = path.join(ROOT_DIR, "plan/phase-gates/snapshots");
const BASE_URL = process.env.PHASE5_BASE_URL ?? "http://127.0.0.1:3005";

// Dev-seed deterministic IDs
const ADMIN_ID = "d1000000-0000-4000-8000-000000000001";
const OUTLET_USER_ID = "d1000000-0000-4000-8000-000000000002";
const WAREHOUSE_USER_ID = "d1000000-0000-4000-8000-000000000003";

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

function actorHeader(userId: string): HeadersMap {
  return { "x-actor-id": userId };
}

function assertOk(label: string, response: unknown) {
  const r = response as any;
  if (r?.error) {
    throw new Error(`[FAIL] ${label}: got error — ${JSON.stringify(r.error)}`);
  }
  console.log(`[PASS] ${label}`);
}

function assertForbidden(label: string, response: unknown) {
  const r = response as any;
  const code = r?.error?.json?.code ?? r?.error?.data?.code;
  if (code !== "FORBIDDEN") {
    throw new Error(`[FAIL] ${label}: expected FORBIDDEN, got ${JSON.stringify(r?.error ?? r)}`);
  }
  console.log(`[PASS] ${label}`);
}

function assertBadRequest(label: string, response: unknown) {
  const r = response as any;
  const code = r?.error?.json?.code ?? r?.error?.data?.code;
  if (code !== "BAD_REQUEST") {
    throw new Error(`[FAIL] ${label}: expected BAD_REQUEST, got ${JSON.stringify(r?.error ?? r)}`);
  }
  console.log(`[PASS] ${label}`);
}

function getData(response: any) {
  if (response?.error) {
    throw new Error(JSON.stringify(response.error));
  }
  return response?.result?.data?.json;
}

async function main() {
  console.log("=== Phase 5 RBAC + Idempotency Smoke ===\n");

  // ─── SETUP: create base fixtures as admin ───────────────────────────────────

  // Create a brand
  const brandResp = await trpcMutation(
    "brands.create",
    { name: "Phase5Brand", isActive: true },
    actorHeader(ADMIN_ID)
  );
  const brand = getData(brandResp);
  const brandId: string = brand.id;

  // Create a category
  const catResp = await trpcMutation(
    "categories.create",
    { brandId, name: "Phase5Cat", isActive: true },
    actorHeader(ADMIN_ID)
  );
  const cat = getData(catResp);
  const categoryId: string = cat.id;

  // Create a product
  const prodResp = await trpcMutation(
    "products.create",
    {
      categoryId,
      name: "Phase5Battery",
      sku: "P5-BAT-001",
      warrantyMonths: 12,
      basePrice: "1500.00",
      isActive: true
    },
    actorHeader(ADMIN_ID)
  );
  const product = getData(prodResp);
  const productId: string = product.id;

  // Create a warehouse
  const warehouseResp = await trpcMutation(
    "warehouses.create",
    { name: "Phase5Godown", location: "Hisar", isActive: true },
    actorHeader(ADMIN_ID)
  );
  const warehouse = getData(warehouseResp);
  const warehouseId: string = warehouse.id;

  // Receive stock into warehouse
  const grnResp = await trpcMutation(
    "inventory.createGoodsReceipt",
    {
      warehouseId,
      sourceType: "manual",
      receiptDate: "2026-05-09T00:00:00.000Z",
      lines: [{ productId, qtyReceived: 100 }]
    },
    actorHeader(ADMIN_ID)
  );
  getData(grnResp); // assert no error

  // Create an outlet user (outlet requires a user)
  const outletUserResp = await trpcMutation(
    "users.create",
    {
      email: "phase5outlet@syrex.local",
      name: "Phase5 Outlet User",
      password: "test1234",
      userType: "outlet",
      roleId: "d0000000-0000-4000-8000-000000000002",
      isActive: true
    },
    actorHeader(ADMIN_ID)
  );
  const outletUserId = getData(outletUserResp).id;

  // Create an outlet
  const outletResp = await trpcMutation(
    "outlets.create",
    {
      outletCode: "P5-OUTLET-001",
      userId: outletUserId,
      warehouseId,
      name: "Phase5 Outlet",
      ownerName: "Phase5 Owner",
      phone: "9999999999",
      address: "Phase5 Address, Hisar",
      creditLimit: "50000"
    },
    actorHeader(ADMIN_ID)
  );
  const outletId = getData(outletResp).id;

  // Create and approve an order
  const orderResp = await trpcMutation(
    "orders.create",
    {
      outletId,
      deliveryAddress: "Phase5 Delivery Address",
      lines: [{ productId, qtyOrdered: 10, unitPrice: "1500.00" }]
    },
    actorHeader(ADMIN_ID)
  );
  const order = getData(orderResp);
  const orderId: string = order.id;
  const orderLineId: string = order.lines[0].id;

  await trpcMutation(
    "orders.transition",
    { id: orderId, action: "approve" },
    actorHeader(ADMIN_ID)
  );

  // ─── TEST 1: Sales role CANNOT call inventory:write ──────────────────────
  const salesGrnAttempt = await trpcMutation(
    "inventory.createGoodsReceipt",
    {
      warehouseId,
      sourceType: "manual",
      lines: [{ productId, qtyReceived: 5 }]
    },
    actorHeader(OUTLET_USER_ID)
  );
  assertForbidden("Sales user cannot create GoodsReceipt (inventory:write required)", salesGrnAttempt);

  // ─── TEST 2: Warehouse Manager CANNOT call orders:approve ─────────────────
  const orderForWarehouse = await trpcMutation(
    "orders.create",
    {
      outletId,
      deliveryAddress: "Test Address",
      lines: [{ productId, qtyOrdered: 2, unitPrice: "1500.00" }]
    },
    actorHeader(ADMIN_ID)
  );
  const wOrderId = getData(orderForWarehouse).id;
  const warehouseApproveAttempt = await trpcMutation(
    "orders.transition",
    { id: wOrderId, action: "approve" },
    actorHeader(WAREHOUSE_USER_ID)
  );
  assertForbidden("Warehouse user cannot approve orders (orders:approve required)", warehouseApproveAttempt);

  // ─── TEST 3: Warehouse Manager CAN create dispatch ────────────────────────
  const whDispatchResp = await trpcMutation(
    "dispatches.create",
    {
      warehouseId,
      transporterName: "Phase5 Transport",
      vehicleNumber: "HR-01-A-0001",
      lines: [{ orderLineId, qtyDispatched: 5 }]
    },
    actorHeader(WAREHOUSE_USER_ID)
  );
  assertOk("Warehouse user can create dispatch (dispatches:write)", whDispatchResp);
  const whDispatch = getData(whDispatchResp);

  // ─── TEST 4: Admin can call inventory:write ────────────────────────────────
  const adminGrn = await trpcMutation(
    "inventory.createGoodsReceipt",
    {
      warehouseId,
      sourceType: "manual",
      lines: [{ productId, qtyReceived: 10 }]
    },
    actorHeader(ADMIN_ID)
  );
  assertOk("Admin can create GoodsReceipt", adminGrn);

  // ─── TEST 5: Idempotent dispatch.create ───────────────────────────────────
  const idemKey = "a0000000-0000-4000-8000-000000000001";
  // Second order to dispatch
  const order2Resp = await trpcMutation(
    "orders.create",
    {
      outletId,
      deliveryAddress: "Idempotency Test Address",
      lines: [{ productId, qtyOrdered: 10, unitPrice: "1500.00" }]
    },
    actorHeader(ADMIN_ID)
  );
  const order2 = getData(order2Resp);
  await trpcMutation("orders.transition", { id: order2.id, action: "approve" }, actorHeader(ADMIN_ID));
  const lineId2 = order2.lines[0].id;

  const dispatchFirst = await trpcMutation(
    "dispatches.create",
    {
      warehouseId,
      transporterName: "IdemTransport",
      vehicleNumber: "HR-02-A-0001",
      idempotencyKey: idemKey,
      lines: [{ orderLineId: lineId2, qtyDispatched: 2 }]
    },
    actorHeader(ADMIN_ID)
  );
  assertOk("Dispatch create (first, with idempotencyKey)", dispatchFirst);
  const dispatch1Id = getData(dispatchFirst).id;

  const dispatchSecond = await trpcMutation(
    "dispatches.create",
    {
      warehouseId,
      transporterName: "IdemTransport",
      vehicleNumber: "HR-02-A-0001",
      idempotencyKey: idemKey,
      lines: [{ orderLineId: lineId2, qtyDispatched: 2 }]
    },
    actorHeader(ADMIN_ID)
  );
  assertOk("Dispatch create (duplicate idempotencyKey returns existing)", dispatchSecond);
  const dispatch2Id = getData(dispatchSecond).id;
  if (dispatch1Id !== dispatch2Id) {
    throw new Error(`[FAIL] Idempotency broken: dispatch IDs differ (${dispatch1Id} vs ${dispatch2Id})`);
  }
  console.log("[PASS] Duplicate idempotencyKey returns same dispatch record");

  // ─── TEST 6: Idempotent payment.create ────────────────────────────────────
  const payIdemKey = "b0000000-0000-4000-8000-000000000001";

  const payment1Resp = await trpcMutation(
    "payments.create",
    {
      outletId,
      amount: "5000.00",
      idempotencyKey: payIdemKey
    },
    actorHeader(ADMIN_ID)
  );
  assertOk("Payment create (first, with idempotencyKey)", payment1Resp);
  const payment1Id = getData(payment1Resp).id;

  const payment2Resp = await trpcMutation(
    "payments.create",
    {
      outletId,
      amount: "5000.00",
      idempotencyKey: payIdemKey
    },
    actorHeader(ADMIN_ID)
  );
  assertOk("Payment create (duplicate idempotencyKey returns existing)", payment2Resp);
  const payment2Id = getData(payment2Resp).id;
  if (payment1Id !== payment2Id) {
    throw new Error(`[FAIL] Idempotency broken: payment IDs differ (${payment1Id} vs ${payment2Id})`);
  }
  console.log("[PASS] Duplicate idempotencyKey returns same payment record");

  // ─── TEST 7: Stock adjustment cannot go below zero ────────────────────────
  const negativeAdj = await trpcMutation(
    "inventory.createStockAdjustment",
    {
      warehouseId,
      productId,
      adjustmentQty: -99999,
      reason: "Test negative guard"
    },
    actorHeader(ADMIN_ID)
  );
  assertBadRequest("Stock adjustment below zero is rejected (BAD_REQUEST)", negativeAdj);

  // ─── TEST 8: Sales user CANNOT list warehouses ────────────────────────────
  const salesWarehouseList = await trpcQuery(
    "warehouses.list",
    { limit: 10 },
    actorHeader(OUTLET_USER_ID)
  );
  assertForbidden("Sales user cannot list warehouses (warehouses:read required)", salesWarehouseList);

  // ─── TEST 9: Admin CAN list warehouses ────────────────────────────────────
  const adminWarehouseList = await trpcQuery(
    "warehouses.list",
    { limit: 10 },
    actorHeader(ADMIN_ID)
  );
  assertOk("Admin can list warehouses", adminWarehouseList);

  // ─── Save snapshots ───────────────────────────────────────────────────────
  const summary = {
    phase: 5,
    timestamp: new Date().toISOString(),
    results: [
      { test: "rbac_forbidden_sales_inventory_write", status: "PASS" },
      { test: "rbac_forbidden_warehouse_orders_approve", status: "PASS" },
      { test: "rbac_allowed_warehouse_dispatches_write", status: "PASS" },
      { test: "rbac_allowed_admin_all", status: "PASS" },
      { test: "idempotency_dispatch_create", status: "PASS" },
      { test: "idempotency_payment_create", status: "PASS" },
      { test: "hardening_negative_stock_adjustment", status: "PASS" },
      { test: "rbac_forbidden_sales_warehouses_read", status: "PASS" },
      { test: "rbac_allowed_admin_warehouses_read", status: "PASS" }
    ]
  };

  await saveSnapshot("phase5_rbac_forbidden_inventory.json", salesGrnAttempt);
  await saveSnapshot("phase5_rbac_allowed_admin_inventory.json", getData(adminGrn));
  await saveSnapshot("phase5_idempotency_dispatch.json", {
    firstId: dispatch1Id,
    secondId: dispatch2Id,
    match: dispatch1Id === dispatch2Id
  });
  await saveSnapshot("phase5_idempotency_payment.json", {
    firstId: payment1Id,
    secondId: payment2Id,
    match: payment1Id === payment2Id
  });
  await saveSnapshot("phase5_negative_stock_guard.json", negativeAdj);
  await saveSnapshot("phase5_smoke_summary.json", summary);

  console.log("\n=== All Phase 5 smoke assertions passed ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
