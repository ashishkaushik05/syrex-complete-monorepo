# Module: Catalog (Products / SKUs / Brands / Categories)
#status/done

## What it does
Product catalog management. SKUs (stock-keeping units) belong to brands and categories. Products are the sellable units with pricing. Used by orders, inventory, and service modules.

## Components
- **Backend:** `products.ts`, `brands.ts`, `categories.ts`
- **Web:** CatalogSkusPage, CatalogBrandsPage, CatalogCategoriesPage

## Status
- ✅ Brand CRUD
- ✅ Category CRUD (hierarchical)
- ✅ Product / SKU CRUD with pricing
- ✅ SKU demand prediction endpoint (`sku-demand.ts`)
- ⚠️ No tests for brands, categories, or products routes
- ⚠️ SKU demand model exists but no web UI showing predictions

## Open Issues
None critical. No test coverage is the main gap.

## Key Decisions
- [[decisions/infrastructure]] — SKU demand prediction decision (DEC-20260605-001)

## Related Docs
- [[api-spec/02-ENDPOINT_CATALOG]]
