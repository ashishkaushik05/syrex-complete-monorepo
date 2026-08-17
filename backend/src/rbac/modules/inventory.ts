import { definePermissionModule } from "../core";

export const INVENTORY_P = {
  read: "inventory:read",
  receive: "inventory:receive",
  adjust: "inventory:adjust",
  "grn-read": "inventory:grn-read",
  "grn-create": "inventory:grn-create",
  "grn-reverse": "inventory:grn-reverse",
  "grn-replace": "inventory:grn-replace",
  "grn-invoice-read": "inventory:grn-invoice-read",
} as const;

export const inventoryManifest = definePermissionModule({
  module: "inventory",
  group: "Operations",
  permissions: INVENTORY_P,
  entries: {
    read: { label: "Read Inventory", description: "View stock levels, movements, and inventory summaries.", risk: "low" },
    receive: { label: "Receive Goods", description: "Create goods receipts to record inbound stock into a warehouse.", risk: "medium" },
    adjust: { label: "Adjust Stock", description: "Create manual stock adjustments with an audited reason trail.", risk: "high" },
    "grn-read": { label: "Read Production GRNs", description: "View production goods receipts and their movement history.", risk: "low" },
    "grn-create": { label: "Create Production GRNs", description: "Finalize production receipts, GST invoices, and stock movements.", risk: "high" },
    "grn-reverse": { label: "Reverse Production GRNs", description: "Reverse issued production receipts and append compensating movements.", risk: "high" },
    "grn-replace": { label: "Replace Production GRNs", description: "Atomically reverse and replace issued production receipts.", risk: "high" },
    "grn-invoice-read": { label: "Read GRN GST Invoices", description: "View and export dedicated production-receipt GST invoices.", risk: "medium" },
  },
});
