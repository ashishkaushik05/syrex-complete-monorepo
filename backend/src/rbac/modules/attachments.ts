import { definePermissionModule } from "../core";

export const ATTACHMENTS_P = {
  read: "attachments:read",
  write: "attachments:write",
  delete: "attachments:delete",
} as const;

export const attachmentsManifest = definePermissionModule({
  module: "attachments",
  group: "Operations",
  permissions: ATTACHMENTS_P,
  entries: {
    read: { label: "Read Attachments", description: "View attachment metadata and linked files.", risk: "low" },
    write: { label: "Upload Attachments", description: "Create and confirm pending attachment uploads.", risk: "medium" },
    delete: { label: "Delete Attachments", description: "Permanently remove attachment records and files.", risk: "high" },
  },
});
