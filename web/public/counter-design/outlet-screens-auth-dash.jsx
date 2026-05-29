// outlet-screens-auth-dash.jsx — Counter: Login + Dashboard

// ─────────────────────────────────────────────────────────────
// 1. Login
// ─────────────────────────────────────────────────────────────
const CTLoginScreen = ({ onLogin }) => {
  const [email, setEmail] = React.useState('store@sunrise-electronics.in');
  const [password, setPassword] = React.useState('••••••••');
  const [showPw, setShowPw] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const submit = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin?.(); }, 600);
  };

  return (
    <div className="rb" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ flex: 1, padding: '60px 24px 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'var(--accent)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 18, letterSpacing: '-0.04em',
          }}>C</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em' }}>Counter</div>
            <div className="rb-meta">Outlet portal · KiranaTech</div>
          </div>
        </div>

        <h1 className="rb-h1" style={{ margin: 0, marginBottom: 8 }}>Sign in to your outlet</h1>
        <div className="rb-body" style={{ marginBottom: 28 }}>Track orders, invoices, and payments from {window.CT_USER.outletName}.</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, fontWeight: 500 }}>Outlet email</div>
            <input className="rb-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </label>
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, fontWeight: 500, display: 'flex', justifyContent: 'space-between' }}>
              <span>Password</span>
              <span style={{ color: 'var(--accent)' }}>Forgot?</span>
            </div>
            <div style={{ position: 'relative' }}>
              <input className="rb-input" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 44 }} />
              <button onClick={() => setShowPw(!showPw)} style={{
                position: 'absolute', right: 6, top: 6, width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)',
              }}>
                <Icon name={showPw ? 'eye-off' : 'eye'} size={18} />
              </button>
            </div>
          </label>
        </div>

        <button onClick={submit} className="rb-btn primary lg block" style={{ marginTop: 24 }} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
          {!loading && <Icon name="arrow-right" size={16} />}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0' }}>
          <div style={{ flex: 1, height: 0.5, background: 'var(--line)' }} />
          <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>or</div>
          <div style={{ flex: 1, height: 0.5, background: 'var(--line)' }} />
        </div>

        <button className="rb-btn outline block lg">
          <Icon name="phone" size={16} />
          Sign in with mobile OTP
        </button>

        <div style={{ flex: 1 }} />

        <div style={{ padding: '24px 0 32px', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
          Counter for Outlets · v2.6.1
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 2. Dashboard
// ─────────────────────────────────────────────────────────────
const CTDashboardScreen = ({ onNav }) => {
  const u = window.CT_USER;
  const s = window.CT_SUMMARY;
  const recent = window.RB_ORDERS.slice(0, 3);
  const activeDis = window.CT_DISPATCHES.filter(d => d.status === 'in_transit' || d.status === 'out_for_delivery').slice(0, 2);
  const usedPct = Math.round((s.creditAvailable / u.creditLimit) * 100); // available

  return (
    <div className="rb" style={{ paddingBottom: 110 }}>
      <div className="rb-topbar">
        <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar initials={u.initials} size={36} color="var(--accent)" textColor="#fff" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rb-meta">Welcome back</div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.outletName}</div>
          </div>
          <IconBtn name="bell" badge={s.pendingDeliveries} />
        </div>
      </div>

      {/* Hero — credit card style */}
      <div style={{ padding: '14px 16px 0' }}>
        <div className="rb-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Outstanding balance</div>
            <span className="rb-chip warn">
              <span className="rb-dot warn" /> {s.openInvoices} open · {s.overdueInvoices} overdue
            </span>
          </div>
          <div className="rb-money" style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1 }}>
            {window.fmtMoney(s.outstandingBalance)}
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
              <span>Credit available</span>
              <span><span className="rb-money" style={{ color: 'var(--ink)', fontWeight: 600 }}>{window.fmtMoney(s.creditAvailable, { compact: true })}</span> of {window.fmtMoney(u.creditLimit, { compact: true })}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: usedPct + '%', background: 'var(--accent)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => onNav('invoices')} className="rb-btn outline" style={{ flex: 1 }}>
              <Icon name="receipt" size={14} /> Invoices
            </button>
            <button onClick={() => onNav('financials')} className="rb-btn primary" style={{ flex: 1 }}>
              <Icon name="wallet" size={14} /> Pay now
            </button>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <Section label="Quick actions" padded={true}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { id: 'create-order', icon: 'plus',    label: 'New order' },
            { id: 'catalog',      icon: 'grid',    label: 'Catalog' },
            { id: 'dispatches',   icon: 'truck',   label: 'Track' },
            { id: 'financials',   icon: 'wallet',  label: 'Pay' },
          ].map(a => (
            <button key={a.id} onClick={() => onNav(a.id)} className="rb-card" style={{
              padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
              <Icon name={a.icon} size={20} />
              <span style={{ fontSize: 11, fontWeight: 500 }}>{a.label}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Inline stats */}
      <div style={{ padding: '8px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={() => onNav('orders')} className="rb-card" style={{ padding: 14, textAlign: 'left' }}>
            <div className="rb-meta" style={{ marginBottom: 6 }}>Total orders</div>
            <div className="rb-stat-num">{s.totalOrders}</div>
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--accent)', fontWeight: 500 }}>+{s.ordersThisMonth} this month</div>
          </button>
          <button onClick={() => onNav('dispatches')} className="rb-card" style={{ padding: 14, textAlign: 'left' }}>
            <div className="rb-meta" style={{ marginBottom: 6 }}>Active dispatches</div>
            <div className="rb-stat-num">{s.activeDispatches}</div>
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--warn)', fontWeight: 500 }}>{s.pendingDeliveries} arriving today</div>
          </button>
        </div>
      </div>

      {/* Active dispatches */}
      {activeDis.length > 0 && (
        <Section label="Arriving soon" action="Track all" onAction={() => onNav('dispatches')}>
          <div className="rb-card" style={{ overflow: 'hidden' }}>
            {activeDis.map(d => (
              <button key={d.id} onClick={() => onNav('dispatch:' + d.id)} className="rb-row" style={{ width: '100%', textAlign: 'left' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: d.status === 'out_for_delivery' ? 'var(--warn-soft)' : 'var(--info-soft)',
                  color: d.status === 'out_for_delivery' ? 'var(--warn)' : 'var(--info)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name="truck" size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{d.code}</span>
                    <StatusChip status={d.status} statusMap={window.CT_DISPATCH_STATUS_META} />
                  </div>
                  <div className="rb-meta">{d.transporter} · ETA {d.expectedAt}</div>
                </div>
                <Icon name="chev-right" size={14} color="var(--muted)" />
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* Recent orders */}
      <Section label="Recent orders" action="See all" onAction={() => onNav('orders')}>
        <div className="rb-card" style={{ overflow: 'hidden' }}>
          {recent.map(o => (
            <button key={o.id} onClick={() => onNav('order:' + o.id)} className="rb-row" style={{ width: '100%', textAlign: 'left' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{o.code}</span>
                  <StatusChip status={o.status} />
                </div>
                <div className="rb-meta">{o.date} · {o.lineCount} items</div>
              </div>
              <div className="rb-money" style={{ fontSize: 14, fontWeight: 600 }}>{window.fmtMoney(o.total)}</div>
            </button>
          ))}
        </div>
      </Section>

      <div style={{ height: 24 }} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 10. Financials
// ─────────────────────────────────────────────────────────────
const CTFinancialsScreen = ({ onNav }) => {
  const u = window.CT_USER;
  const s = window.CT_SUMMARY;
  const aging = window.CT_AR_AGING;
  const payments = window.CT_PAYMENTS;

  const totalAR = aging.reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="rb" style={{ paddingBottom: 110 }}>
      <div className="rb-topbar">
        <div style={{ padding: '14px 16px 8px' }}>
          <h1 className="rb-h1" style={{ margin: 0 }}>Financials</h1>
          <div className="rb-meta" style={{ marginTop: 2 }}>FY 2026 · {u.outletName}</div>
        </div>
      </div>

      {/* Outstanding hero */}
      <div style={{ padding: '14px 16px 0' }}>
        <div className="rb-card" style={{ padding: 18, background: 'var(--ink)', color: 'var(--bg)', border: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Total outstanding</div>
          <div className="rb-money" style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 6, lineHeight: 1 }}>
            {window.fmtMoney(totalAR)}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 12, opacity: 0.85 }}>
            <span><span className="num" style={{ fontWeight: 600 }}>{s.openInvoices}</span> open invoices</span>
            <span><span className="num" style={{ fontWeight: 600 }}>{s.overdueInvoices}</span> overdue</span>
          </div>
          <button className="rb-btn" style={{
            marginTop: 14, height: 44, width: '100%',
            background: 'var(--accent)', color: '#fff', border: 0,
          }}>
            <Icon name="wallet" size={16} />
            Pay outstanding · {window.fmtMoney(totalAR, { compact: true })}
          </button>
        </div>
      </div>

      {/* AR aging */}
      <Section label="Receivables aging" padded={true}>
        <div className="rb-card" style={{ padding: 16 }}>
          {/* Stacked bar */}
          <div style={{ display: 'flex', height: 36, borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
            {aging.map((b, i) => {
              const pct = (b.amount / totalAR) * 100;
              return (
                <div key={i} title={b.label + ': ' + window.fmtMoney(b.amount)} style={{
                  width: pct + '%', background: b.color, position: 'relative',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 10, fontWeight: 600,
                }}>
                  {pct > 14 && <span className="num">{Math.round(pct)}%</span>}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {aging.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{b.bucket}</div>
                  <div className="rb-meta">{b.label} · <span className="num">{b.count}</span> {b.count === 1 ? 'invoice' : 'invoices'}</div>
                </div>
                <div className="rb-money" style={{ fontSize: 14, fontWeight: 600 }}>{window.fmtMoney(b.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Key stats */}
      <Section label="Account" padded={true}>
        <div className="rb-card" style={{ overflow: 'hidden' }}>
          {[
            { k: 'Credit limit',     v: window.fmtMoney(u.creditLimit) },
            { k: 'Credit available', v: window.fmtMoney(s.creditAvailable), accent: true },
            { k: 'YTD spend',        v: window.fmtMoney(s.ytdSpend) },
            { k: 'GSTIN',            v: u.gstin, mono: true },
          ].map((r, i) => (
            <div key={i} className="rb-row" style={{ minHeight: 48 }}>
              <div className="rb-meta" style={{ flex: 1 }}>{r.k}</div>
              <div className={(r.mono ? 'mono ' : 'rb-money ')} style={{ fontSize: 14, fontWeight: 500, color: r.accent ? 'var(--accent)' : 'var(--ink)' }}>{r.v}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Payments */}
      <Section label={`Payments · ${payments.length}`} action="Export" onAction={() => {}}>
        <div className="rb-card" style={{ overflow: 'hidden' }}>
          {payments.map(p => (
            <button key={p.id} onClick={() => onNav('invoice:' + p.invoice)} className="rb-row" style={{ width: '100%', textAlign: 'left', alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={p.method === 'Cash' ? 'wallet' : p.method === 'Cheque' ? 'doc' : 'arrow-up-right'} size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{p.method}</span>
                  <span className="mono rb-meta">{p.invoice}</span>
                </div>
                <div className="rb-meta" style={{ marginTop: 2 }}>{p.date}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--muted-2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.ref}</div>
              </div>
              <div className="rb-money" style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>+{window.fmtMoney(p.amount)}</div>
            </button>
          ))}
        </div>
      </Section>

      <div style={{ height: 24 }} />
    </div>
  );
};

Object.assign(window, { CTLoginScreen, CTDashboardScreen, CTFinancialsScreen });
