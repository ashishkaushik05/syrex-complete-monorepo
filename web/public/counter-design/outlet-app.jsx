// outlet-app.jsx — Counter (Outlet portal) main shell

const CT_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": false,
  "accent": "#6366F1",
  "density": "regular",
  "loggedIn": true
}/*EDITMODE-END*/;

// ─────────────────────────────────────────────────────────────
// Tab bar — 5 tabs (no Field)
// ─────────────────────────────────────────────────────────────
const CTTabBar = ({ active, onChange, cartCount }) => {
  const tabs = [
    { id: 'home',       label: 'Home',     icon: 'home' },
    { id: 'catalog',    label: 'Catalog',  icon: 'grid' },
    { id: 'orders',     label: 'Orders',   icon: 'box', badge: cartCount || null },
    { id: 'dispatches', label: 'Track',    icon: 'truck' },
    { id: 'profile',    label: 'Account',  icon: 'user' },
  ];
  return (
    <div className="rb-tabbar">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} className={"tab " + (active === t.id ? 'active' : '')}>
          <div style={{ position: 'relative' }}>
            <Icon name={t.icon} size={22} stroke={1.75} />
            {t.badge != null && (
              <span style={{
                position: 'absolute', top: -4, right: -8,
                minWidth: 16, height: 16, padding: '0 4px', borderRadius: 99,
                background: 'var(--accent)', color: '#fff',
                fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{t.badge}</span>
            )}
          </div>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Outlet "Account" / Profile (simple)
// ─────────────────────────────────────────────────────────────
const CTAccountScreen = ({ onLogout, onNav }) => {
  const u = window.CT_USER;
  return (
    <div className="rb" style={{ paddingBottom: 110 }}>
      <div className="rb-topbar">
        <div style={{ padding: '14px 16px 8px' }}>
          <h1 className="rb-h1" style={{ margin: 0 }}>Account</h1>
        </div>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <div className="rb-card" style={{ padding: 18, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <Avatar initials={u.initials} size={72} color="var(--accent)" textColor="#fff" />
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>{u.outletName}</div>
          <div className="rb-meta">{u.outletAddress}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>GSTIN · {u.gstin}</div>
        </div>
      </div>

      <Section label="Outlet" padded={true}>
        <div className="rb-card" style={{ overflow: 'hidden' }}>
          {[
            { k: 'Owner', v: u.ownerName, icon: 'user' },
            { k: 'Email', v: u.email, icon: 'doc' },
            { k: 'Delivery address', v: u.outletAddress, icon: 'pin' },
          ].map((r, i) => (
            <div key={i} className="rb-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={r.icon} size={15} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="rb-meta" style={{ marginBottom: 2 }}>{r.k}</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{r.v}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Manage" padded={true}>
        <div className="rb-card" style={{ overflow: 'hidden' }}>
          {[
            { id: 'financials', icon: 'wallet', label: 'Financials & payments', detail: 'View AR aging' },
            { id: 'invoices',   icon: 'receipt', label: 'Invoices' },
            { id: 'notif',      icon: 'bell', label: 'Notifications' },
            { id: 'help',       icon: 'help', label: 'Help & support' },
            { id: 'about',      icon: 'doc', label: 'About Counter', detail: 'v2.6.1' },
          ].map(r => (
            <button key={r.id} onClick={() => r.id === 'financials' ? onNav('financials') : r.id === 'invoices' ? onNav('invoices') : null} className="rb-row" style={{ width: '100%', textAlign: 'left' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={r.icon} size={15} />
              </div>
              <div style={{ flex: 1, fontSize: 15 }}>{r.label}</div>
              {r.detail && <span className="rb-meta">{r.detail}</span>}
              <Icon name="chev-right" size={14} color="var(--muted)" />
            </button>
          ))}
        </div>
      </Section>

      <div style={{ padding: '20px 16px 12px' }}>
        <button onClick={onLogout} className="rb-btn block lg" style={{ color: 'var(--danger)' }}>
          <Icon name="logout" size={16} color="var(--danger)" />
          Sign out
        </button>
      </div>

      <div style={{ padding: '0 16px 24px', textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>
        Counter for Outlets · v2.6.1
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────
const CTToast = ({ msg, tone = 'default' }) => msg ? (
  <div className="rb-fade-in" style={{
    position: 'absolute', top: 100, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--ink)', color: 'var(--bg)',
    padding: '10px 16px', borderRadius: 99,
    fontSize: 13, fontWeight: 500, zIndex: 100,
    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
    display: 'flex', alignItems: 'center', gap: 8,
    maxWidth: '80%',
  }}>
    <Icon name="check" size={14} color="var(--accent)" />
    {msg}
  </div>
) : null;

// ─────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────
function CounterApp() {
  const [t, setTweak] = useTweaks(CT_TWEAK_DEFAULTS);
  const [tab, setTab] = React.useState('home');
  const [route, setRoute] = React.useState(null);
  const [cart, setCart] = React.useState([]);
  const [toast, setToast] = React.useState('');

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  const nav = (target) => {
    if (target === 'home')        { setTab('home'); setRoute(null); return; }
    if (target === 'catalog')     { setTab('catalog'); setRoute(null); return; }
    if (target === 'orders')      { setTab('orders'); setRoute(null); return; }
    if (target === 'dispatches')  { setTab('dispatches'); setRoute(null); return; }
    if (target === 'invoices')    { setTab('orders'); setRoute('invoices'); return; }
    if (target === 'financials')  { setRoute('financials'); return; }
    if (target === 'profile')     { setTab('profile'); setRoute(null); return; }
    setRoute(target);
  };

  const addToCart = (product, qty = 1) => {
    setCart(prev => {
      const ex = prev.find(l => l.product.id === product.id);
      if (ex) return prev.map(l => l.product.id === product.id ? { ...l, qty: l.qty + qty } : l);
      return [...prev, { product, qty }];
    });
    showToast(`Added ${product.name.split(' ').slice(0, 3).join(' ')}…`);
  };

  // Apply theme tokens
  React.useEffect(() => {
    document.documentElement.style.setProperty('--accent', t.accent);
    document.documentElement.style.setProperty('--accent-soft', `color-mix(in oklab, ${t.accent} 14%, var(--bg))`);
    document.documentElement.style.setProperty('--accent-line', `color-mix(in oklab, ${t.accent} 35%, transparent)`);
  }, [t.accent]);

  if (!t.loggedIn) {
    return (
      <>
        <CTLoginScreen onLogin={() => setTweak('loggedIn', true)} />
        <CTTweaksPanel t={t} setTweak={setTweak} />
      </>
    );
  }

  let content;
  if (route?.startsWith('product:')) {
    content = <ProductDetailScreen productId={route.split(':')[1]} onBack={() => setRoute(null)} onAddToCart={(p, q) => { addToCart(p, q); setRoute(null); setTab('orders'); }} />;
  } else if (route === 'create-order') {
    content = <CreateOrderScreen cart={cart} setCart={setCart} onBack={() => setRoute(null)} onSubmit={(total) => {
      setCart([]); setRoute(null); setTab('orders'); showToast(`Order submitted · ${window.fmtMoney(total, { compact: true })}`);
    }} />;
  } else if (route?.startsWith('order:')) {
    content = <OrderDetailScreen orderId={route.split(':')[1]} onBack={() => setRoute(null)} onNav={nav} />;
  } else if (route?.startsWith('dispatch:')) {
    content = <CTDispatchDetailScreen dispatchId={route.split(':')[1]} onBack={() => setRoute(tab === 'dispatches' ? null : 'order:ord_19842')} onNav={nav} />;
  } else if (route?.startsWith('invoice:')) {
    content = <InvoiceDetailScreen invoiceId={route.split(':')[1]} onBack={() => setRoute(tab === 'orders' ? 'invoices' : null)} onNav={nav} />;
  } else if (route === 'invoices') {
    content = <InvoiceHistoryScreen onNav={nav} />;
  } else if (route === 'financials') {
    content = <CTFinancialsScreen onNav={nav} />;
  } else {
    if (tab === 'home')          content = <CTDashboardScreen onNav={nav} />;
    else if (tab === 'catalog')  content = <CatalogScreen onNav={nav} onAddToCart={addToCart} cart={cart} />;
    else if (tab === 'orders')   content = <OrderHistoryScreen onNav={nav} />;
    else if (tab === 'dispatches') content = <CTDispatchHistoryScreen onNav={nav} />;
    else if (tab === 'profile')  content = <CTAccountScreen onLogout={() => setTweak('loggedIn', false)} onNav={nav} />;
  }

  return (
    <div
      data-theme={t.dark ? 'dark' : 'light'}
      data-density={t.density}
      className="rb"
      style={{ height: '100%', position: 'relative', background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <div className="rb-scroll" style={{ height: '100%', overflowY: 'auto', position: 'relative' }} key={route || tab}>
        {content}
      </div>

      <CTToast msg={toast} />

      {!route && t.loggedIn && (
        <CTTabBar active={tab} onChange={(id) => { setTab(id); setRoute(null); }} cartCount={cart.length} />
      )}

      <CTTweaksPanel t={t} setTweak={setTweak} />
    </div>
  );
}

const CTTweaksPanel = ({ t, setTweak }) => (
  <TweaksPanel>
    <TweakSection label="Theme" />
    <TweakToggle label="Dark mode" value={t.dark} onChange={(v) => setTweak('dark', v)} />
    <TweakColor label="Accent"
      value={t.accent}
      options={['#6366F1', '#10B981', '#0EA5E9', '#F97316', '#E11D48']}
      onChange={(v) => setTweak('accent', v)} />
    <TweakRadio label="Density" value={t.density}
      options={['compact', 'regular', 'comfortable']}
      onChange={(v) => setTweak('density', v)} />

    <TweakSection label="Session" />
    <TweakToggle label="Logged in" value={t.loggedIn} onChange={(v) => setTweak('loggedIn', v)} />
  </TweaksPanel>
);

window.CounterApp = CounterApp;
