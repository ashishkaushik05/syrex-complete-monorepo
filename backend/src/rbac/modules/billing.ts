import { definePermissionModule } from "../core";

export const BILLING_P = {
  read:   "billing:read",
  manage: "billing:manage",
} as const;

export const billingManifest = definePermissionModule({
  module: "billing",
  group: "Finance",
  permissions: BILLING_P,
  entries: {
    read:   { label: "Read Billing Config",   description: "View tax and charge configurations.", risk: "low" },
    manage: { label: "Manage Billing Config",  description: "Create, update, reorder, and toggle tax and charge configurations.", risk: "high" },
  },
});
