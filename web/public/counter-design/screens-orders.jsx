// screens-orders.jsx — Order history, Create Order, Order Detail, Dispatch Detail

// ─────────────────────────────────────────────────────────────
// 5. Order History
// ─────────────────────────────────────────────────────────────
const OrderHistoryScreen = ({ onNav }) => {
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState('all');

  const statuses = [
    { id: 'all', label: 'All' },
    { id: 'pending_approval', label: 'Pending' },
    { id: 'approved', label: 'Approved' },
    { id: 'partially_dispatched', label: 'Part' },
    { id: 'fully_dispatched', label: 'Dispatched' },
    { id: 'on_hold', label: 'On hold' },
    { id: 'rejected', label: 'Rejected' },
  ];

  const orders = window.RB_ORDERS.filter(o =>
    (filter === 'all' || o.status === filter) &&
    (!q || o.code.toLowerCase().includes(q.toLowerCase()))
  );

  const totalValue = orders.reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="rb" style={{ paddingBottom: 110 }}>
      <div className="rb-topbar">
        <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 className="rb-h1" style={{ margin: 0, flex: 1 }}>Orders</h1>
          <IconBtn name="plus" onClick={() => onNav('create-order')} />
        </div>

        <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span className="rb-meta"><span className="num">{orders.length}</span> orders</span>
          <span style={{ width: 2, height: 2, borderRadius: 99, background: 'var(--muted)' }} />
          <span className="rb-meta"><span className="rb-money">{window.fmtMoney(totalValue, { compact: true })}</span> total value</span>
        </div>

        <div style={{ padding: '0 16px 10px' }}>
          <SearchInput value={q} onChange={setQ} placeholder="Search by order #" />
        </div>

        <div style={{ padding: '0 12px 12px', display: 'flex', gap: 6, overflowX: 'auto' }} className="rb-scroll">
          {statuses.map(s => {
            const active = filter === s.id;
            return (
              <button key={s.id} onClick={() => setFilter(s.id)} style={{
                flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 99,
                background: active ? 'var(--ink)' : 'var(--surface-2)',
                color: active ? 'var(--bg)' : 'var(--ink-2)',
                border: '0.5px solid ' + (active ? 'transparent' : 'var(--line)'),
                fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
              }}>{s.label}</button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '12px 16px' }}>
        {orders.length === 0 ? (
          <Empty icon="box" title="No orders match" sub="Try a different filter." />
        ) : orders.map(o => (
          <button key={o.id} onClick={() => onNav('order:' + o.id)} className="rb-card" style={{
            width: '100%', padding: 14, textAlign: 'left', marginBottom: 8,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{o.code}</span>
              <StatusChip status={o.status} />
              <div style={{ flex: 1 }} />
              <span className="rb-meta">{o.date}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span className="rb-money" style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>
                {window.fmtMoney(o.total)}
              </span>
              <span className="rb-meta"><span className="num">{o.lineCount}</span> items</span>
              <div style={{ flex: 1 }} />
              <Icon name="chev-right" size={16} color="var(--muted)" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 6. Create Order
// ─────────────────────────────────────────────────────────────
const CreateOrderScreen = ({ onBack, cart, setCart, onSubmit }) => {
  const [step, setStep] = React.useState(cart.length > 0 ? 'review' : 'pick'); // pick | review
  const [q, setQ] = React.useState('');
  const [address, setAddress] = React.useState('Shop 14, MG Rd Phase 2, Bengaluru 560001');
  const [poNum, setPoNum] = React.useState('PO-2026-0541');
  const [notes, setNotes] = React.useState('');

  const products = window.RB_PRODUCTS.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.toLowerCase().includes(q.toLowerCase()));

  const subtotal = cart.reduce((s, l) => s + l.product.basePrice * l.qty, 0);
  const discount = Math.round(subtotal * 0.05);
  const tax = Math.round((subtotal - discount) * 0.18);
  const total = subtotal - discount + tax;

  const inCart = (id) => cart.find(l => l.product.id === id);
  const addLine = (p) => {
    if (inCart(p.id)) {
      setCart(cart.map(l => l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
    } else {
      setCart([...cart, { product: p, qty: 1 }]);
    }
  };
  const setQty = (pid, qty) => {
    if (qty <= 0) setCart(cart.filter(l => l.product.id !== pid));
    else setCart(cart.map(l => l.product.id === pid ? { ...l, qty } : l));
  };

  return (
    <div className="rb" style={{ paddingBottom: 100 }}>
      <div className="rb-topbar">
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconBtn name="chev-left" onClick={onBack} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{step === 'pick' ? 'Add products' : 'Review order'}</div>
            <div className="rb-meta">{cart.length} items · {window.fmtMoney(total, { compact: true })}</div>
          </div>
          {step === 'pick' ? (
            <button onClick={() => setStep('review')} disabled={cart.length === 0} className="rb-btn sm primary" style={{ opacity: cart.length === 0 ? 0.4 : 1 }}>
              Review <Icon name="chev-right" size={12} />
            </button>
          ) : (
            <button onClick={() => setStep('pick')} className="rb-btn sm">
              <Icon name="plus" size={12} /> Add
            </button>
          )}
        </div>
      </div>

      {step === 'pick' && (
        <>
          <div style={{ padding: '12px 16px 6px' }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search products or SKU…" />
          </div>
          <div style={{ padding: '6px 16px' }}>
            {products.map(p => {
              const line = inCart(p.id);
              const b = window.RB_BRANDS.find(x => x.id === p.brandId);
              return (
                <div key={p.id} className="rb-card" style={{ marginBottom: 8, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <ProductTile color={b?.color} size={48} glyph="box" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      <span className="rb-money" style={{ fontWeight: 600, color: 'var(--ink)' }}>{window.fmtMoney(p.basePrice)}</span>
                      <span style={{ margin: '0 6px' }}>·</span>
                      <span className="num">{p.stock}</span> in stock
                    </div>
                  </div>
                  {line ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0, height: 36, background: 'var(--surface-2)', borderRadius: 8 }}>
                      <button onClick={() => setQty(p.id, line.qty - 1)} style={{ width: 32, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="minus" size={14} />
                      </button>
                      <div style={{ width: 28, textAlign: 'center', fontSize: 14, fontWeight: 600 }} className="num">{line.qty}</div>
                      <button onClick={() => setQty(p.id, line.qty + 1)} style={{ width: 32, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="plus" size={14} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => addLine(p)} className="rb-btn sm" style={{ background: 'var(--ink)', color: 'var(--bg)', borderColor: 'transparent' }}>
                      <Icon name="plus" size={14} /> Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {step === 'review' && (
        <div>
          <Section label="Line items" action="Edit" onAction={() => setStep('pick')}>
            <div className="rb-card" style={{ overflow: 'hidden' }}>
              {cart.map((l, i) => (
                <div key={l.product.id} className="rb-row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{l.product.name}</div>
                    <div className="mono rb-meta" style={{ marginTop: 2 }}>{l.product.sku}</div>
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 0, height: 28, background: 'var(--surface-2)', borderRadius: 7, width: 'fit-content' }}>
                      <button onClick={() => setQty(l.product.id, l.qty - 1)} style={{ width: 26, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="minus" size={12} />
                      </button>
                      <div style={{ width: 24, textAlign: 'center', fontSize: 12, fontWeight: 600 }} className="num">{l.qty}</div>
                      <button onClick={() => setQty(l.product.id, l.qty + 1)} style={{ width: 26, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="plus" size={12} />
                      </button>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="rb-money" style={{ fontSize: 14, fontWeight: 600 }}>{window.fmtMoney(l.product.basePrice * l.qty)}</div>
                    <div className="rb-meta num">{l.qty} × {window.fmtMoney(l.product.basePrice, { compact: true })}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section label="Delivery & references" padded={true}>
            <div className="rb-card" style={{ padding: 4 }}>
              <div style={{ padding: 12 }}>
                <div className="rb-meta" style={{ marginBottom: 4 }}>Delivery address</div>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} style={{
                  width: '100%', resize: 'none', border: 0, padding: 0, background: 'transparent',
                  font: 'inherit', color: 'var(--ink)', outline: 'none', fontSize: 14,
                }} />
              </div>
              <hr />
              <div style={{ padding: 12 }}>
                <div className="rb-meta" style={{ marginBottom: 4 }}>PO number</div>
                <input value={poNum} onChange={(e) => setPoNum(e.target.value)} style={{
                  width: '100%', border: 0, padding: 0, background: 'transparent',
                  font: 'inherit', color: 'var(--ink)', outline: 'none', fontSize: 14,
                }} className="mono" />
              </div>
              <hr />
              <div style={{ padding: 12 }}>
                <div className="rb-meta" style={{ marginBottom: 4 }}>Notes for warehouse (optional)</div>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. handle with care" style={{
                  width: '100%', border: 0, padding: 0, background: 'transparent',
                  font: 'inherit', color: 'var(--ink)', outline: 'none', fontSize: 14,
                }} />
              </div>
            </div>
          </Section>

          <Section label="Order total" padded={true}>
            <div className="rb-card" style={{ padding: 14 }}>
              <Row k="Subtotal" v={window.fmtMoney(subtotal)} />
              <Row k="Distributor discount (5%)" v={"−" + window.fmtMoney(discount)} accent="success" />
              <Row k="Tax (computed on dispatch)" v={"+" + window.fmtMoney(tax)} muted />
              <div style={{ height: 1, background: 'var(--line)', margin: '10px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Estimated total</div>
                <div className="rb-money" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>{window.fmtMoney(total)}</div>
              </div>
              <div className="rb-meta" style={{ marginTop: 6 }}>Tax computed from taxSnapshot at dispatch — value may vary.</div>
            </div>
          </Section>

          <div style={{ height: 24 }} />
        </div>
      )}

      {/* Sticky CTA */}
      {step === 'review' && (
        <div style={{
          position: 'absolute', bottom: 84, left: 0, right: 0,
          padding: '10px 16px', background: 'color-mix(in oklab, var(--bg) 90%, transparent)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderTop: '0.5px solid var(--line)', zIndex: 25,
        }}>
          <button onClick={() => onSubmit?.(total)} className="rb-btn accent block lg">
            Submit order · {window.fmtMoney(total)}
          </button>
        </div>
      )}
    </div>
  );
};

const Row = ({ k, v, accent, muted }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0' }}>
    <span style={{ fontSize: 13, color: muted ? 'var(--muted)' : 'var(--ink-2)' }}>{k}</span>
    <span className="rb-money" style={{
      fontSize: 14, fontWeight: 500,
      color: accent === 'success' ? 'var(--accent)' : accent === 'danger' ? 'var(--danger)' : 'var(--ink)',
    }}>{v}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────
// 7. Order Detail
// ─────────────────────────────────────────────────────────────
const OrderDetailScreen = ({ orderId, onBack, onNav }) => {
  const d = window.RB_ORDER_DETAIL;
  return (
    <div className="rb" style={{ paddingBottom: 110 }}>
      <div className="rb-topbar">
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconBtn name="chev-left" onClick={onBack} />
          <div style={{ flex: 1 }}>
            <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{d.code}</div>
            <div className="rb-meta">{d.date}</div>
          </div>
          <IconBtn name="doc" />
        </div>
      </div>

      {/* Hero */}
      <div style={{ padding: '14px 16px 0' }}>
        <div className="rb-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div className="rb-meta">Order total</div>
              <div className="rb-money" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, marginTop: 2 }}>
                {window.fmtMoney(d.total)}
              </div>
            </div>
            <StatusChip status={d.status} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0 0', borderTop: '0.5px solid var(--line)', marginTop: 8 }}>
            <Icon name="building" size={14} color="var(--muted)" />
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{d.outlet}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 6 }}>
            <Icon name="pin" size={14} color="var(--muted)" style={{ marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{d.deliveryAddress}</span>
          </div>
        </div>
      </div>

      {/* Items */}
      <Section label={`Items · ${d.lines.length}`} padded={true}>
        <div className="rb-card" style={{ overflow: 'hidden' }}>
          {d.lines.map((l, i) => (
            <div key={l.id} className="rb-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{l.name}</div>
                <div className="mono rb-meta" style={{ marginTop: 2 }}>{l.sku}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <span className="rb-chip">Qty <span className="num" style={{ fontWeight: 600, marginLeft: 4 }}>{l.qty}</span></span>
                  {l.dispatched > 0 && (
                    <span className={"rb-chip " + (l.dispatched === l.qty ? 'success' : 'info')}>
                      <Icon name="truck" size={11} />
                      <span className="num">{l.dispatched}/{l.qty}</span> dispatched
                    </span>
                  )}
                </div>
              </div>
              <div className="rb-money" style={{ fontSize: 14, fontWeight: 600 }}>{window.fmtMoney(l.qty * l.price)}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Totals */}
      <Section label="Totals" padded={true}>
        <div className="rb-card" style={{ padding: 14 }}>
          <Row k="Subtotal" v={window.fmtMoney(d.subtotal)} />
          <Row k="Discount" v={"−" + window.fmtMoney(d.discount)} accent="success" />
          {d.taxBreakdown.map((t, i) => <Row key={i} k={t.k} v={"+" + window.fmtMoney(t.v)} muted />)}
          <div style={{ height: 1, background: 'var(--line)', margin: '10px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Total</div>
            <div className="rb-money" style={{ fontSize: 20, fontWeight: 700 }}>{window.fmtMoney(d.total)}</div>
          </div>
        </div>
      </Section>

      {/* Invoices */}
      <Section label={`Linked invoices · ${d.linkedInvoices.length}`} padded={true}>
        <div className="rb-card" style={{ overflow: 'hidden' }}>
          {d.linkedInvoices.map(inv => (
            <button key={inv.id} onClick={() => onNav('invoice:' + inv.id)} className="rb-row" style={{ width: '100%', textAlign: 'left' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--info-soft)', color: 'var(--info)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="receipt" size={14} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{inv.code}</div>
                <StatusChip status={inv.status} statusMap={window.RB_INVOICE_STATUS_META} />
              </div>
              <div className="rb-money" style={{ fontSize: 14, fontWeight: 600 }}>{window.fmtMoney(inv.amount)}</div>
              <Icon name="chev-right" size={14} color="var(--muted)" />
            </button>
          ))}
        </div>
      </Section>

      {/* Dispatches */}
      <Section label={`Dispatches · ${d.linkedDispatches.length}`} padded={true}>
        <div className="rb-card" style={{ overflow: 'hidden' }}>
          {d.linkedDispatches.map(ds => {
            const dsMeta = ds.status === 'delivered' ? { label: 'Delivered', tone: 'success' } : { label: 'In transit', tone: 'info' };
            return (
              <button key={ds.id} onClick={() => onNav('dispatch:' + ds.id)} className="rb-row" style={{ width: '100%', textAlign: 'left' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="truck" size={14} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{ds.code}</div>
                  <div className="rb-meta">{ds.date} · <span className="num">{ds.items}</span> items</div>
                </div>
                <span className={"rb-chip " + dsMeta.tone}>{dsMeta.label}</span>
                <Icon name="chev-right" size={14} color="var(--muted)" />
              </button>
            );
          })}
        </div>
      </Section>

      <div style={{ height: 24 }} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 8. Dispatch Detail
// ─────────────────────────────────────────────────────────────
const DispatchDetailScreen = ({ dispatchId, onBack, onNav }) => {
  const d = window.RB_DISPATCH_DETAIL;
  const totalUnits = d.lines.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="rb" style={{ paddingBottom: 110 }}>
      <div className="rb-topbar">
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconBtn name="chev-left" onClick={onBack} />
          <div style={{ flex: 1 }}>
            <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{d.code}</div>
            <div className="rb-meta">For <span className="mono">{d.orderCode}</span></div>
          </div>
          <IconBtn name="phone" />
        </div>
      </div>

      {/* Status hero */}
      <div style={{ padding: '14px 16px 0' }}>
        <div className="rb-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'var(--info-soft)', color: 'var(--info)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="truck" size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>In transit</div>
              <div className="rb-meta">Expected by <span className="num">{d.expectedAt}</span></div>
            </div>
            <span className="rb-chip info"><span className="rb-dot live rb-pulse" /> Live</span>
          </div>

          {/* Timeline */}
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 1, background: 'var(--line)' }} />
            {d.timeline.map((step, i) => (
              <div key={i} style={{ position: 'relative', paddingBottom: i === d.timeline.length - 1 ? 0 : 14 }}>
                <div style={{
                  position: 'absolute', left: -22, top: 2, width: 11, height: 11, borderRadius: 99,
                  background: step.done ? 'var(--accent)' : 'var(--surface-2)',
                  border: '0.5px solid ' + (step.done ? 'var(--accent)' : 'var(--line)'),
                  boxShadow: step.current ? '0 0 0 4px color-mix(in oklab, var(--accent) 22%, transparent)' : 'none',
                }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: step.current ? 600 : 500, color: step.done ? 'var(--ink)' : 'var(--muted)' }}>
                    {step.label}
                  </div>
                  <div className="rb-meta num">{step.t}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Logistics info */}
      <Section label="Logistics" padded={true}>
        <div className="rb-card" style={{ overflow: 'hidden' }}>
          {[
            { k: 'Transporter', v: d.transporter },
            { k: 'Vehicle', v: d.vehicleNo, mono: true },
            { k: 'AWB / tracking', v: d.awb, mono: true },
            { k: 'Driver', v: d.driverPhone, mono: true },
          ].map((r, i) => (
            <div key={i} className="rb-row" style={{ minHeight: 44 }}>
              <div className="rb-meta" style={{ flex: 1 }}>{r.k}</div>
              <div className={r.mono ? 'mono' : ''} style={{ fontSize: 14, fontWeight: 500 }}>{r.v}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Lines with serials */}
      <Section label={`Items · ${totalUnits} units`} padded={true}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {d.lines.map((l, i) => (
            <div key={i} className="rb-card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="box" size={16} />
                </div>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{l.name}</div>
                <span className="rb-chip">Qty <span className="num" style={{ fontWeight: 600, marginLeft: 4 }}>{l.qty}</span></span>
              </div>
              <div className="rb-meta" style={{ marginBottom: 6 }}>Serial numbers</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {l.serials.map(s => (
                  <span key={s} className="mono" style={{
                    fontSize: 11, padding: '4px 8px', borderRadius: 6,
                    background: 'var(--surface-2)', color: 'var(--ink-2)',
                  }}>{s}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div style={{ height: 24 }} />

      {/* Sticky actions */}
      <div style={{
        position: 'absolute', bottom: 84, left: 0, right: 0,
        padding: '10px 16px', background: 'color-mix(in oklab, var(--bg) 90%, transparent)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderTop: '0.5px solid var(--line)', display: 'flex', gap: 8, zIndex: 25,
      }}>
        <button className="rb-btn outline" style={{ flex: 1 }}>
          <Icon name="phone" size={14} /> Call driver
        </button>
        <button className="rb-btn primary" style={{ flex: 1 }}>
          <Icon name="map" size={14} /> Track on map
        </button>
      </div>
    </div>
  );
};

Object.assign(window, { OrderHistoryScreen, CreateOrderScreen, OrderDetailScreen, DispatchDetailScreen });
