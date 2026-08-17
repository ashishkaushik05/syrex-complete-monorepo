import { definePermissionModule } from "../core";

export const ACCOUNTS_P = {
  read: "accounts:read",
  write: "accounts:write",
} as const;

export const accountsManifest = definePermissionModule({
  module: "accounts",
  group: "Finance",
  permissions: ACCOUNTS_P,
  entries: {
    read: {
      label: "Read Accounts",
      description: "View the general ledger, trial balance, and chart of accounts.",
      risk: "low",
    },
    write: {
      label: "Manage Accounts",
      description: "Post manual journal entries and adjust the chart of accounts.",
      risk: "high",
    },
  },
});
