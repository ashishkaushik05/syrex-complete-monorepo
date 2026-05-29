// ui.jsx — Shared UI components & icons for Routebook

// ─────────────────────────────────────────────────────────────
// Icons (lucide-style, drawn from scratch)
// ─────────────────────────────────────────────────────────────
const Icon = ({ name, size = 20, stroke = 1.75, color = 'currentColor', style }) => {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round',
    style,
  };
  switch (name) {
    case 'home':       return <svg {...props}><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>;
    case 'grid':       return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
    case 'box':        return <svg {...props}><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M3 8l9 5 9-5"/></svg>;
    case 'receipt':    return <svg {...props}><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>;
    case 'map':        return <svg {...props}><path d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>;
    case 'user':       return <svg {...props}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>;
    case 'search':     return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg>;
    case 'chev-right': return <svg {...props}><path d="M9 5l7 7-7 7"/></svg>;
    case 'chev-left':  return <svg {...props}><path d="M15 5l-7 7 7 7"/></svg>;
    case 'chev-down':  return <svg {...props}><path d="M5 9l7 7 7-7"/></svg>;
    case 'plus':       return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case 'minus':      return <svg {...props}><path d="M5 12h14"/></svg>;
    case 'x':          return <svg {...props}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case 'check':      return <svg {...props}><path d="M5 12l4 4 10-10"/></svg>;
    case 'filter':     return <svg {...props}><path d="M3 5h18l-7 9v6l-4-2v-4L3 5z"/></svg>;
    case 'pin':        return <svg {...props}><path d="M12 21s7-7 7-12a7 7 0 10-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>;
    case 'clock':      return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'play':       return <svg {...props}><path d="M6 4l14 8-14 8V4z" fill={color}/></svg>;
    case 'pause':      return <svg {...props}><rect x="6" y="5" width="4" height="14" fill={color}/><rect x="14" y="5" width="4" height="14" fill={color}/></svg>;
    case 'stop':       return <svg {...props}><rect x="6" y="6" width="12" height="12" rx="1" fill={color}/></svg>;
    case 'coffee':     return <svg {...props}><path d="M4 8h14v6a5 5 0 01-5 5h-4a5 5 0 01-5-5V8z"/><path d="M18 9h2a3 3 0 010 6h-2"/><path d="M8 2v3M12 2v3"/></svg>;
    case 'logout':     return <svg {...props}><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 17l5-5-5-5M15 12H3"/></svg>;
    case 'shield':     return <svg {...props}><path d="M12 2l8 3v7c0 5-4 9-8 10-4-1-8-5-8-10V5l8-3z"/></svg>;
    case 'bell':       return <svg {...props}><path d="M6 16V11a6 6 0 1112 0v5l2 3H4l2-3z"/><path d="M10 21h4"/></svg>;
    case 'truck':      return <svg {...props}><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>;
    case 'building':   return <svg {...props}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h2M9 12h2M9 16h2M13 8h2M13 12h2M13 16h2"/></svg>;
    case 'tag':        return <svg {...props}><path d="M3 12l9-9h8v8l-9 9-8-8z"/><circle cx="15" cy="9" r="1.5" fill={color}/></svg>;
    case 'wallet':     return <svg {...props}><path d="M3 7v12a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 010-4h13"/><circle cx="17" cy="14" r="1.5" fill={color}/></svg>;
    case 'arrow-up-right': return <svg {...props}><path d="M7 17L17 7M9 7h8v8"/></svg>;
    case 'phone':      return <svg {...props}><path d="M22 17v3a2 2 0 01-2 2A18 18 0 012 4a2 2 0 012-2h3l2 5-3 2a14 14 0 007 7l2-3 5 2z"/></svg>;
    case 'sliders':    return <svg {...props}><path d="M4 6h11M4 12h7M4 18h13"/><circle cx="18" cy="6" r="2"/><circle cx="14" cy="12" r="2"/><circle cx="20" cy="18" r="2"/></svg>;
    case 'eye':        return <svg {...props}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'eye-off':    return <svg {...props}><path d="M3 3l18 18"/><path d="M10.6 6.1A10 10 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.4 3.9M6.5 6.5A17 17 0 002 12s4 6 10 6c1.4 0 2.7-.3 3.8-.8"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>;
    case 'edit':       return <svg {...props}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>;
    case 'navigation': return <svg {...props}><path d="M12 2l4 18-4-4-4 4 4-18z" fill={color} fillOpacity="0.15"/></svg>;
    case 'cart':       return <svg {...props}><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l3 13h12l2-9H6"/></svg>;
    case 'doc':        return <svg {...props}><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z"/><path d="M14 3v6h6M8 13h8M8 17h6"/></svg>;
    case 'flame':      return <svg {...props}><path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-3 3-5 1-2 3-6 6-6 10 0 3 3 7 7 3 0 0 0 0 0 0z"/></svg>;
    case 'gear':       return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2.1-1.2l-.4-2.5h-4l-.4 2.5a7 7 0 00-2.1 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1c.7.5 1.4.9 2.1 1.2l.4 2.5h4l.4-2.5a7 7 0 002.1-1.2l2.3 1 2-3.4-2-1.5c0-.4.1-.8.1-1.2z"/></svg>;
    case 'help':       return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 4M12 17.5h.01"/></svg>;
    case 'star':       return <svg {...props}><path d="M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z" fill={color} fillOpacity="0.15"/></svg>;
    case 'arrow-right':return <svg {...props}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    default: return null;
  }
};

