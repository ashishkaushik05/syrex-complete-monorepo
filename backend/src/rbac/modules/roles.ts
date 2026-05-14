import { definePermissionModule } from "../core";

export const ROLES_P = {
  read: "roles:read",
  write: "roles:write",
  delete: "roles:delete",
} as const;

export const rolesManifest = definePermissionModule({
  module: "roles",
  group: "Administration",
  permissions: ROLES_P,
  entries: {
    read: { label: "Read Roles", description: "View role definitions and their permission sets.", risk: "low" },
    write: { label: "Manage Roles", description: "Create and update role definitions.", risk: "high" },
    delete: { label: "Delete Roles", description: "Permanently remove a role definition not assigned to any user.", risk: "high" },
  },
});
