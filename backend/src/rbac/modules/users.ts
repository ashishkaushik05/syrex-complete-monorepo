import { definePermissionModule } from "../core";

export const USERS_P = {
  read: "users:read",
  write: "users:write",
  invite: "users:invite",
  deactivate: "users:deactivate",
  "field-enable": "users:field-enable",
} as const;

export const usersManifest = definePermissionModule({
  module: "users",
  group: "Administration",
  permissions: USERS_P,
  entries: {
    read: { label: "Read Users", description: "View users and profile-level details.", risk: "low" },
    write: { label: "Manage Users", description: "Create and update user profiles, roles, and passwords.", risk: "high" },
    invite: { label: "Manage Invitations", description: "Create, list, revoke, and accept user invitations.", risk: "medium" },
    deactivate: { label: "Deactivate Users", description: "Remove or deactivate a user account.", risk: "high" },
    "field-enable": { label: "Enable Field Sense", description: "Toggle Field Sense access on or off for a user.", risk: "medium" },
  },
});
