import { definePermissionModule } from "../core";

export const DISPATCHES_P = {
  read: "dispatches:read",
  write: "dispatches:write",
  update: "dispatches:update",
  deliver: "dispatches:deliver",
  cancel: "dispatches:cancel",
} as const;

export const dispatchesManifest = definePermissionModule({
  module: "dispatches",
  group: "Operations",
  permissions: DISPATCHES_P,
  entries: {
    read: { label: "Read Dispatches", description: "View dispatch plans and dispatch records.", risk: "low" },
    write: { label: "Create Dispatches", description: "Create new dispatch records and assign order lines.", risk: "medium" },
    update: { label: "Update Dispatches", description: "Edit dispatch metadata such as transporter and vehicle details.", risk: "medium" },
    deliver: { label: "Mark Delivered", description: "Mark dispatches as delivered and record delivery timestamps.", risk: "high" },
    cancel: { label: "Cancel Dispatches", description: "Cancel a pending or in-transit dispatch and release allocated stock.", risk: "high" },
  },
});
