import { P } from "../src/rbac/catalog";

export const DEV_SALES_PERMISSIONS = [
  P.orders.read,
  P.orders.write,
  P.catalog.read,
  P.outlets.read,
  P.inventory.read,
  P.dispatches.read,
  P.invoices.read,
  P.payments.read,
  P.attachments.read,
  P.attachments.write,
  P.service.read,
  P.service.write,
  P.service.manage,
  P.service.approve,
  P.service.retest,
  P.service.assign,
  P.service.cancel,
  P.service.telephonic,
  P.service.form,
  P.warehouses.read,
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
