# Order History Migration Report

Source analyzed: `YBK GODOWNS DISPATCH 2025-26 - Order Rec..csv`

## 1) What this file contains
- Total rows parsed: `920`
- Detected historical order rows: `853`
- Max columns: `190`
- Structure: 2-row header + wide SKU matrix + one row per order

Core order columns (stable):
1. `Upd. On D S Date`
2. `Order No`
3. `Order By`
4. `Date`
5. `App. Date`
6. `Remark If Not App.`
7. `Dealer Name & Address`
8. `Front Discount`
9. `Req. Date`
10. `FOC`
11. `Committ. With Mat.`
12. `Total`

After col 12, file stores quantities in product-family columns (e.g. `TT17536`, `JT18024`, lithium + inverter SKU buckets) with sub-columns (`sy`, `slt`, `sb`, etc.).

## 2) Data quality and constraints
- Date fields are mostly parseable but not fully clean:
  - `order date` valid single-date rows: `850/853`
  - `upd on` valid single-date rows: `748/853`
  - `app date` valid single-date rows: `748/853`
  - Some multiline date cells exist.
- Order split variants exist: `HR1062(A/B/C)` style.
- Exact duplicate order numbers exist (`11` duplicates), so idempotent dedupe is required.
- Dealer names are free text (853 present, ~270 unique spellings): needs outlet/dealer normalization.
- Average non-zero item columns per order: `~3.9` (sparse matrix, not dense cart).

## 3) Mapping to current schema
Target tables in current system:
- `sale_orders`
- `sale_order_lines`
- `products`
- `outlets`

### Proposed field mapping
- `sale_orders.orderNumber` <= `Order No`
- `sale_orders.orderDate` <= `Date`
- `sale_orders.submittedAt` <= `Upd. On D S Date` (if valid)
- `sale_orders.approvedAt` <= `App. Date` (if valid)
- `sale_orders.deliveryAddress` <= `Dealer Name & Address`
- `sale_orders.notes` <= concatenated legacy fields:
  - `Front Discount`, `Req. Date`, `FOC`, `Committ. With Mat.`, `Remark If Not App.`
- `sale_orders.totalValue` <= `Total` (numeric parse)
- `sale_orders.status` inferred:
  - if approved date present -> `approved`
  - else -> `pending_approval`

For lines:
- Each non-zero quantity cell in product matrix => one `sale_order_lines` row.
- `qtyOrdered` = parsed numeric value.
- `sku/productId` resolved via SKU mapping dictionary (see below).

## 4) Critical requirement: SKU mapping dictionary
This CSV does **not** directly use your canonical `products.sku` IDs.

You need a mapping table before migration:
- `legacy_family` (e.g. `TT17536`)
- `legacy_variant` (e.g. `sy/slt/sb/p/liv/liv.a/...`)
- `legacy_column_index`
- `target_product_id`
- `target_sku`
- `confidence`
- `is_active`

Without this mapping, imported lines cannot reliably connect to existing catalog SKUs.

## 5) Migration architecture (recommended)

### Stage A: Raw landing (no transformation)
Create raw staging table (`legacy_order_rec_raw`) with:
- `batch_id`
- `source_file`
- `row_index`
- `row_json`
- `ingested_at`

### Stage B: Canonical staging
Explode raw rows to:
- `legacy_orders_stg` (1 row/order)
- `legacy_order_lines_stg` (1 row/non-zero matrix cell)
- `legacy_parse_errors` (invalid dates, unknown SKU columns, bad qty)

### Stage C: Reference resolution
- Dealer/outlet resolver:
  - exact name
  - normalized name (trim, punctuation cleanup)
  - optional city token
- SKU resolver:
  - join by `legacy_column_index` + `legacy_family` + `legacy_variant`

### Stage D: Final upsert
- Upsert to `sale_orders` by (`orgId`, `orderNumber`) for idempotency.
- Upsert lines by (`orderId`, `productId`) with qty merge rules.
- Keep legacy trace IDs in `notes` or separate audit table.

## 6) Split-order handling (A/B/C)
Treat these as child revisions under a base number:
- base key: `HR1062`
- variant: `A/B/C`

For now (without Order V2 parent-child schema), import as independent `sale_orders` while preserving base linkage in notes/metadata.

## 7) Import policy decisions needed
1. Backdated status policy:
- import as `approved` vs `fully_dispatched` vs `pending_approval`
2. Totals policy:
- trust CSV `Total` vs recompute from product price list snapshot
3. Dealer matching policy:
- strict-only vs strict+fuzzy fallback
4. Unknown SKU policy:
- block row vs import to suspense SKU bucket

## 8) Suggested execution plan
1. Build `legacy_order_rec_raw` + `legacy_orders_stg` + `legacy_order_lines_stg` tables.
2. Build SKU mapping sheet from this file's matrix columns.
3. Run dry-run parser and produce reconciliation report:
- rows in source
- rows parsed
- rows skipped
- orders with unknown dealers
- lines with unknown SKUs
4. Validate 50 sampled orders against source.
5. Execute prod import in batches with idempotent upsert.
6. Freeze batch and archive import logs.

## 9) Expected output after migration
- Full historical orders searchable in Accounts/Orders.
- Historical line items per order retained.
- Split legacy orders retained (`HRxxxx(A/B/C)`).
- Source-level audit trace for each imported row.

