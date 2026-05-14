import { definePermissionModule } from "../core";

export const OUTLETS_P = {
  read: "outlets:read",
  write: "outlets:write",
  credit: "outlets:credit",
  assign: "outlets:assign",
} as const;

export const outletsManifest = definePermissionModule({
  module: "outlets",
  group: "Sales",
  permissions: OUTLETS_P,
  entries: {
    read: { label: "Read Outlets", description: "View outlet records and associated metadata.", risk: "low" },
    write: { label: "Manage Outlets", description: "Create and update outlet records.", risk: "medium" },
    credit: { label: "Manage Credit Limits", description: "Set or update credit limits and outstanding balance thresholds for outlets.", risk: "high" },
    assign: { label: "Assign Outlet to Warehouse", description: "Link or reassign an outlet to a warehouse for fulfillment routing.", risk: "high" },
  },
});
