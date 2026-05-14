import { definePermissionModule } from "../core";

export const ORDERS_P = {
  read: "orders:read",
  write: "orders:write",
  manage: "orders:manage",
  approve: "orders:approve",
} as const;

export const ordersManifest = definePermissionModule({
  module: "orders",
  group: "Sales",
  permissions: ORDERS_P,
  entries: {
    read: { label: "Read Orders", description: "View order lists and order details.", risk: "low" },
    write: { label: "Create Orders", description: "Create and update order drafts.", risk: "medium" },
    manage: { label: "Manage Order State", description: "Transition order workflow states.", risk: "high" },
    approve: { label: "Approve Orders", description: "Approve orders for downstream fulfillment.", risk: "high" },
  },
});
