import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P, SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

const receiptLineInputSchema = z.object({
  productId: z.string().uuid(),
  qtyReceived: z.number().int().positive(),
});

const productionReceiptInputSchema = z.object({
  warehouseId: z.string().uuid(),
  sourceBillingProfileId: z.string().uuid(),
  externalDocumentNumber: z.string().trim().min(1).max(100),
  dispatchDate: z.string().datetime(),
  receiptDate: z.string().datetime(),
  notes: z.string().trim().max(2000).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
  lines: z.array(receiptLineInputSchema).min(1),
});

const stockAdjustmentInputSchema = z.object({
  warehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  adjustmentQty: z.number().int().refine((value) => value !== 0, "adjustmentQty must be non-zero"),
  reason: z.string().min(1),
});

type BillingSnapshot = {
  id: string;
  legalName: string;
  gstin: string;
  pan: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  country: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
};

type ReceiptInput = z.infer<typeof productionReceiptInputSchema>;
type ReceiptDraftInput = Omit<ReceiptInput, "idempotencyKey">;

function isAdmin(ctx: { permissions: string[] }) {
  return ctx.permissions.includes(SUPER_ADMIN_PERMISSION);
}

function assertWarehouseScope(ctx: { managedWarehouseId: string | null }, warehouseId: string) {
  if (ctx.managedWarehouseId && ctx.managedWarehouseId !== warehouseId) {
    throw apiError("FORBIDDEN", "You can only operate on your assigned warehouse");
  }
}

