// screens-invoices.jsx — Invoice history + detail

// ─────────────────────────────────────────────────────────────
// 9. Invoice History
// ─────────────────────────────────────────────────────────────
const InvoiceHistoryScreen = ({ onNav }) => {
  const [filter, setFilter] = React.useState('all');

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'partial', label: 'Partial' },
    { id: 'open', label: 'Open' },
    { id: 'paid', label: 'Paid' },
  ];

  const invoices = window.RB_INVOICES.filter(i => filter === 'all' || i.status === filter);
  const dueTotal = window.RB_INVOICES.reduce((s, i) => s + (i.amountDue || 0), 0);
  const overdueCount = window.RB_INVOICES.filter(i => i.status === 'overdue').length;

  return (
    <div className="rb" style={{ paddingBottom: 110 }}>
      <div className="rb-topbar">
        <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 className="rb-h1" style={{ margin: 0, flex: 1 }}>Invoices</h1>
          <IconBtn name="filter" />
        </div>

        {/* Big due card */}
        <div style={{ padding: '4px 16px 12px' }}>
          <div className="rb-card" style={{ padding: 14, background: 'var(--ink)', color: 'var(--bg)', border: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Total amount due</div>
                <div className="rb-money" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.025em', marginTop: 4 }}>{window.fmtMoney(dueTotal)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {overdueCount > 0 && (
                  <div style={{
                    fontSize: 11, fontWeight: 600,
                    background: 'var(--danger)', color: '#fff',
                    padding: '4px 10px', borderRadius: 999, display: 'inline-block',
                  }}>{overdueCount} OVERDUE</div>
                )}
              </div>
            </div>
            <button className="rb-btn" style={{
              marginTop: 12, height: 36, width: '100%',
              background: 'rgba(255,255,255,0.12)', color: 'var(--bg)', border: 0,
            }}>
              <Icon name="wallet" size={14} />
              Pay outstanding
            </button>
          </div>
        </div>

        <div style={{ padding: '0 12px 12px', display: 'flex', gap: 6, overflowX: 'auto' }} className="rb-scroll">
          {filters.map(s => {
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
        {invoices.length === 0 ? (
          <Empty icon="receipt" title="No invoices match" />
        ) : invoices.map(inv => {
          const dueIsHero = inv.amountDue > 0;
          return (
            <button key={inv.id} onClick={() => onNav('invoice:' + inv.id)} className="rb-card" style={{
              width: '100%', padding: 14, textAlign: 'left', marginBottom: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{inv.code}</span>
                <StatusChip status={inv.status} statusMap={window.RB_INVOICE_STATUS_META} />
                <div style={{ flex: 1 }} />
                <span className="rb-meta">{inv.date}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div className="rb-meta">{dueIsHero ? 'Amount due' : 'Amount paid'}</div>
                  <div className="rb-money" style={{
                    fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em',
                    color: inv.status === 'overdue' ? 'var(--danger)' : 'var(--ink)',
                  }}>
                    {window.fmtMoney(dueIsHero ? inv.amountDue : inv.amountPaid)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="rb-meta">of {window.fmtMoney(inv.total, { compact: true })}</div>
                  <div style={{ fontSize: 11, color: inv.status === 'overdue' ? 'var(--danger)' : 'var(--muted)', fontWeight: 500 }}>
                    Due {inv.dueDate}
                  </div>
                </div>
              </div>
              {/* progress bar */}
              {inv.status !== 'paid' && (
                <div style={{ marginTop: 10, height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: ((inv.amountPaid / inv.total) * 100) + '%',
                    background: inv.status === 'overdue' ? 'var(--danger)' : 'var(--accent)',
                  }} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 10. Invoice Detail
// ─────────────────────────────────────────────────────────────
const InvoiceDetailScreen = ({ invoiceId, onBack, onNav }) => {
  const d = window.RB_INVOICE_DETAIL;
  const paidPct = Math.round((d.amountPaid / d.total) * 100);
  return (
    <div className="rb" style={{ paddingBottom: d.amountDue > 0 ? 100 : 30 }}>
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

      {/* Amount hero */}
      <div style={{ padding: '14px 16px 0' }}>
        <div className="rb-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div className="rb-meta">Amount due</div>
              <div className="rb-money" style={{
                fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, marginTop: 4,
                color: d.amountDue > 0 ? 'var(--ink)' : 'var(--accent)',
              }}>{window.fmtMoney(d.amountDue)}</div>
              {d.amountDue > 0 && <div className="rb-meta" style={{ marginTop: 4 }}>by <span className="num">{d.dueDate}</span></div>}
            </div>
            <StatusChip status={d.status} statusMap={window.RB_INVOICE_STATUS_META} />
          </div>

          {/* Progress */}
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
              <span>Paid {window.fmtMoney(d.amountPaid, { compact: true })}</span>
              <span className="num">{paidPct}%</span>
              <span>Total {window.fmtMoney(d.total, { compact: true })}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: paidPct + '%', background: 'var(--accent)' }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 0 0', borderTop: '0.5px solid var(--line)', marginTop: 14 }}>
            <Icon name="box" size={14} color="var(--muted)" />
            <button onClick={() => onNav('order:ord_19842')} style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>
              From order <span className="mono">{d.orderCode}</span>
            </button>
            <Icon name="arrow-up-right" size={12} color="var(--accent)" />
          </div>
        </div>
      </div>

      {/* Line items */}
      <Section label={`Line items · ${d.lines.length}`} padded={true}>
        <div className="rb-card" style={{ overflow: 'hidden' }}>
          {d.lines.map((l, i) => (
            <div key={l.id} className="rb-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{l.name}</div>
                <div className="rb-meta num" style={{ marginTop: 2 }}>{l.qty} × {window.fmtMoney(l.price)}</div>
              </div>
              <div className="rb-money" style={{ fontSize: 14, fontWeight: 600 }}>{window.fmtMoney(l.subtotal)}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Breakdown */}
      <Section label="Breakdown" padded={true}>
        <div className="rb-card" style={{ padding: 14 }}>
          <Row k="Subtotal" v={window.fmtMoney(d.subtotal)} />
          <Row k="Discount" v={"−" + window.fmtMoney(d.discount)} accent="success" />
          {d.charges.map((c, i) => <Row key={i} k={c.k} v={"+" + window.fmtMoney(c.v)} muted />)}
          <div style={{ height: 1, background: 'var(--line)', margin: '10px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Total</div>
            <div className="rb-money" style={{ fontSize: 20, fontWeight: 700 }}>{window.fmtMoney(d.total)}</div>
          </div>
          <div style={{ height: 1, background: 'var(--line)', margin: '10px 0' }} />
          <Row k="Amount paid" v={window.fmtMoney(d.amountPaid)} accent="success" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Amount due</span>
            <span className="rb-money" style={{ fontSize: 18, fontWeight: 700, color: d.amountDue > 0 ? 'var(--danger)' : 'var(--accent)' }}>
              {window.fmtMoney(d.amountDue)}
            </span>
          </div>
        </div>
      </Section>

      {/* Payments */}
      {d.payments.length > 0 && (
        <Section label="Payments" padded={true}>
          <div className="rb-card" style={{ overflow: 'hidden' }}>
            {d.payments.map(p => (
              <div key={p.id} className="rb-row">
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={14} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{p.method}</div>
                  <div className="rb-meta">{p.date}, 2026</div>
                </div>
                <div className="rb-money" style={{ fontSize: 14, fontWeight: 600 }}>{window.fmtMoney(p.amount)}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div style={{ height: 24 }} />

      {/* Sticky Pay button */}
      {d.amountDue > 0 && (
        <div style={{
          position: 'absolute', bottom: 84, left: 0, right: 0,
          padding: '10px 16px', background: 'color-mix(in oklab, var(--bg) 90%, transparent)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderTop: '0.5px solid var(--line)', display: 'flex', gap: 8, zIndex: 25,
        }}>
          <button className="rb-btn outline" style={{ flex: 1 }}>
            <Icon name="doc" size={14} /> Download
          </button>
          <button className="rb-btn primary" style={{ flex: 1.4 }}>
            <Icon name="wallet" size={14} /> Pay {window.fmtMoney(d.amountDue, { compact: true })}
          </button>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { InvoiceHistoryScreen, InvoiceDetailScreen });
