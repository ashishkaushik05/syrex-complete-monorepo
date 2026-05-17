import { definePermissionModule } from "../core";

export const SERVICE_P = {
  read: "service:read",
  write: "service:write",
  manage: "service:manage",
  approve: "service:approve",
  retest: "service:retest",
  assign: "service:assign",
  cancel: "service:cancel",
  telephonic: "service:telephonic",
  form: "service:form",
} as const;

export const serviceManifest = definePermissionModule({
  module: "service",
  group: "Service",
  permissions: SERVICE_P,
  entries: {
    read: { label: "Read Service Complaints", description: "View service complaints and serial intelligence context.", risk: "low" },
    write: { label: "Write Service Complaints", description: "Create and update complaint payloads, notes, and line metadata.", risk: "medium" },
    manage: { label: "Manage Service Flow", description: "Transition complaint lifecycle states and submit operational updates.", risk: "high" },
    approve: { label: "Approve Warranty", description: "Approve or reject warranty decisions and trigger replacement fulfillment.", risk: "high" },
    retest: { label: "Request Retest", description: "Request retest loops and push complaints back for additional diagnostics.", risk: "medium" },
    assign: { label: "Assign Service", description: "Assign and reassign ASI/SE ownership for complaints.", risk: "medium" },
    cancel: { label: "Cancel Service", description: "Cancel complaints and close unresolved service flows.", risk: "high" },
    telephonic: { label: "Telephonic Closure", description: "Close complaints through telephonic resolution path with reason capture.", risk: "high" },
    form: { label: "Submit Service Forms", description: "Fill and submit form submissions as part of service test workflow.", risk: "medium" },
  },
});
