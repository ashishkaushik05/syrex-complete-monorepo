import { definePermissionModule } from "../core";

export const INVENTORY_P = {
  read: "inventory:read",
  receive: "inventory:receive",
  adjust: "inventory:adjust",
} as const;

export const inventoryManifest = definePermissionModule({
  module: "inventory",
  group: "Operations",
  permissions: INVENTORY_P,
  entries: {
    read: { label: "Read Inventory", description: "View stock levels, movements, and inventory summaries.", risk: "low" },
    receive: { label: "Receive Goods", description: "Create goods receipts to record inbound stock into a warehouse.", risk: "medium" },
    adjust: { label: "Adjust Stock", description: "Create manual stock adjustments with an audited reason trail.", risk: "high" },
  },
});
