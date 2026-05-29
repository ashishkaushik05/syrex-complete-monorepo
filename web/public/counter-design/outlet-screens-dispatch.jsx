// outlet-screens-dispatch.jsx — Counter: Dispatch list + detail with Mark as Delivered

// ─────────────────────────────────────────────────────────────
// 7. Dispatch History (list)
// ─────────────────────────────────────────────────────────────
const CTDispatchHistoryScreen = ({ onNav }) => {
  const [filter, setFilter] = React.useState('all');
  const filters = [
    { id: 'all', label: 'All' },
    { id: 'in_transit', label: 'In transit' },
    { id: 'out_for_delivery', label: 'Out for delivery' },
    { id: 'delivered', label: 'Delivered' },
  ];

  const dispatches = window.CT_DISPATCHES.filter(d => filter === 'all' || d.status === filter);
  const arriving = window.CT_DISPATCHES.filter(d => d.status === 'in_transit' || d.status === 'out_for_delivery').length;

  return (
    <div className="rb" style={{ paddingBottom: 110 }}>
      <div className="rb-topbar">
        <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 className="rb-h1" style={{ margin: 0, flex: 1 }}>Dispatches</h1>
          <IconBtn name="filter" />
        </div>
        <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span className="rb-meta"><span className="num" style={{ color: 'var(--accent)', fontWeight: 600 }}>{arriving}</span> arriving soon</span>
          <span style={{ width: 2, height: 2, borderRadius: 99, background: 'var(--muted)' }} />
          <span className="rb-meta"><span className="num">{window.CT_DISPATCHES.length}</span> total this month</span>
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
        {dispatches.length === 0 ? (
          <Empty icon="truck" title="No dispatches match" />
        ) : dispatches.map(d => {
          const isLive = d.status === 'in_transit' || d.status === 'out_for_delivery';
          return (
            <button key={d.id} onClick={() => onNav('dispatch:' + d.id)} className="rb-card" style={{
              width: '100%', padding: 14, textAlign: 'left', marginBottom: 8,
              display: 'flex', flexDirection: 'column', gap: 10,
              borderColor: isLive ? 'var(--accent-line)' : 'var(--line)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: isLive ? 'var(--accent-soft)' : 'var(--surface-2)',
                  color: isLive ? 'var(--accent)' : 'var(--muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name="truck" size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{d.code}</span>
                    {isLive && <span className="rb-dot live rb-pulse" />}
                  </div>
                  <div className="rb-meta">From order <span className="mono">{d.orderCode}</span></div>
                </div>
                <StatusChip status={d.status} statusMap={window.CT_DISPATCH_STATUS_META} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingTop: 2 }}>
                <div style={{ flex: 1 }}>
                  <div className="rb-meta">Transporter</div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{d.transporter}</div>
                </div>
                <div>
                  <div className="rb-meta" style={{ textAlign: 'right' }}>ETA</div>
                  <div className="num" style={{ fontSize: 13, fontWeight: 600, marginTop: 2, color: isLive ? 'var(--accent)' : 'var(--ink)' }}>
                    {d.expectedAt}
                  </div>
                </div>
              </div>
              {isLive && (
                <button style={{
                  marginTop: 2, padding: '8px 12px', borderRadius: 8,
                  background: 'var(--accent-soft)', color: 'var(--accent)',
                  fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Icon name="map" size={14} /> Track live
                </button>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 8. Dispatch Detail (with Mark as Delivered)
// ─────────────────────────────────────────────────────────────
const CTDispatchDetailScreen = ({ dispatchId, onBack, onNav }) => {
  const d = { ...window.RB_DISPATCH_DETAIL };
  // Customize for the specific dispatch
  const listed = window.CT_DISPATCHES.find(x => x.id === dispatchId);
  if (listed) {
    d.code = listed.code;
    d.status = listed.status;
    d.orderCode = listed.orderCode;
    d.transporter = listed.transporter;
    d.awb = listed.awb;
    d.expectedAt = listed.expectedAt;
  }

  const [markSheet, setMarkSheet] = React.useState(false);
  const [delivered, setDelivered] = React.useState(d.status === 'delivered');

  const canMark = !delivered && (d.status === 'out_for_delivery' || d.status === 'in_transit');

  const totalUnits = d.lines.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="rb" style={{ paddingBottom: canMark ? 110 : 30, position: 'relative' }}>
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
              background: delivered ? 'var(--accent-soft)' : 'var(--info-soft)',
              color: delivered ? 'var(--accent)' : 'var(--info)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name={delivered ? 'check' : 'truck'} size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>
                {delivered ? 'Delivered' : (d.status === 'out_for_delivery' ? 'Out for delivery' : 'In transit')}
              </div>
              <div className="rb-meta">
                {delivered ? 'Marked received ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'ETA ' + d.expectedAt}
              </div>
            </div>
            {!delivered && <span className="rb-chip info"><span className="rb-dot live rb-pulse" /> Live</span>}
          </div>

          {/* Timeline */}
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 1, background: 'var(--line)' }} />
            {(delivered ? d.timeline.map(t => ({ ...t, done: true, current: false })) : d.timeline).map((step, i, arr) => {
              const done = step.done;
              return (
                <div key={i} style={{ position: 'relative', paddingBottom: i === arr.length - 1 ? 0 : 14 }}>
                  <div style={{
                    position: 'absolute', left: -22, top: 2, width: 11, height: 11, borderRadius: 99,
                    background: done ? 'var(--accent)' : 'var(--surface-2)',
                    border: '0.5px solid ' + (done ? 'var(--accent)' : 'var(--line)'),
                    boxShadow: step.current && !delivered ? '0 0 0 4px color-mix(in oklab, var(--accent) 22%, transparent)' : 'none',
                  }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: step.current ? 600 : 500, color: done ? 'var(--ink)' : 'var(--muted)' }}>
                      {step.label}
                    </div>
                    <div className="rb-meta num">{step.t}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Logistics */}
      <Section label="Logistics" padded={true}>
        <div className="rb-card" style={{ overflow: 'hidden' }}>
          {[
            { k: 'Transporter', v: d.transporter },
            { k: 'Vehicle', v: d.vehicleNo, mono: true },
            { k: 'AWB / tracking', v: d.awb, mono: true },
            { k: 'Driver', v: d.driverPhone, mono: true, action: <Icon name="phone" size={14} color="var(--accent)" /> },
          ].map((r, i) => (
            <div key={i} className="rb-row" style={{ minHeight: 44 }}>
              <div className="rb-meta" style={{ flex: 1 }}>{r.k}</div>
              <div className={r.mono ? 'mono' : ''} style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                {r.v}
                {r.action}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Items */}
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
                  <span key={s} className="mono" style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--ink-2)' }}>{s}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div style={{ height: 24 }} />

      {/* Sticky CTA — Mark as Delivered */}
      {canMark && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '12px 16px 16px', background: 'color-mix(in oklab, var(--bg) 92%, transparent)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          borderTop: '0.5px solid var(--line)', zIndex: 25,
        }}>
          <button onClick={() => setMarkSheet(true)} className="rb-btn accent block lg">
            <Icon name="check" size={16} />
            Mark as delivered
          </button>
        </div>
      )}

      {/* Mark as Delivered sheet */}
      {markSheet && (
        <MarkDeliveredSheet
          dispatch={d}
          onClose={() => setMarkSheet(false)}
          onConfirm={() => { setDelivered(true); setMarkSheet(false); }}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Mark as Delivered bottom sheet (modal)
// ─────────────────────────────────────────────────────────────
const MarkDeliveredSheet = ({ dispatch, onClose, onConfirm }) => {
  const [receiverName, setReceiverName] = React.useState('Priya Nair');
  const [receivedAll, setReceivedAll] = React.useState(true);
  const [notes, setNotes] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);

  const submit = () => {
    setConfirming(true);
    setTimeout(() => { setConfirming(false); onConfirm?.(); }, 700);
  };

  return (
    <div className="rb-fade-in" style={{
      position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column',
    }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{
        background: 'var(--bg)', borderRadius: '20px 20px 0 0',
        padding: '12px 0 30px', maxHeight: '88%', overflowY: 'auto',
        boxShadow: '0 -12px 40px rgba(0,0,0,0.18)',
        animation: 'rb-slide-up 0.32s cubic-bezier(0.16, 1, 0.3, 1) both',
      }}>
        {/* Grabber */}
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--line-2)', margin: '0 auto 14px' }} />

        <div style={{ padding: '0 20px 18px', borderBottom: '0.5px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: 'var(--accent-soft)',
              color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="check" size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em' }}>Confirm delivery</div>
              <div className="rb-meta" style={{ marginTop: 2 }}>{dispatch.code} · {dispatch.transporter}</div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="rb-body" style={{ color: 'var(--muted)' }}>
            This confirms receipt and closes the dispatch. Cannot be undone.
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: '12px 16px' }}>
          {/* Toggle: full / partial */}
          <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 10, padding: 3, marginBottom: 14 }}>
            {[
              { id: true,  label: 'Received in full' },
              { id: false, label: 'Partial receipt' },
            ].map(o => (
              <button key={String(o.id)} onClick={() => setReceivedAll(o.id)} style={{
                flex: 1, height: 36, borderRadius: 8, fontSize: 13, fontWeight: 500,
                background: receivedAll === o.id ? 'var(--surface)' : 'transparent',
                color: receivedAll === o.id ? 'var(--ink)' : 'var(--muted)',
                boxShadow: receivedAll === o.id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              }}>{o.label}</button>
            ))}
          </div>

          {/* Lines */}
          <div className="rb-card" style={{ overflow: 'hidden', marginBottom: 14 }}>
            {dispatch.lines.map((l, i) => (
              <div key={i} className="rb-row" style={{ alignItems: 'center' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: receivedAll ? 'var(--accent)' : 'var(--surface-2)',
                  color: receivedAll ? '#fff' : 'var(--muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: receivedAll ? 0 : '0.5px solid var(--line-2)',
                }}>
                  {receivedAll && <Icon name="check" size={14} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{l.name}</div>
                </div>
                {receivedAll ? (
                  <span className="rb-chip success">All <span className="num" style={{ fontWeight: 600, marginLeft: 3 }}>{l.qty}</span></span>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28 }}>
                    <input defaultValue={l.qty} className="num" style={{
                      width: 40, height: 28, borderRadius: 6, padding: 0, textAlign: 'center',
                      border: '0.5px solid var(--line)', background: 'var(--surface)', fontSize: 13, fontWeight: 600,
                    }} />
                    <span className="rb-meta">/ <span className="num">{l.qty}</span></span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Receiver */}
          <div className="rb-card" style={{ padding: 4, marginBottom: 14 }}>
            <div style={{ padding: 12 }}>
              <div className="rb-meta" style={{ marginBottom: 4 }}>Received by</div>
              <input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} style={{
                width: '100%', border: 0, padding: 0, background: 'transparent',
                font: 'inherit', color: 'var(--ink)', outline: 'none', fontSize: 14, fontWeight: 500,
              }} />
            </div>
            <hr />
            <div style={{ padding: 12 }}>
              <div className="rb-meta" style={{ marginBottom: 4 }}>Notes (optional)</div>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Damaged boxes, missing items, etc." style={{
                width: '100%', border: 0, padding: 0, background: 'transparent',
                font: 'inherit', color: 'var(--ink)', outline: 'none', fontSize: 14,
              }} />
            </div>
          </div>

          {/* Photo upload (visual only) */}
          <button style={{
            width: '100%', height: 56, marginBottom: 16,
            background: 'var(--surface-2)', border: '1px dashed var(--line-2)', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            color: 'var(--muted)', fontSize: 13, fontWeight: 500,
          }}>
            <Icon name="plus" size={16} />
            Attach proof of delivery photo
          </button>

          <button onClick={submit} disabled={confirming} className="rb-btn accent block lg">
            <Icon name="check" size={16} />
            {confirming ? 'Confirming…' : 'Confirm delivery'}
          </button>
          <button onClick={onClose} className="rb-btn ghost block" style={{ marginTop: 6, color: 'var(--muted)' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { CTDispatchHistoryScreen, CTDispatchDetailScreen });
