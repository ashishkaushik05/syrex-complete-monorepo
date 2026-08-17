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
  P.dispatches.read,
  P.dispatches.deliver,
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
  P.inventory["grn-read"],
  P.inventory["grn-create"],
  P.inventory["grn-invoice-read"],
  P.inventory.adjust,
  P.warehouses.read,
  P.orders.read,
  P.dispatches.read,
  P.dispatches.write,
  P.dispatches.deliver,
  P.attachments.read,
  P.attachments.write,
] as const;

export const DISTRIBUTION_HEAD_PERMISSIONS = [
  P.inventory.read,
  P.inventory["grn-read"],
  P.inventory["grn-create"],
  P.inventory["grn-reverse"],
  P.inventory["grn-replace"],
  P.inventory["grn-invoice-read"],
  P.inventory.adjust,
  P.warehouses.read,
  P.warehouses.write,
  P.catalog.read,
  P.outlets.read,
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
  P.service.assign,
  P.service.retest,
  P.attachments.read,
] as const;

export const SERVICE_SE_PERMISSIONS = [
  P.service.read,
  P.service.form,
  P.service.workflow,
  P.attachments.read,
  P.attachments.write,
] as const;

// RSM (Regional Service Manager): oversight tier above ASI. Read-only on
// complaints scoped to their region (via ServiceComplaint.rsmUserId) plus the
// analytics dashboards.
export const SERVICE_RSM_PERMISSIONS = [
  P.service.read,
  P.service.analytics,
  P.attachments.read,
] as const;

// Customer Executive: runs the post-resolution happy-calling queue.
export const SERVICE_HAPPY_CALLING_PERMISSIONS = [
  P.service.read,
  P.service["happy-calling"],
] as const;

// Service Head: full bypass for every service route.
// Covers complaint CRUD, workflow transitions, ASI/SE assignment, warranty
// approve/reject/fulfillment, form templates, integrations admin, analytics,
// happy-calling queue, and read access to replacement orders and dispatches.
export const SERVICE_HEAD_PERMISSIONS = [
  // All service permissions
  P.service.read,
  P.service.write,
  P.service.workflow,
  P.service.templates,
  P.service.manage,
  P.service.approve,
  P.service.retest,
  P.service.assign,
  P.service.cancel,
  P.service.telephonic,
  P.service.form,
  P.service.analytics,
  P.service["happy-calling"],
  // Replacement order and dispatch visibility
  P.orders.read,
  P.dispatches.read,
  // Attachments — upload evidence and warranty docs
  P.attachments.read,
  P.attachments.write,
] as const;
