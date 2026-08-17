import { describe, expect, it } from "bun:test";
import { productsRouter } from "./products";
import { dec, makeCtx, PRODUCT_A } from "./__testkit__";

// ASVF for the products router (P1 — pricing inputs feed every order/invoice line). Catalog
// is global, not outlet-scoped, so the scope axis here is the catalog:read / catalog:write
// permission split. Validation centres on the gstRate/transferValue refinements and SKU
// uniqueness; failure paths are unknown category / duplicate SKU / missing product.

const CATEGORY_A = "ca7e6071-0000-4000-8000-000000000001";

function productRow(over: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_A,
    categoryId: CATEGORY_A,
    category: { brandId: "brand-1" },
    name: "Battery 100Ah",
    displayName: "100Ah Tubular",
    sku: "SKU-100",
    description: null,
    specs: null,
    warrantyMonths: 36,
    basePrice: dec("10999"),
    hsnCode: "8507",
    uqc: "NOS",
    gstRate: dec("18"),
    transferValue: dec("9000"),
    sortOrder: 0,
    isActive: true,
    images: [{ uri: "https://img/1.jpg" }],
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...over,
  };
}

const defined = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

type ProductMockOpts = {
  category?: Record<string, unknown> | null;
  byId?: Record<string, unknown> | null;
  bySku?: Record<string, unknown> | null;
  rows?: Record<string, unknown>[];
};

function productsPrisma(opts: ProductMockOpts = {}) {
  const captured: { create?: Record<string, unknown>; update?: Record<string, unknown> } = {};
  const prisma = {
    category: { findUnique: async () => opts.category ?? null },
    product: {
      findMany: async () => opts.rows ?? [],
      findUnique: async (args: { where: { id?: string; sku?: string } }) => {
        if (args.where.sku !== undefined) return opts.bySku ?? null;
        return "byId" in opts ? opts.byId ?? null : productRow();
      },
      create: async (args: { data: Record<string, unknown> }) => {
        captured.create = args.data;
        return productRow(defined(args.data));
      },
      update: async (args: { data: Record<string, unknown> }) => {
        captured.update = args.data;
        return productRow(defined(args.data));
      },
    },
  };
  return { prisma, captured };
}

const READ = ["catalog:read"];
const WRITE = ["catalog:write"];

const createInput = {
  categoryId: CATEGORY_A,
  name: "Battery 100Ah",
  sku: "SKU-100",
  warrantyMonths: 36,
  basePrice: "10999",
  hsnCode: "8507",
  uqc: "NOS",
  gstRate: "18",
  transferValue: "9000",
};

describe("products.list / getById", () => {
  it("rejects without catalog:read (Auth)", async () => {
    const { prisma } = productsPrisma();
    const caller = productsRouter.createCaller(makeCtx({ permissions: [], prisma }));
    await expect(caller.list({ limit: 20 })).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("lists for a reader", async () => {
    const { prisma } = productsPrisma({ rows: [productRow()] });
    const caller = productsRouter.createCaller(makeCtx({ permissions: READ, prisma }));
    const out = await caller.list({ limit: 20 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].brandId).toBe("brand-1");
    expect(out.items[0].primaryImageUrl).toBe("https://img/1.jpg");
    expect(out.items[0].basePrice).toBe("10999");
  });

  it("getById returns NOT_FOUND when absent (Failure)", async () => {
    const { prisma } = productsPrisma({ byId: null });
    const caller = productsRouter.createCaller(makeCtx({ permissions: READ, prisma }));
    await expect(caller.getById({ id: PRODUCT_A })).rejects.toThrow(/not found/i);
  });
});

describe("products.create validation", () => {
  it("rejects without catalog:write (Auth)", async () => {
    const { prisma } = productsPrisma({ category: { id: CATEGORY_A } });
    const caller = productsRouter.createCaller(makeCtx({ permissions: READ, prisma }));
    await expect(caller.create(createInput)).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("rejects a gstRate over 100 (Validation)", async () => {
    const { prisma } = productsPrisma({ category: { id: CATEGORY_A } });
    const caller = productsRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.create({ ...createInput, gstRate: "150" })).rejects.toThrow();
  });

  it("rejects a non-positive transferValue (Validation)", async () => {
    const { prisma } = productsPrisma({ category: { id: CATEGORY_A } });
    const caller = productsRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.create({ ...createInput, transferValue: "0" })).rejects.toThrow();
  });

  it("rejects an hsnCode under 4 chars (Validation)", async () => {
    const { prisma } = productsPrisma({ category: { id: CATEGORY_A } });
    const caller = productsRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.create({ ...createInput, hsnCode: "85" })).rejects.toThrow();
  });

  it("rejects an unknown categoryId (Failure)", async () => {
    const { prisma } = productsPrisma({ category: null });
    const caller = productsRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.create(createInput)).rejects.toThrow(/Invalid categoryId/i);
  });

  it("rejects a duplicate SKU (Failure)", async () => {
    const { prisma } = productsPrisma({ category: { id: CATEGORY_A }, bySku: productRow() });
    const caller = productsRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.create(createInput)).rejects.toThrow(/SKU already exists/i);
  });

  it("creates a product when category exists and SKU is free", async () => {
    const { prisma, captured } = productsPrisma({ category: { id: CATEGORY_A }, bySku: null });
    const caller = productsRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    const out = await caller.create(createInput);
    expect(captured.create!.sku).toBe("SKU-100");
    expect(out.gstRate).toBe("18");
  });
});

describe("products.update", () => {
  it("returns NOT_FOUND for a missing product (Failure)", async () => {
    const { prisma } = productsPrisma({ byId: null });
    const caller = productsRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.update({ id: PRODUCT_A, name: "X" })).rejects.toThrow(/not found/i);
  });

  it("rejects switching to an unknown category (Failure)", async () => {
    const { prisma } = productsPrisma({ byId: productRow(), category: null });
    const caller = productsRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.update({ id: PRODUCT_A, categoryId: CATEGORY_A })).rejects.toThrow(/Invalid categoryId/i);
  });

  it("rejects renaming to a SKU owned by another product (Failure)", async () => {
    const { prisma } = productsPrisma({ byId: productRow({ sku: "SKU-OLD" }), bySku: productRow({ id: "other" }) });
    const caller = productsRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.update({ id: PRODUCT_A, sku: "SKU-100" })).rejects.toThrow(/SKU already exists/i);
  });

  it("updates price fields", async () => {
    const { prisma, captured } = productsPrisma({ byId: productRow() });
    const caller = productsRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await caller.update({ id: PRODUCT_A, basePrice: "12500" });
    expect(captured.update!.basePrice).toBe("12500");
  });
});
