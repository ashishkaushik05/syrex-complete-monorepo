import { definePermissionModule } from "../core";

export const FIELD_P = {
  read: "field:read",
  write: "field:write",
  admin: "field:admin",
} as const;

export const fieldManifest = definePermissionModule({
  module: "field",
  group: "Field Sense",
  permissions: FIELD_P,
  entries: {
    read: { label: "Read Field Data", description: "View field shifts, locations, attendance, visits, and schedules.", risk: "low" },
    write: { label: "Manage Field Data", description: "Record own shifts, location pings, visits, and attendance.", risk: "medium" },
    admin: { label: "Field Admin", description: "Set schedules and mark attendance for other users; perform cross-user field overrides.", risk: "high" },
  },
});
