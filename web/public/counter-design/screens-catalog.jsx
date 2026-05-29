// screens-catalog.jsx — Catalog browser + Product detail

// ─────────────────────────────────────────────────────────────
// 3. Catalog browser — brand → category → product hierarchy
//    Implemented as a single screen that tracks `level`.
// ─────────────────────────────────────────────────────────────
const CatalogScreen = ({ onNav, onAddToCart, cart }) => {
  const [level, setLevel] = React.useState('brands'); // brands | categories | products
  const [brandId, setBrandId] = React.useState(null);
  const [categoryId, setCategoryId] = React.useState(null);
  const [q, setQ] = React.useState('');

  const brand = brandId ? window.RB_BRANDS.find(b => b.id === brandId) : null;
  const cats = brandId ? (window.RB_CATEGORIES[brandId] || []) : [];
  const products = categoryId
    ? window.RB_PRODUCTS.filter(p => p.categoryId === categoryId)
    : (brandId ? window.RB_PRODUCTS.filter(p => p.brandId === brandId) : []);

  const filteredBrands = window.RB_BRANDS.filter(b => !q || b.name.toLowerCase().includes(q.toLowerCase()));
  const filteredProducts = products.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  // breadcrumb path
  const crumbs = [{ label: 'All brands', back: () => { setLevel('brands'); setBrandId(null); setCategoryId(null); } }];
  if (brand) crumbs.push({ label: brand.name, back: () => { setLevel('categories'); setCategoryId(null); } });
  if (categoryId) crumbs.push({ label: cats.find(c => c.id === categoryId)?.name, back: () => setLevel('products') });

  return (
    <div className="rb" style={{ paddingBottom: 110 }}>
      <div className="rb-topbar">
        <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 className="rb-h1" style={{ margin: 0, flex: 1 }}>Catalog</h1>
          {cart?.length > 0 && (
            <IconBtn name="cart" badge={cart.length} onClick={() => onNav('create-order')} />
          )}
        </div>

        {/* Breadcrumbs */}
        {crumbs.length > 1 && (
          <div style={{ padding: '0 16px 10px', display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto' }} className="rb-scroll">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Icon name="chev-right" size={12} color="var(--muted)" />}
                <button onClick={c.back} style={{
                  fontSize: 13, fontWeight: i === crumbs.length - 1 ? 600 : 400,
                  color: i === crumbs.length - 1 ? 'var(--ink)' : 'var(--muted)',
                  whiteSpace: 'nowrap',
                }}>{c.label}</button>
              </React.Fragment>
            ))}
          </div>
        )}

        <div style={{ padding: '0 16px 12px' }}>
          <SearchInput value={q} onChange={setQ} placeholder={
            level === 'brands' ? 'Search brands…' :
            level === 'categories' ? 'Search categories…' :
            'Search products, SKU…'
          } />
        </div>
      </div>

      {/* BRAND LEVEL */}
      {level === 'brands' && (
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {filteredBrands.map(b => (
              <button key={b.id} onClick={() => { setBrandId(b.id); setLevel('categories'); }} className="rb-card" style={{
                padding: 14, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10, height: 124,
              }}>
                <ProductTile color={b.color} size={44} glyph="grid" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{b.name}</div>
                  <div className="rb-meta" style={{ marginTop: 2 }}>{b.tagline}</div>
                </div>
                <div className="rb-meta num">{b.productCount} products</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CATEGORY LEVEL */}
      {level === 'categories' && brand && (
        <div style={{ padding: '14px 0' }}>
          {/* All products of brand button */}
          <div style={{ padding: '0 16px 12px' }}>
            <button onClick={() => setLevel('products')} className="rb-card" style={{
              width: '100%', padding: 12, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
            }}>
              <ProductTile color={brand.color} size={36} glyph="box" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>All {brand.name} products</div>
                <div className="rb-meta num">{brand.productCount} items</div>
              </div>
              <Icon name="chev-right" size={16} color="var(--muted)" />
            </button>
          </div>
          <Section label="Categories" padded={true}>
            <div className="rb-card" style={{ overflow: 'hidden' }}>
              {cats.map((c, i) => (
                <button key={c.id} onClick={() => { setCategoryId(c.id); setLevel('products'); }} className="rb-row" style={{ width: '100%', textAlign: 'left' }}>
                  <div style={{ flex: 1, fontSize: 15 }}>{c.name}</div>
                  <span className="rb-meta num">{c.count}</span>
                  <Icon name="chev-right" size={14} color="var(--muted)" />
                </button>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* PRODUCT LEVEL */}
      {level === 'products' && (
        <div style={{ padding: '12px 16px' }}>
          {filteredProducts.length === 0 ? (
            <Empty title="No products match" sub="Try a different query." />
          ) : filteredProducts.map(p => (
            <ProductRow key={p.id} product={p} onTap={() => onNav('product:' + p.id)} onAdd={() => onAddToCart?.(p)} />
          ))}
        </div>
      )}
    </div>
  );
};

const ProductRow = ({ product, onTap, onAdd }) => {
  const b = window.RB_BRANDS.find(x => x.id === product.brandId);
  return (
    <div className="rb-card" style={{ padding: 12, display: 'flex', gap: 12, marginBottom: 8 }}>
      <button onClick={onTap} style={{ display: 'flex', flex: 1, alignItems: 'flex-start', gap: 12, textAlign: 'left' }}>
        <ProductTile color={b?.color} size={64} glyph="box" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
            {b?.name}
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{product.name}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{product.sku}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <span className="rb-money" style={{ fontSize: 15, fontWeight: 600 }}>{window.fmtMoney(product.basePrice)}</span>
            <span className="rb-money" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'line-through' }}>{window.fmtMoney(product.mrp)}</span>
          </div>
        </div>
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <span className={"rb-chip " + (product.stock > 10 ? 'success' : product.stock > 0 ? 'warn' : 'danger')}>
          <span className="num">{product.stock}</span>&nbsp;in stock
        </span>
        <button onClick={onAdd} className="rb-btn sm" style={{ background: 'var(--ink)', color: 'var(--bg)', borderColor: 'transparent' }}>
          <Icon name="plus" size={14} /> Add
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 4. Product detail
// ─────────────────────────────────────────────────────────────
const ProductDetailScreen = ({ productId, onBack, onAddToCart }) => {
  const product = window.RB_PRODUCTS.find(p => p.id === productId) || window.RB_PRODUCTS[0];
  const brand = window.RB_BRANDS.find(b => b.id === product.brandId);
  const [qty, setQty] = React.useState(1);
  const savings = product.mrp - product.basePrice;
  const savingsPct = Math.round((savings / product.mrp) * 100);

  return (
    <div className="rb" style={{ paddingBottom: 100 }}>
      <div className="rb-topbar">
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconBtn name="chev-left" onClick={onBack} />
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--muted)' }} className="mono">{product.sku}</div>
          <IconBtn name="star" />
        </div>
      </div>

      {/* Hero image */}
      <div style={{ padding: '8px 16px 0' }}>
        <div style={{
          height: 240, borderRadius: 16,
          background: `linear-gradient(160deg, ${brand?.color}, color-mix(in oklab, ${brand?.color} 60%, #000))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <Icon name="box" size={96} stroke={1} color="rgba(255,255,255,0.85)" />
          <div style={{
            position: 'absolute', top: 12, left: 12,
            background: 'rgba(255,255,255,0.18)', color: '#fff',
            fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 999,
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          }}>{brand?.name}</div>
          {savingsPct >= 5 && (
            <div style={{
              position: 'absolute', top: 12, right: 12,
              background: 'var(--accent)', color: '#fff',
              fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
            }}>−{savingsPct}%</div>
          )}
        </div>
      </div>

      {/* Title & price */}
      <div style={{ padding: '18px 16px 8px' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          {brand?.name}
        </div>
        <h1 className="rb-h2" style={{ margin: 0, lineHeight: 1.25 }}>{product.name}</h1>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
          <span className="rb-money" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em' }}>
            {window.fmtMoney(product.basePrice)}
          </span>
          <span className="rb-money" style={{ fontSize: 14, color: 'var(--muted)', textDecoration: 'line-through' }}>
            {window.fmtMoney(product.mrp)}
          </span>
          {savings > 0 && (
            <span className="rb-chip success">Save {window.fmtMoney(savings, { compact: true })}</span>
          )}
        </div>
        <div className="rb-meta" style={{ marginTop: 4 }}>+ GST as applicable. Distributor pricing.</div>
      </div>

      {/* Stock & warranty pills */}
      <div style={{ padding: '8px 16px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className={"rb-chip " + (product.stock > 10 ? 'success' : 'warn')}>
          <span className="rb-dot live" /> <span className="num">{product.stock}</span>&nbsp;in stock
        </span>
        <span className="rb-chip info">
          <Icon name="shield" size={12} /> {Math.round(product.warrantyMonths / 12)} yr warranty
        </span>
        <span className="rb-chip">
          <Icon name="truck" size={12} /> 2–4 days
        </span>
      </div>

      {/* Description */}
      <Section label="Description" padded={true}>
        <div className="rb-body" style={{ color: 'var(--ink-2)' }}>{product.description}</div>
      </Section>

      {/* Specs */}
      <Section label="Specifications" padded={true}>
        <div className="rb-card" style={{ overflow: 'hidden' }}>
          {product.specs.map((s, i) => (
            <div key={i} className="rb-row" style={{ minHeight: 44 }}>
              <div className="rb-meta" style={{ flex: 1 }}>{s.k}</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </Section>

      <div style={{ height: 24 }} />

      {/* Sticky bottom: qty + add */}
      <div style={{
        position: 'absolute', bottom: 84, left: 0, right: 0,
        padding: '10px 16px', background: 'color-mix(in oklab, var(--bg) 90%, transparent)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderTop: '0.5px solid var(--line)',
        display: 'flex', gap: 10, alignItems: 'center', zIndex: 25,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', height: 44,
          background: 'var(--surface)', border: '0.5px solid var(--line)', borderRadius: 10,
        }}>
          <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: 40, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="minus" size={14} />
          </button>
          <div style={{ width: 32, textAlign: 'center', fontSize: 15, fontWeight: 600 }} className="num">{qty}</div>
          <button onClick={() => setQty(qty + 1)} style={{ width: 40, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={14} />
          </button>
        </div>
        <button onClick={() => onAddToCart?.(product, qty)} className="rb-btn accent" style={{ flex: 1, height: 44 }}>
          <Icon name="plus" size={16} />
          Add {window.fmtMoney(product.basePrice * qty)}
        </button>
      </div>
    </div>
  );
};

Object.assign(window, { CatalogScreen, ProductDetailScreen, ProductRow });
