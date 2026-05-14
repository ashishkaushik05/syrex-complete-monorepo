import { definePermissionModule } from "../core";

export const PAYMENTS_P = {
  read: "payments:read",
  write: "payments:write",
  void: "payments:void",
} as const;

export const paymentsManifest = definePermissionModule({
  module: "payments",
  group: "Finance",
  permissions: PAYMENTS_P,
  entries: {
    read: { label: "Read Payments", description: "View payment history and payment details.", risk: "low" },
    write: { label: "Create Payments", description: "Record and submit payment transactions against outlet balances.", risk: "high" },
    void: { label: "Void Payments", description: "Reverse a recorded payment and undo its invoice allocations.", risk: "high" },
  },
});