// ─────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────
const Avatar = ({ initials, size = 36, color = 'var(--surface-2)', textColor = 'var(--ink)' }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    background: color, color: textColor,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.36, fontWeight: 600, letterSpacing: '-0.02em',
    border: '0.5px solid var(--line)',
    flexShrink: 0,
  }}>{initials}</div>
);

// ─────────────────────────────────────────────────────────────
// Product / brand tile placeholder
// ─────────────────────────────────────────────────────────────
const ProductTile = ({ color = 'var(--surface-2)', size = 56, glyph = 'box' }) => (
  <div style={{
    width: size, height: size, borderRadius: 10,
    background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 60%, var(--surface)))`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', flexShrink: 0,
    boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.18), inset 0 -8px 12px rgba(0,0,0,0.08)',
  }}>
    <Icon name={glyph} size={size * 0.42} stroke={1.5} />
  </div>
);

// ─────────────────────────────────────────────────────────────
// Status chip — maps order/invoice status to tone
// ─────────────────────────────────────────────────────────────
const StatusChip = ({ status, statusMap = window.RB_STATUS_META }) => {
  const meta = statusMap[status] || { label: status, tone: 'default' };
  const cls = meta.tone === 'default' ? '' : meta.tone;
  return <span className={"rb-chip " + cls}>{meta.label}</span>;
};

// ─────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────
const Section = ({ label, action, onAction, children, padded = true }) => (
  <div>
    <div className="rb-section">
      <div className="label">{label}</div>
      {action && <button className="action" onClick={onAction}>{action}</button>}
    </div>
    <div style={padded ? { padding: '0 16px' } : null}>{children}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Top app bar — replaces iOS large-title with our own
// ─────────────────────────────────────────────────────────────
const TopBar = ({ title, left, right, sub, large = true }) => (
  <div className="rb-topbar">
    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <div style={{ width: 36, display: 'flex', justifyContent: 'flex-start' }}>{left}</div>
      <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
        {!large && title}
      </div>
      <div style={{ width: 36, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
    </div>
    {large && (
      <div style={{ padding: '0 16px 14px' }}>
        <h1 className="rb-h1" style={{ margin: 0 }}>{title}</h1>
        {sub && <div className="rb-meta" style={{ marginTop: 4 }}>{sub}</div>}
      </div>
    )}
  </div>
);

// Icon button (for top bar etc.)
const IconBtn = ({ name, onClick, size = 36, badge }) => (
  <button onClick={onClick} style={{
    width: size, height: size, borderRadius: 10,
    background: 'var(--surface-2)', border: '0.5px solid var(--line)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  }}>
    <Icon name={name} size={18} stroke={1.75} />
    {badge != null && (
      <span style={{
        position: 'absolute', top: -3, right: -3,
        minWidth: 16, height: 16, padding: '0 4px',
        borderRadius: 99, background: 'var(--danger)', color: '#fff',
        fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{badge}</span>
    )}
  </button>
);

// Search box
const SearchInput = ({ value, onChange, placeholder = 'Search' }) => (
  <div style={{ position: 'relative' }}>
    <Icon name="search" size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
    <input className="rb-input search" value={value || ''} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} />
  </div>
);

// Empty state
const Empty = ({ icon = 'box', title, sub }) => (
  <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--muted)' }}>
    <div style={{ display: 'inline-flex', width: 48, height: 48, borderRadius: 12, background: 'var(--surface-2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
      <Icon name={icon} size={22} />
    </div>
    <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 4 }}>{title}</div>
    {sub && <div style={{ fontSize: 13 }}>{sub}</div>}
  </div>
);

// Brand swatch for tiles - deterministic from id
const brandColorFor = (id) => {
  const palette = ['#0F766E','#7C3AED','#DC2626','#0369A1','#0891B2','#DB2777','#CA8A04','#059669','#9333EA'];
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return palette[Math.abs(h) % palette.length];
};

Object.assign(window, {
  Icon, Avatar, ProductTile, StatusChip, Section, TopBar, IconBtn, SearchInput, Empty, brandColorFor,
});
