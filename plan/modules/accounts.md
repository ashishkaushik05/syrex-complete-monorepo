# Module: Accounts / Payments / Invoices
#status/done

## What it does
Financial ledger for the platform. Invoices generated from orders and GRNs. Payments recorded against invoices. AR aging, outstanding balances, and approval queues for admin. Org billing profile stores GST/tax details.

## Components
- **Backend:** `accounts.ts`, `payments.ts`, `invoices.ts`, `org-billing-profile.ts`
- **Web:** AccountsARAgingPage, AccountsApprovalQueuePage, AccountsOutstandingPage, AccountsPaymentsPage, AccountsStatementPage, SalesInvoicesPage, BillingSettingsPage, InvoicePDF, GoodsReceiptInvoicePDF

## Status
- ✅ Invoice generation (sales orders + GRNs)
- ✅ Payment recording + reconciliation
- ✅ AR aging + outstanding balance views
- ✅ Approval queue for large payments
- ✅ Org billing profile (GST details)
- ✅ Tests: `accounts.test.ts`, `payments.test.ts`, `invoices.test.ts`
- ❌ H-10: Auto-invoice uses live tax instead of `order.taxSnapshot`
- ❌ M-11: `unitPrice` accepts empty strings (no numeric validation)
- ❌ L-17: `amountPaid` can exceed `total` (no constraint)

## Open Issues
- H-10 → [[audit/ISSUES#H-10]]
- M-11 → [[audit/ISSUES#M-11]]
- L-17 → [[audit/ISSUES#L-17]]

## Key Decisions
- [[decisions/accounts]] — all accounts/payments decisions

## Related Docs
- [[accounts/ACCOUNTS_FEATURES]]
- [[api-spec/04-DATA_SIDE_EFFECTS_REFERENCE]]
