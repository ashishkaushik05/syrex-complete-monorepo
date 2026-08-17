import { beforeAll, describe, expect, it } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { inventoryRouter } from "./inventory";

const prisma = new PrismaClient();
const NORTH = "f3000000-0000-4000-8000-000000000001";
const SOUTH = "f3000000-0000-4000-8000-000000000002";
const COMPANY = "f8000000-0000-4000-8000-000000000001";
const PRODUCT = "f7000000-0000-4000-8000-000000000001";

let distributionId = "";
let managerId = "";
let distributionPermissions: string[] = [];
let managerPermissions: string[] = [];

function caller(actorId: string, permissions: string[], managedWarehouseId: string | null) {
  return inventoryRouter.createCaller({
    requestId: crypto.randomUUID(),
    actor: { id: actorId, orgId: null, sessionId: null },
    prisma,
    permissions,
    managedWarehouseId,
    userType: "internal",
    linkedOutletId: null,
    serviceUser: null,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: [],
    sourceIp: "test",
  });
}

function input(warehouseId: string, key: string, quantity: number) {
  const receiptDate = new Date();
  return {
    warehouseId,
    sourceBillingProfileId: COMPANY,
    externalDocumentNumber: `EXT-${key}`,
    dispatchDate: new Date(receiptDate.getTime() - 60_000).toISOString(),
    receiptDate: receiptDate.toISOString(),
    notes: "acceptance test",
    idempotencyKey: key,
    lines: [{ productId: PRODUCT, qtyReceived: quantity }],
  };
}

beforeAll(async () => {
  const [distribution, manager] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: "distribution@syrex.local" }, include: { role: true } }),
    prisma.user.findUniqueOrThrow({ where: { email: "whnorth@syrex.local" }, include: { role: true } }),
  ]);
  distributionId = distribution.id;
  managerId = manager.id;
  distributionPermissions = distribution.role.permissions;
  managerPermissions = manager.role.permissions;
});

describe("production GRN acceptance", () => {
  it("creates same-state and interstate invoices, is idempotent, scopes managers, reverses, replaces, and keeps sales receivables isolated", async () => {
    const distribution = caller(distributionId, distributionPermissions, null);
    const manager = caller(managerId, managerPermissions, NORTH);
    const baselineSalesInvoices = await prisma.invoice.count();
    const baselineOutstanding = await prisma.outlet.aggregate({ _sum: { outstandingBalance: true } });

    const sameStateInput = input(NORTH, `grn-same-${crypto.randomUUID()}`, 2);
    const sameState = await distribution.createProductionGoodsReceipt(sameStateInput);
    expect(Number(sameState.invoice.cgstTotal)).toBeGreaterThan(0);
    expect(Number(sameState.invoice.sgstTotal)).toBeGreaterThan(0);
    expect(Number(sameState.invoice.igstTotal)).toBe(0);

    const afterFirst = await prisma.warehouseStock.findUniqueOrThrow({
      where: { warehouseId_productId: { warehouseId: NORTH, productId: PRODUCT } },
    });
    const duplicate = await distribution.createProductionGoodsReceipt(sameStateInput);
    const afterDuplicate = await prisma.warehouseStock.findUniqueOrThrow({
      where: { warehouseId_productId: { warehouseId: NORTH, productId: PRODUCT } },
    });
    expect(duplicate.id).toBe(sameState.id);
    expect(afterDuplicate.currentQty).toBe(afterFirst.currentQty);

    const interstate = await distribution.createProductionGoodsReceipt(input(SOUTH, `grn-inter-${crypto.randomUUID()}`, 1));
    expect(Number(interstate.invoice.cgstTotal)).toBe(0);
    expect(Number(interstate.invoice.sgstTotal)).toBe(0);
    expect(Number(interstate.invoice.igstTotal)).toBeGreaterThan(0);
    await expect(manager.getGoodsReceipt({ id: interstate.id })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await prisma.warehouseStock.update({
      where: { warehouseId_productId: { warehouseId: NORTH, productId: PRODUCT } },
      data: { currentQty: 0 },
    });
    const reversed = await distribution.reverseProductionGoodsReceipt({ id: sameState.id, reason: "Acceptance reversal" });
    expect(reversed.status).toBe("reversed");
    const negativeStock = await prisma.warehouseStock.findUniqueOrThrow({
      where: { warehouseId_productId: { warehouseId: NORTH, productId: PRODUCT } },
    });
    expect(negativeStock.currentQty).toBe(-2);

    const original = await distribution.createProductionGoodsReceipt(input(NORTH, `grn-original-${crypto.randomUUID()}`, 1));
    const replacementInput = input(NORTH, `grn-replacement-${crypto.randomUUID()}`, 3);
    const replacement = await distribution.replaceProductionGoodsReceipt({
      ...replacementInput,
      originalGoodsReceiptId: original.id,
      correctionReason: "Correct quantity",
    });
    expect(replacement.replaces?.id).toBe(original.id);
    expect((await prisma.goodsReceipt.findUniqueOrThrow({ where: { id: original.id } })).status).toBe("replaced");

    const concurrent = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        distribution.createProductionGoodsReceipt(input(NORTH, `grn-concurrent-${index}-${crypto.randomUUID()}`, 1)),
      ),
    );
    expect(new Set(concurrent.map((row) => row.grnNumber)).size).toBe(4);

    expect(await prisma.invoice.count()).toBe(baselineSalesInvoices);
    const finalOutstanding = await prisma.outlet.aggregate({ _sum: { outstandingBalance: true } });
    expect(finalOutstanding._sum.outstandingBalance?.toString()).toBe(
      baselineOutstanding._sum.outstandingBalance?.toString(),
    );
  });
});
