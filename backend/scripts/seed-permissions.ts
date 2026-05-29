import { P } from "../src/rbac/catalog";

// Outlet-type users: can place orders, view catalog/invoices, and confirm delivery of their dispatches
// outlets:read and payments:read are scoped to the actor's own outlet by
// outlets.ts and invoices.ts (see Batch 03 of the May 2026 audit).
export const OUTLET_PERMISSIONS = [
  P.orders.read,
  P.orders.write,
  P.catalog.read,
  P.outlets.read,
  P.invoices.read,
  P.payments.read,
  P.attachments.read,
  P.attachments.write,
  P.dispatches.read,
  P.dispatches.deliver,
  P.service.read,
  P.service.write,
] as const;

export const DEV_SALES_PERMISSIONS = [
  P.orders.read,
  P.orders.write,
  P.catalog.read,
  P.outlets.read,
  P.dispatches.read,
  P.invoices.read,
  P.payments.read,
  P.field.read,
  P.field.write,
] as const;

export const DEV_WAREHOUSE_PERMISSIONS = [
  P.inventory.read,
  P.inventory.receive,
  P.inventory.adjust,
  P.warehouses.read,
  P.orders.read,
  P.dispatches.read,
  P.dispatches.write,
  P.dispatches.deliver,
  P.attachments.read,
  P.attachments.write,
] as const;

export const PHASE1_SALES_PERMISSIONS = [P.orders.read, P.orders.write] as const;

export const SERVICE_ASI_PERMISSIONS = [
  P.service.read,
  P.service.workflow,
  P.service.assign,
  P.service.retest,
] as const;

export const SERVICE_SE_PERMISSIONS = [
  P.service.read,
  P.service.form,
  P.service.workflow,
] as const;
