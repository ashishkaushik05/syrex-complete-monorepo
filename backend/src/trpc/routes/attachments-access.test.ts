import { describe, expect, it } from "bun:test";
import { P } from "../../rbac/catalog";
import {
  DISPATCH_A,
  INVOICE_A,
  ORDER_A,
  OUTLET_A,
  PRODUCT_A,
  WAREHOUSE_A,
  makeCtx,
} from "./__testkit__";
import {
  assertInternalAttachmentTargetAccess,
  attachmentsRouter,
} from "./attachments";

describe("typed internal attachment target access", () => {
  it("rejects unfiltered internal attachment lists before querying any records", async () => {
    const caller = attachmentsRouter.createCaller(makeCtx({
      userType: "internal",
      permissions: [P.attachments.read],
      prisma: {},
    }));

    await expect(caller.list({ limit: 20 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("does not let attachment plus order-read access bypass a missing order scope", async () => {
    const ctx = makeCtx({
      userType: "internal",
      permissions: [P.attachments.read, P.orders.read],
      prisma: {
        saleOrder: { findUnique: async () => ({ outletId: OUTLET_A }) },
      },
    });

    await expect(
      assertInternalAttachmentTargetAccess(ctx, "order", ORDER_A),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows an internal sales actor to access an order attachment", async () => {
    const ctx = makeCtx({
      userType: "internal",
      permissions: [
        P.attachments.read,
        P.orders.read,
        P.orders.write,
        P.outlets.read,
      ],
      prisma: {
        saleOrder: { findUnique: async () => ({ outletId: OUTLET_A }) },
      },
    });

    await expect(
      assertInternalAttachmentTargetAccess(ctx, "order", ORDER_A),
    ).resolves.toBeUndefined();
  });

  it("restricts dispatch attachments to the managed warehouse unless the actor has global dispatch scope", async () => {
    const permitted = makeCtx({
      userType: "internal",
      managedWarehouseId: WAREHOUSE_A,
      permissions: [P.attachments.read, P.dispatches.read],
      prisma: {
        dispatch: { findUnique: async () => ({ warehouseId: WAREHOUSE_A }) },
      },
    });
    const denied = makeCtx({
      userType: "internal",
      managedWarehouseId: WAREHOUSE_A,
      permissions: [P.attachments.read, P.dispatches.read],
      prisma: {
        dispatch: { findUnique: async () => ({ warehouseId: "foreign-warehouse" }) },
      },
    });

    await expect(
      assertInternalAttachmentTargetAccess(permitted, "dispatch", DISPATCH_A),
    ).resolves.toBeUndefined();
    await expect(
      assertInternalAttachmentTargetAccess(denied, "dispatch", DISPATCH_A),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("applies invoice outlet warehouse scope before granting financial attachment access", async () => {
    const ctx = makeCtx({
      userType: "internal",
      managedWarehouseId: WAREHOUSE_A,
      permissions: [P.attachments.read, P.invoices.read],
      prisma: {
        invoice: { findUnique: async () => ({ outletId: OUTLET_A }) },
        outlet: { findUnique: async () => ({ warehouseId: WAREHOUSE_A }) },
      },
    });

    await expect(
      assertInternalAttachmentTargetAccess(ctx, "invoice", INVOICE_A),
    ).resolves.toBeUndefined();
  });

  it("requires catalog read in addition to attachment permission for SKU documents", async () => {
    const ctx = makeCtx({
      userType: "internal",
      permissions: [P.attachments.read],
      prisma: {
        product: { findUnique: async () => ({ id: PRODUCT_A }) },
      },
    });

    await expect(
      assertInternalAttachmentTargetAccess(ctx, "sku", PRODUCT_A),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("treats warranty decisions as service-scoped targets rather than a back-office bypass", async () => {
    const ctx = makeCtx({
      userType: "internal",
      actorOrgId: "org-A",
      permissions: [P.attachments.read, P.service.read],
      prisma: {
        serviceWarrantyDecision: { findUnique: async () => ({ complaintId: ORDER_A }) },
        user: { findUnique: async () => ({ role: { name: "Service Head" } }) },
        serviceComplaint: { findFirst: async () => ({ id: ORDER_A }) },
      },
    });

    await expect(
      assertInternalAttachmentTargetAccess(ctx, "warranty_decision", INVOICE_A),
    ).resolves.toBeUndefined();
  });
});