function financialYear(date: Date) {
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 3 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function snapshotProfile(profile: BillingSnapshot) {
  return {
    id: profile.id,
    legalName: profile.legalName,
    gstin: profile.gstin,
    pan: profile.pan,
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2,
    city: profile.city,
    state: profile.state,
    stateCode: profile.stateCode,
    pincode: profile.pincode,
    country: profile.country,
    contactName: profile.contactName,
    contactPhone: profile.contactPhone,
    contactEmail: profile.contactEmail,
  };
}

function money(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function calculateGoodsReceiptTax(input: {
  quantity: number;
  transferValue: Prisma.Decimal.Value;
  gstRate: Prisma.Decimal.Value;
  sourceStateCode: string;
  destinationStateCode: string;
}) {
  const taxableValue = money(new Prisma.Decimal(input.transferValue).mul(input.quantity));
  const gstRate = new Prisma.Decimal(input.gstRate);
  const taxAmount = money(taxableValue.mul(gstRate).div(100));
  const sameState = input.sourceStateCode === input.destinationStateCode;
  const cgstAmount = sameState ? money(taxAmount.div(2)) : money(0);
  const sgstAmount = sameState ? money(taxAmount.sub(cgstAmount)) : money(0);
  const igstAmount = sameState ? money(0) : taxAmount;
  const halfRate = sameState ? gstRate.div(2) : new Prisma.Decimal(0);
  return {
    taxableValue,
    cgstRate: halfRate,
    cgstAmount,
    sgstRate: halfRate,
    sgstAmount,
    igstRate: sameState ? new Prisma.Decimal(0) : gstRate,
    igstAmount,
    lineTotal: money(taxableValue.add(taxAmount)),
  };
}

const receiptInclude = {
  warehouse: {
    select: {
      id: true,
      name: true,
      location: true,
      billingProfile: { select: { legalName: true, gstin: true, state: true, stateCode: true } },
    },
  },
  sourceBillingProfile: { select: { id: true, legalName: true, gstin: true, state: true, stateCode: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  reversedBy: { select: { id: true, name: true, email: true } },
  replaces: { select: { id: true, grnNumber: true } },
  replacement: { select: { id: true, grnNumber: true } },
  lines: {
    orderBy: { skuSnapshot: "asc" as const },
    include: {
      invoiceLine: true,
      movements: { orderBy: { createdAt: "asc" as const } },
    },
  },
  invoice: {
    include: { lines: { orderBy: { sku: "asc" as const } } },
  },
  movements: { orderBy: { createdAt: "asc" as const } },
} as const;

function serializeReceipt(receipt: any) {
  return {
    ...receipt,
    dispatchDate: receipt.dispatchDate.toISOString(),
    receiptDate: receipt.receiptDate.toISOString(),
    reversedAt: receipt.reversedAt?.toISOString() ?? null,
    createdAt: receipt.createdAt.toISOString(),
    lines: receipt.lines.map((line: any) => ({
      ...line,
      gstRateSnapshot: line.gstRateSnapshot.toString(),
      transferValueSnapshot: line.transferValueSnapshot.toString(),
      taxableValue: line.taxableValue.toString(),
      invoiceLine: line.invoiceLine ? {
        ...line.invoiceLine,
        unitValue: line.invoiceLine.unitValue.toString(),
        taxableValue: line.invoiceLine.taxableValue.toString(),
        gstRate: line.invoiceLine.gstRate.toString(),
        cgstRate: line.invoiceLine.cgstRate.toString(),
        cgstAmount: line.invoiceLine.cgstAmount.toString(),
        sgstRate: line.invoiceLine.sgstRate.toString(),
        sgstAmount: line.invoiceLine.sgstAmount.toString(),
        igstRate: line.invoiceLine.igstRate.toString(),
        igstAmount: line.invoiceLine.igstAmount.toString(),
        lineTotal: line.invoiceLine.lineTotal.toString(),
      } : null,
      movements: line.movements.map((movement: any) => ({
        ...movement,
        createdAt: movement.createdAt.toISOString(),
      })),
    })),
    invoice: receipt.invoice ? {
      ...receipt.invoice,
      invoiceDate: receipt.invoice.invoiceDate.toISOString(),
      acknowledgementDate: receipt.invoice.acknowledgementDate?.toISOString() ?? null,
      eWayBillDate: receipt.invoice.eWayBillDate?.toISOString() ?? null,
      eWayBillValidUntil: receipt.invoice.eWayBillValidUntil?.toISOString() ?? null,
      createdAt: receipt.invoice.createdAt.toISOString(),
      taxableTotal: receipt.invoice.taxableTotal.toString(),
      cgstTotal: receipt.invoice.cgstTotal.toString(),
      sgstTotal: receipt.invoice.sgstTotal.toString(),
      igstTotal: receipt.invoice.igstTotal.toString(),
      grandTotal: receipt.invoice.grandTotal.toString(),
      lines: receipt.invoice.lines.map((line: any) => ({
        ...line,
        unitValue: line.unitValue.toString(),
        taxableValue: line.taxableValue.toString(),
        gstRate: line.gstRate.toString(),
        cgstRate: line.cgstRate.toString(),
        cgstAmount: line.cgstAmount.toString(),
        sgstRate: line.sgstRate.toString(),
        sgstAmount: line.sgstAmount.toString(),
        igstRate: line.igstRate.toString(),
        igstAmount: line.igstAmount.toString(),
        lineTotal: line.lineTotal.toString(),
      })),
    } : null,
    movements: receipt.movements.map((movement: any) => ({
      ...movement,
      createdAt: movement.createdAt.toISOString(),
    })),
  };
}

async function loadReceipt(tx: Prisma.TransactionClient, id: string) {
  return tx.goodsReceipt.findUniqueOrThrow({ where: { id }, include: receiptInclude });
}

async function validateConfiguration(tx: Prisma.TransactionClient, input: ReceiptDraftInput) {
  const dispatchDate = new Date(input.dispatchDate);
  const receiptDate = new Date(input.receiptDate);
  if (dispatchDate > receiptDate) {
    throw apiError("BAD_REQUEST", "Dispatch date cannot be after receipt date");
  }
  const productIds = input.lines.map((line) => line.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw apiError("BAD_REQUEST", "A product can appear only once per GRN");
  }

  const [warehouse, source, products] = await Promise.all([
    tx.warehouse.findUnique({
      where: { id: input.warehouseId },
      include: { billingProfile: true },
    }),
    tx.billingProfile.findUnique({ where: { id: input.sourceBillingProfileId } }),
    tx.product.findMany({ where: { id: { in: productIds } } }),
  ]);

  if (!warehouse) throw apiError("BAD_REQUEST", "Invalid warehouseId");
  if (!warehouse.isActive || !warehouse.managerId || !warehouse.billingProfile?.isActive) {
    throw apiError("BAD_REQUEST", "Warehouse must be active with a manager and active billing profile");
  }
  if (warehouse.billingProfile.profileType !== "warehouse") {
    throw apiError("BAD_REQUEST", "Destination billing profile must have type warehouse");
  }
  if (!source || !source.isActive || source.profileType !== "company" || !source.canIssueGrnInvoice) {
    throw apiError("BAD_REQUEST", "Source must be an active company profile eligible to issue GRN invoices");
  }
  if (source.gstin === warehouse.billingProfile.gstin) {
    throw apiError("BAD_REQUEST", "Source and warehouse GSTIN must differ");
  }
  if (products.length !== productIds.length) {
    throw apiError("BAD_REQUEST", "One or more products are invalid");
  }
  for (const product of products) {
    if (!product.isActive || !product.hsnCode || !product.uqc || product.transferValue.lte(0) || product.gstRate.lt(0)) {
      throw apiError("BAD_REQUEST", `Product ${product.sku} is missing active GST or transfer-value configuration`);
    }
  }
  return { warehouse, source, products, dispatchDate, receiptDate };
}

async function allocateNumbers(
  tx: Prisma.TransactionClient,
  sellerGstin: string,
  receiptDate: Date,
) {
  const fy = financialYear(receiptDate);
  await tx.goodsReceiptSequence.upsert({
    where: { sellerGstin_financialYear: { sellerGstin, financialYear: fy } },
    update: {},
    create: { sellerGstin, financialYear: fy },
  });
  const sequence = await tx.goodsReceiptSequence.update({
    where: { sellerGstin_financialYear: { sellerGstin, financialYear: fy } },
    data: {
      lastGrnSequence: { increment: 1 },
      lastInvoiceSequence: { increment: 1 },
    },
  });
  const gst = sellerGstin.toUpperCase();
  return {
    grnNumber: `GRN/${gst}/${fy}/${String(sequence.lastGrnSequence).padStart(6, "0")}`,
    invoiceNumber: `GRNI/${gst}/${fy}/${String(sequence.lastInvoiceSequence).padStart(6, "0")}`,
  };
}

async function createProductionReceipt(
  tx: Prisma.TransactionClient,
  input: ReceiptInput,
  actorId: string,
  replacesId?: string,
) {
  const existing = await tx.goodsReceipt.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return loadReceipt(tx, existing.id);

  const config = await validateConfiguration(tx, input);
  const numbers = await allocateNumbers(tx, config.source.gstin, config.receiptDate);
  const sourceSnapshot = snapshotProfile(config.source);
  const destinationSnapshot = snapshotProfile(config.warehouse.billingProfile!);
  const productById = new Map(config.products.map((product) => [product.id, product]));

  const receipt = await tx.goodsReceipt.create({
    data: {
      grnNumber: numbers.grnNumber,
      warehouseId: input.warehouseId,
      sourceBillingProfileId: input.sourceBillingProfileId,
      externalDocumentNumber: input.externalDocumentNumber,
      dispatchDate: config.dispatchDate,
      receiptDate: config.receiptDate,
      notes: input.notes,
      idempotencyKey: input.idempotencyKey,
      createdById: actorId,
      replacesId,
    },
  });

  const lineRows = [];
  for (const inputLine of input.lines) {
    const product = productById.get(inputLine.productId)!;
    const tax = calculateGoodsReceiptTax({
      quantity: inputLine.qtyReceived,
      transferValue: product.transferValue,
      gstRate: product.gstRate,
      sourceStateCode: config.source.stateCode,
      destinationStateCode: config.warehouse.billingProfile!.stateCode,
    });
    const line = await tx.goodsReceiptLine.create({
      data: {
        grnId: receipt.id,
        productId: product.id,
        qtyReceived: inputLine.qtyReceived,
        skuSnapshot: product.sku,
        productNameSnapshot: product.displayName ?? product.name,
        hsnCodeSnapshot: product.hsnCode,
        uqcSnapshot: product.uqc,
        gstRateSnapshot: product.gstRate,
        transferValueSnapshot: product.transferValue,
        taxableValue: tax.taxableValue,
      },
    });
    lineRows.push({ line, product, tax, quantity: inputLine.qtyReceived });
  }

  const taxableTotal = money(lineRows.reduce((sum, row) => sum.add(row.tax.taxableValue), new Prisma.Decimal(0)));
  const cgstTotal = money(lineRows.reduce((sum, row) => sum.add(row.tax.cgstAmount), new Prisma.Decimal(0)));
  const sgstTotal = money(lineRows.reduce((sum, row) => sum.add(row.tax.sgstAmount), new Prisma.Decimal(0)));
  const igstTotal = money(lineRows.reduce((sum, row) => sum.add(row.tax.igstAmount), new Prisma.Decimal(0)));
  const grandTotal = money(taxableTotal.add(cgstTotal).add(sgstTotal).add(igstTotal));

  await tx.goodsReceiptInvoice.create({
    data: {
      invoiceNumber: numbers.invoiceNumber,
      goodsReceiptId: receipt.id,
      invoiceDate: config.receiptDate,
      sourceBillingSnapshot: sourceSnapshot as Prisma.InputJsonValue,
      destinationBillingSnapshot: destinationSnapshot as Prisma.InputJsonValue,
      sellerGstin: config.source.gstin,
      buyerGstin: config.warehouse.billingProfile!.gstin,
      placeOfSupplyStateCode: config.warehouse.billingProfile!.stateCode,
      taxableTotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      grandTotal,
      replacesId: replacesId
        ? (await tx.goodsReceipt.findUniqueOrThrow({ where: { id: replacesId }, select: { invoice: { select: { id: true } } } })).invoice?.id
        : undefined,
      lines: {
        create: lineRows.map(({ line, product, tax, quantity }) => ({
          goodsReceiptLineId: line.id,
          productId: product.id,
          sku: product.sku,
          productName: product.displayName ?? product.name,
          hsnCode: product.hsnCode,
          uqc: product.uqc,
          quantity,
          unitValue: product.transferValue,
          taxableValue: tax.taxableValue,
          gstRate: product.gstRate,
          cgstRate: tax.cgstRate,
          cgstAmount: tax.cgstAmount,
          sgstRate: tax.sgstRate,
          sgstAmount: tax.sgstAmount,
          igstRate: tax.igstRate,
          igstAmount: tax.igstAmount,
          lineTotal: tax.lineTotal,
        })),
      },
    },
  });

  for (const { line, product, quantity } of lineRows) {
    await tx.warehouseStock.upsert({
      where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: product.id } },
      update: { currentQty: { increment: quantity } },
      create: { warehouseId: input.warehouseId, productId: product.id, currentQty: quantity },
    });
    await tx.inventoryMovement.create({
      data: {
        warehouseId: input.warehouseId,
        productId: product.id,
        goodsReceiptId: receipt.id,
        goodsReceiptLineId: line.id,
        movementType: "production_receipt",
        quantityDelta: quantity,
        createdById: actorId,
      },
    });
  }
  await tx.auditLog.create({
    data: {
      actorId,
      action: "production_grn.created",
      entityType: "GoodsReceipt",
      entityId: receipt.id,
      meta: { grnNumber: numbers.grnNumber, invoiceNumber: numbers.invoiceNumber },
    },
  });
  return loadReceipt(tx, receipt.id);
}

async function reverseProductionReceipt(
  tx: Prisma.TransactionClient,
  receiptId: string,
  actorId: string,
  reason: string,
  replacement: boolean,
) {
  const receipt = await tx.goodsReceipt.findUnique({
    where: { id: receiptId },
    include: { lines: true, invoice: true },
  });
  if (!receipt) throw apiError("NOT_FOUND", "Goods receipt not found");
  if (receipt.status !== "active") throw apiError("CONFLICT", "Only an active goods receipt can be corrected");

  for (const line of receipt.lines) {
    await tx.warehouseStock.upsert({
      where: { warehouseId_productId: { warehouseId: receipt.warehouseId, productId: line.productId } },
      update: { currentQty: { decrement: line.qtyReceived } },
      create: { warehouseId: receipt.warehouseId, productId: line.productId, currentQty: -line.qtyReceived },
    });
    await tx.inventoryMovement.create({
      data: {
        warehouseId: receipt.warehouseId,
        productId: line.productId,
        goodsReceiptId: receipt.id,
        goodsReceiptLineId: line.id,
        movementType: "production_receipt_reversal",
        quantityDelta: -line.qtyReceived,
        createdById: actorId,
        reason,
      },
    });
  }
  const status = replacement ? "replaced" : "reversed";
  await tx.goodsReceipt.update({
    where: { id: receipt.id },
    data: { status, reversedAt: new Date(), reversedById: actorId, reversalReason: reason },
  });
  if (receipt.invoice) {
    await tx.goodsReceiptInvoice.update({
      where: { id: receipt.invoice.id },
      data: { status: replacement ? "replaced" : "reversed" },
    });
  }
  await tx.auditLog.create({
    data: {
      actorId,
      action: replacement ? "production_grn.replaced" : "production_grn.reversed",
      entityType: "GoodsReceipt",
      entityId: receipt.id,
      meta: { reason },
    },
  });
  return receipt;
}

export const inventoryRouter = createTRPCRouter({
  stockList: perm(P.inventory.read)
    .input(paginationInputSchema.extend({
      warehouseId: z.string().uuid(),
      productId: z.string().uuid().optional(),
      q: z.string().min(1).optional(),
    }))
    .query(async ({ ctx, input }) => {
      assertWarehouseScope(ctx, input.warehouseId);
      const cursor = decodeCursor(input.cursor);
      const rows = await ctx.prisma.warehouseStock.findMany({
        where: {
          warehouseId: input.warehouseId,
          productId: input.productId,
          AND: [
            ...(input.q ? [{ OR: [
              { product: { sku: { contains: input.q, mode: "insensitive" as const } } },
              { product: { name: { contains: input.q, mode: "insensitive" as const } } },
            ] }] : []),
            ...(cursor ? [{ OR: [
              { updatedAt: { lt: new Date(cursor.ts) } },
              { updatedAt: new Date(cursor.ts), id: { lt: cursor.id } },
            ] }] : []),
          ],
        },
        include: { product: { select: { id: true, sku: true, name: true } } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });
      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        items: items.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
        nextCursor: hasMore ? encodeCursor({ createdAt: items[items.length - 1].updatedAt, id: items[items.length - 1].id }) : null,
      };
    }),

  listGoodsReceipts: perm(P.inventory["grn-read"])
    .input(paginationInputSchema.extend({
      warehouseId: z.string().uuid().optional(),
      status: z.enum(["active", "reversed", "replaced"]).optional(),
      q: z.string().trim().min(1).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const warehouseId = ctx.managedWarehouseId ?? input.warehouseId;
      if (!warehouseId && !isAdmin(ctx) && !ctx.permissions.includes(P.inventory["grn-reverse"])) {
        throw apiError("FORBIDDEN", "Warehouse scope is required");
      }
      if (warehouseId) assertWarehouseScope(ctx, warehouseId);
      const cursor = decodeCursor(input.cursor);
      const rows = await ctx.prisma.goodsReceipt.findMany({
        where: {
          warehouseId,
          status: input.status,
          AND: [
            ...(input.q ? [{ OR: [
              { grnNumber: { contains: input.q, mode: "insensitive" as const } },
              { externalDocumentNumber: { contains: input.q, mode: "insensitive" as const } },
              { invoice: { invoiceNumber: { contains: input.q, mode: "insensitive" as const } } },
            ] }] : []),
            ...(cursor ? [{ OR: [
              { createdAt: { lt: new Date(cursor.ts) } },
              { createdAt: new Date(cursor.ts), id: { lt: cursor.id } },
            ] }] : []),
          ],
        },
        include: {
          warehouse: { select: { id: true, name: true } },
          sourceBillingProfile: { select: { id: true, legalName: true, gstin: true } },
          invoice: { select: { id: true, invoiceNumber: true, grandTotal: true, status: true } },
          _count: { select: { lines: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });
      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        items: items.map((row) => ({
          ...row,
          dispatchDate: row.dispatchDate.toISOString(),
          receiptDate: row.receiptDate.toISOString(),
          reversedAt: row.reversedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          invoice: row.invoice ? { ...row.invoice, grandTotal: row.invoice.grandTotal.toString() } : null,
        })),
        nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null,
      };
    }),

  getGoodsReceipt: perm(P.inventory["grn-invoice-read"])
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const receipt = await ctx.prisma.goodsReceipt.findUnique({ where: { id: input.id }, include: receiptInclude });
      if (!receipt) throw apiError("NOT_FOUND", "Goods receipt not found");
      assertWarehouseScope(ctx, receipt.warehouseId);
      return serializeReceipt(receipt);
    }),

  createProductionGoodsReceipt: perm(P.inventory["grn-create"])
    .input(productionReceiptInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.actor.id) throw apiError("UNAUTHORIZED", "Missing actor context");
      assertWarehouseScope(ctx, input.warehouseId);
      let receipt;
      try {
        receipt = await ctx.prisma.$transaction((tx) => createProductionReceipt(tx, input, ctx.actor.id!));
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
        const existing = await ctx.prisma.goodsReceipt.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: receiptInclude,
        });
        if (!existing) throw error;
        receipt = existing;
      }
      return serializeReceipt(receipt);
    }),

  previewProductionGoodsReceipt: perm(P.inventory["grn-create"])
    .input(productionReceiptInputSchema.omit({ idempotencyKey: true }))
    .query(async ({ ctx, input }) => {
      assertWarehouseScope(ctx, input.warehouseId);
      return ctx.prisma.$transaction(async (tx) => {
        const config = await validateConfiguration(tx, input);
        const productById = new Map(config.products.map((product) => [product.id, product]));
        const lines = input.lines.map((line) => {
          const product = productById.get(line.productId)!;
          const tax = calculateGoodsReceiptTax({
            quantity: line.qtyReceived,
            transferValue: product.transferValue,
            gstRate: product.gstRate,
            sourceStateCode: config.source.stateCode,
            destinationStateCode: config.warehouse.billingProfile!.stateCode,
          });
          return {
            productId: product.id,
            sku: product.sku,
            quantity: line.qtyReceived,
            taxableValue: tax.taxableValue.toString(),
            cgstAmount: tax.cgstAmount.toString(),
            sgstAmount: tax.sgstAmount.toString(),
            igstAmount: tax.igstAmount.toString(),
            lineTotal: tax.lineTotal.toString(),
          };
        });
        const sum = (field: "taxableValue" | "cgstAmount" | "sgstAmount" | "igstAmount" | "lineTotal") =>
          money(lines.reduce((total, line) => total.add(line[field]), new Prisma.Decimal(0))).toString();
        return {
          lines,
          taxableTotal: sum("taxableValue"),
          cgstTotal: sum("cgstAmount"),
          sgstTotal: sum("sgstAmount"),
          igstTotal: sum("igstAmount"),
          grandTotal: sum("lineTotal"),
        };
      });
    }),

  reverseProductionGoodsReceipt: perm(P.inventory["grn-reverse"])
    .input(z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.actor.id) throw apiError("UNAUTHORIZED", "Missing actor context");
      const receipt = await ctx.prisma.goodsReceipt.findUnique({ where: { id: input.id }, select: { warehouseId: true } });
      if (!receipt) throw apiError("NOT_FOUND", "Goods receipt not found");
      assertWarehouseScope(ctx, receipt.warehouseId);
      const result = await ctx.prisma.$transaction(async (tx) => {
        await reverseProductionReceipt(tx, input.id, ctx.actor.id!, input.reason, false);
        return loadReceipt(tx, input.id);
      });
      return serializeReceipt(result);
    }),

  replaceProductionGoodsReceipt: perm(P.inventory["grn-replace"])
    .input(productionReceiptInputSchema.extend({
      originalGoodsReceiptId: z.string().uuid(),
      correctionReason: z.string().trim().min(1).max(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.actor.id) throw apiError("UNAUTHORIZED", "Missing actor context");
      assertWarehouseScope(ctx, input.warehouseId);
      const result = await ctx.prisma.$transaction(async (tx) => {
        const original = await tx.goodsReceipt.findUnique({ where: { id: input.originalGoodsReceiptId } });
        if (!original) throw apiError("NOT_FOUND", "Original goods receipt not found");
        if (original.warehouseId !== input.warehouseId) {
          throw apiError("BAD_REQUEST", "Replacement must use the original warehouse");
        }
        const existing = await tx.goodsReceipt.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) return loadReceipt(tx, existing.id);
        await reverseProductionReceipt(tx, original.id, ctx.actor.id!, input.correctionReason, true);
        const { originalGoodsReceiptId: _originalId, correctionReason: _reason, ...replacementInput } = input;
        return createProductionReceipt(tx, replacementInput, ctx.actor.id!, original.id);
      });
      return serializeReceipt(result);
    }),

  createStockAdjustment: perm(P.inventory.adjust)
    .input(stockAdjustmentInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.actor.id) throw apiError("UNAUTHORIZED", "Missing actor context");
      assertWarehouseScope(ctx, input.warehouseId);
      const [warehouse, product] = await Promise.all([
        ctx.prisma.warehouse.findUnique({ where: { id: input.warehouseId } }),
        ctx.prisma.product.findUnique({ where: { id: input.productId } }),
      ]);
      if (!warehouse) throw apiError("BAD_REQUEST", "Invalid warehouseId");
      if (!product) throw apiError("BAD_REQUEST", "Invalid productId");
      const created = await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.warehouseStock.findUnique({
          where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: input.productId } },
        });
        const resultingQty = (existing?.currentQty ?? 0) + input.adjustmentQty;
        if (resultingQty < 0) throw apiError("BAD_REQUEST", "Stock cannot go below zero");
        await tx.warehouseStock.upsert({
          where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: input.productId } },
          update: { currentQty: resultingQty },
          create: { warehouseId: input.warehouseId, productId: input.productId, currentQty: resultingQty },
        });
        const adjustment = await tx.stockAdjustment.create({
          data: { ...input, adjustedById: ctx.actor.id! },
        });
        return { adjustment, resultingQty };
      });
      return {
        ...created.adjustment,
        createdAt: created.adjustment.createdAt.toISOString(),
        resultingQty: created.resultingQty,
      };
    }),
});
