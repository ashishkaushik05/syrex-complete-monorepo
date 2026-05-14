import { definePermissionModule } from "../core";

export const WAREHOUSES_P = {
  read: "warehouses:read",
  write: "warehouses:write",
  assign: "warehouses:assign",
  deactivate: "warehouses:deactivate",
  "stock-count": "warehouses:stock-count",
  transfer: "warehouses:transfer",
} as const;

export const warehousesManifest = definePermissionModule({
  module: "warehouses",
  group: "Operations",
  permissions: WAREHOUSES_P,
  entries: {
    read: { label: "Read Warehouses", description: "View warehouse records and associations.", risk: "low" },
    write: { label: "Manage Warehouses", description: "Create and update warehouse records.", risk: "medium" },
    assign: { label: "Assign Warehouse Manager", description: "Assign or reassign the manager responsible for a warehouse.", risk: "high" },
    deactivate: { label: "Deactivate Warehouse", description: "Deactivate a warehouse and suspend its operations.", risk: "high" },
    "stock-count": { label: "Stock Count", description: "Initiate and record physical stock counts for a warehouse.", risk: "medium" },
    transfer: { label: "Inter-Warehouse Transfer", description: "Move stock between warehouses via a transfer order.", risk: "high" },
  },
});
