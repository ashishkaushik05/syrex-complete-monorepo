# Battery SKU CSV Import System Plan

## 1) How SKUs are currently saved

Based on current backend code:

- `Product.sku` is required + unique and `Product.skuCode` is optional + unique.
- Current SKU create path writes both fields from one value (`sku = skuCode`, `skuCode = skuCode`).
- Current update path keeps `sku` and `skuCode` in sync when SKU code changes.
- Catalog SKU create API rejects duplicate SKU code.

References:
- `/home/ashish/Documents/code/syrex-new/prisma/schema.prisma` (Product model)
- `/home/ashish/Documents/code/syrex-new/packages/api/src/modules/catalog/repository.ts` (`createSku`, `updateSku`, `findSkuBySkuCode`)
- `/home/ashish/Documents/code/syrex-new/packages/api/src/modules/catalog/service.ts` (`createSku` duplicate validation)

## 2) Source CSV analysis

Files analyzed (`8` CSV files, `35` rows total):
- `short_tubular_batteries.csv` (4)
- `tall_tubular_batteries.csv` (11)
- `pure_sinewave_lithium_inverters.csv` (6)
- `solar_hybrid_mppt_pcu.csv` (3)
- `lithium_inverter_batteries.csv` (3)
- `lithium_ev_batteries_lfp.csv` (3)
- `lithium_ev_batteries_nmc.csv` (3)
- `lithium_ev_batteries_shakti.csv` (2)

### Extracted unique headers (stripped/normalized)

1. `model`
2. `ah`
3. `capacity_va`
4. `voltage_v`
5. `warranty_months`
6. `warranty_label`
7. `warranty_primary_months`
8. `warranty_exchange_window_months`
9. `basic_price_inr`
10. `gst_percent`
11. `gst_amount_inr`
12. `including_gst_inr`
13. `mrp_inr`
14. `points`
15. `product_type`
16. `warranty_note`

### Headerless output

Header-removed copies are available in:
- `/home/ashish/Documents/code/syrex-new/warehouse_csvs/ybk_catalog_csvs/headerless/`

## 3) Unified template (single ingestion format)

Template file created:
- `/home/ashish/Documents/code/syrex-new/warehouse_csvs/ybk_catalog_csvs/UNIFIED_SKU_TEMPLATE.csv`

Template objective:
- every incoming SKU row (battery/inverter/charger) is converted to one common row schema before DB write.

Key normalized fields:
- hierarchy: `brand`, `category`, `type_name`, `product_kind`
- identity: `model`, `sku_code`, `display_name`
- pricing/warranty: `base_price_inr`, `warranty_months`, `mrp_inr`, `gst_percent`, `including_gst_inr`
- optional attributes: `ah`, `capacity_va`, `voltage_v`, `points`, warranty split fields, notes
- traceability: `source_file`, `source_row`

## 4) Required system changes (plan only)

### A. Import pipeline module

Add one import orchestrator in API:
- new file: `packages/api/src/modules/catalog/importer.ts`
- responsibilities:
1. Read all CSVs from folder.
2. Validate and normalize rows into unified template.
3. Resolve/create hierarchy (`Brand -> Category -> ProductType`).
4. Upsert SKU using deterministic `sku_code`.
5. Emit run report (`created/updated/skipped/errors`).

### B. Validation schemas

Extend catalog schemas:
- file: `packages/api/src/modules/catalog/types.ts`
- add:
1. `ImportSkuRowSchema` (unified template row)
2. `ImportSkusRequestSchema` (`dryRun`, `rows[]`, options)

### C. Repository support

Extend repo helpers:
- file: `packages/api/src/modules/catalog/repository.ts`
- add:
1. `findCategoryByName`, `findBrandByName`
2. `findProductTypeByComposite` (already exists; reuse)
3. `upsertSkuByCode` helper (create-or-update)

### D. Service-level import flow

Extend service layer:
- file: `packages/api/src/modules/catalog/service.ts`
- add:
1. `importSkusFromRows(rows, options)`
2. duplicate conflict strategy (`skip`, `update`, `error`)
3. deterministic SKU code rule:
   - recommended: `<brand-code>-<category-code>-<type-code>-<model-code>`
   - needed because some model names repeat across files (`NER 3850`, `NER 5500`)

### E. API endpoint (optional but recommended)

Expose import endpoint for admin UI/automation:
- file: `packages/api/src/modules/catalog/router.ts`
- add:
1. `POST /catalog/skus/import`
2. `catalog:write` permission guard
3. dry-run mode mandatory by default

### F. Operational safety

1. Always run dry-run first.
2. Write an import audit record (timestamp, file set, row counts, errors).
3. Enforce idempotency using deterministic `sku_code`.
4. Reject rows missing mandatory fields (`brand`, `category`, `type_name`, `model`, `base_price_inr`, `warranty_months`).

## 5) Transformation rules from current CSVs

1. `model -> model`, and default `display_name = model`.
2. `basic_price_inr -> base_price_inr`.
3. `warranty_months` uses:
   - direct `warranty_months` when present
   - otherwise `warranty_primary_months`.
4. Any extra fields move into optional template columns and/or `specs` JSON.
5. `product_type` from EV files maps to `product_kind` (`battery`/`charger`).

## 6) What is not done in this step

1. No DB import executed.
2. No API/import code wired yet.
3. No existing catalog records modified.

This step delivers analysis + template + implementation blueprint.
