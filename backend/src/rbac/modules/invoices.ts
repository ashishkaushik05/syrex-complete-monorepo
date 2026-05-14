import { definePermissionModule } from "../core";

export const INVOICES_P = {
  read: "invoices:read",
  write: "invoices:write",
  void: "invoices:void",
} as const;

export const invoicesManifest = definePermissionModule({
  module: "invoices",
  group: "Finance",
  permissions: INVOICES_P,
  entries: {
    read: { label: "Read Invoices", description: "View invoices and invoice line details.", risk: "low" },
    write: { label: "Manage Invoices", description: "Create or adjust invoice records manually.", risk: "high" },
    void: { label: "Void Invoices", description: "Void an issued invoice and reverse associated payment allocations.", risk: "high" },
  },
});
