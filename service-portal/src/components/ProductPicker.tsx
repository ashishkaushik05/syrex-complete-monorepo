import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ImageIcon, PackageSearch, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { apiErrorMessage, portalApi } from '../lib/api'
import type { PortalCatalogProduct } from '../types'

type ProductPickerProps = {
  selectedProduct: PortalCatalogProduct | null
  onSelect: (product: PortalCatalogProduct) => void
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timeout)
  }, [delay, value])
  return debounced
}

function ProductImage({ product }: { product: PortalCatalogProduct }) {
  const [failed, setFailed] = useState(false)
  if (!product.primaryImageUrl || failed) {
    return <span className="product-image-fallback"><ImageIcon aria-hidden="true" /></span>
  }
  return (
    <img
      className="product-image"
      src={product.primaryImageUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

export function ProductPicker({ selectedProduct, onSelect }: ProductPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [brandName, setBrandName] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim(), 300)

  const facetsQuery = useQuery({
    queryKey: ['portal-catalog-facets'],
    queryFn: portalApi.listCatalogFacets,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })
  const productsQuery = useInfiniteQuery({
    queryKey: ['portal-catalog-products', debouncedSearch, brandName, categoryName],
    queryFn: ({ pageParam }) => portalApi.listCatalogProducts({
      limit: 12,
      cursor: pageParam,
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
      ...(brandName ? { brandName } : {}),
      ...(categoryName ? { categoryName } : {}),
    }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor || undefined,
    enabled: open,
    staleTime: 30 * 1000,
  })

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  const products = productsQuery.data?.pages.flatMap((page) => page.items) ?? []
  const categories = useMemo(
    () => facetsQuery.data?.find((brand) => brand.name === brandName)?.categories ?? [],
    [brandName, facetsQuery.data],
  )
  const offline = typeof navigator !== 'undefined' && !navigator.onLine

  function choose(product: PortalCatalogProduct) {
    onSelect(product)
    setOpen(false)
  }

  return (
    <div className="product-picker">
      <span className="product-picker-label">Product</span>
      {selectedProduct ? (
        <div className="selected-product-card">
          <ProductImage product={selectedProduct} />
          <span className="selected-product-copy">
            <strong>{selectedProduct.displayName || selectedProduct.name}</strong>
            <span>{selectedProduct.brandName} · {selectedProduct.categoryName}</span>
            <small>SKU {selectedProduct.sku} · {selectedProduct.warrantyMonths} month warranty</small>
          </span>
          <button type="button" className="secondary-button" onClick={() => setOpen(true)}>
            Change
          </button>
        </div>
      ) : (
        <button type="button" className="product-picker-trigger" onClick={() => setOpen(true)}>
          <PackageSearch aria-hidden="true" />
          <span><strong>Select product</strong><small>Browse the Syrex catalog</small></span>
        </button>
      )}

      {open && (
        <div className="product-picker-overlay" role="presentation">
          <section
            className="product-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-picker-title"
          >
            <header className="product-picker-header">
              <div>
                <p className="eyebrow">Product catalog</p>
                <h2 id="product-picker-title">Choose your product</h2>
                <p>Search by product name or SKU, then confirm the exact model.</p>
              </div>
              <button type="button" className="icon-button" aria-label="Close product catalog" onClick={() => setOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="catalog-toolbar">
              <label className="catalog-search">
                <Search aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search product name or SKU"
                  autoFocus
                />
              </label>
              <select
                aria-label="Filter by brand"
                value={brandName}
                onChange={(event) => {
                  setBrandName(event.target.value)
                  setCategoryName('')
                }}
              >
                <option value="">All brands</option>
                {facetsQuery.data?.map((brand) => (
                  <option key={brand.name} value={brand.name}>{brand.name}</option>
                ))}
              </select>
              <select
                aria-label="Filter by category"
                value={categoryName}
                disabled={!brandName}
                onChange={(event) => setCategoryName(event.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div className="catalog-results">
              {offline && (
                <div className="catalog-state">
                  <h3>You are offline</h3>
                  <p>Reconnect to load the product catalog.</p>
                </div>
              )}
              {!offline && productsQuery.isLoading && (
                <div className="catalog-state">Loading products...</div>
              )}
              {!offline && productsQuery.isError && (
                <div className="catalog-state">
                  <h3>We could not load the catalog</h3>
                  <p>{apiErrorMessage(productsQuery.error)}</p>
                  <button type="button" className="secondary-button" onClick={() => productsQuery.refetch()}>
                    Try again
                  </button>
                </div>
              )}
              {!offline && !productsQuery.isLoading && !productsQuery.isError && products.length === 0 && (
                <div className="catalog-state">
                  <PackageSearch aria-hidden="true" />
                  <h3>{debouncedSearch || brandName ? 'No matching products' : 'No products available'}</h3>
                  <p>Try another search or filter.</p>
                </div>
              )}
              {!offline && products.length > 0 && (
                <div className="catalog-grid">
                  {products.map((product) => (
                    <button
                      type="button"
                      className={`catalog-product-card${selectedProduct?.sku === product.sku ? ' selected' : ''}`}
                      key={product.sku}
                      onClick={() => choose(product)}
                    >
                      <ProductImage product={product} />
                      <span className="catalog-product-copy">
                        <small>{product.brandName} · {product.categoryName}</small>
                        <strong>{product.displayName || product.name}</strong>
                        <span>SKU {product.sku}</span>
                        <span>{product.warrantyMonths} month warranty</span>
                        {product.description && <p>{product.description}</p>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {productsQuery.hasNextPage && (
              <footer className="catalog-footer">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={productsQuery.isFetchingNextPage}
                  onClick={() => productsQuery.fetchNextPage()}
                >
                  {productsQuery.isFetchingNextPage ? 'Loading...' : 'Load more products'}
                </button>
              </footer>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
