# Module: Inventory / Goods Receipts
#status/done

## What it does
Warehouse inventory tracking. Goods Receipt Notes (GRNs) record stock inbound from suppliers. Stock levels are decremented on dispatch. GRN generates a GST invoice for the purchase.

## Components
- **Backend:** `inventory.ts`, `images.ts`, `attachments.ts`
- **Web:** GoodsReceiptsPage, GoodsReceiptDetailPage, GoodsReceiptInvoicePDF
- **Schema:** RBAC module at `src/rbac/modules/inventory.ts`

## Status
- ✅ GRN creation with line items
- ✅ GST invoice generation for GRNs
- ✅ Stock level tracking per warehouse per SKU
- ✅ Image + attachment upload support
- ✅ Tests: `inventory.test.ts`
- ⚠️ Attachment storage is local filesystem — not production-safe (no S3/R2)
- ❌ L-10: `attachment.storageKey` has no format validation (path traversal risk)

## Open Issues
- L-10 → [[audit/ISSUES#L-10]]

## Key Decisions
- [[decisions/orders]] — GRN decisions tracked alongside orders

## Related Docs
- [[audit/agent-batches/08-schema-migration]]
