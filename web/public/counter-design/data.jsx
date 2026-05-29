// data.jsx — Sample data for Routebook Sales App
// Domain: Consumer electronics & appliances distribution

window.RB_USER = {
  id: "usr_8421",
  name: "Arjun Verma",
  email: "arjun.verma@kiranatech.in",
  role: "Sales Representative",
  initials: "AV",
  outletId: "outl_902",
  outletName: "Sunrise Electronics — MG Road",
  orgId: "org_kiranatech",
  isFieldEnabled: true,
  permissions: [
    "catalog:read", "orders:read", "orders:write",
    "invoices:read", "dispatches:read", "outlets:read",
    "field:read", "field:write",
  ],
};

window.RB_BRANDS = [
  { id: "br_lumira", name: "Lumira", tagline: "Home appliances", productCount: 48, color: "#0F766E" },
  { id: "br_volton", name: "Volton", tagline: "Power & batteries", productCount: 32, color: "#7C3AED" },
  { id: "br_kasai",  name: "Kasai",  tagline: "Kitchen electronics", productCount: 64, color: "#DC2626" },
  { id: "br_nordic", name: "Nordic Audio", tagline: "Sound systems", productCount: 28, color: "#0369A1" },
  { id: "br_aera",   name: "Aera",   tagline: "Climate & air", productCount: 22, color: "#0891B2" },
  { id: "br_gleam",  name: "Gleam",  tagline: "Personal grooming", productCount: 41, color: "#DB2777" },
];

window.RB_CATEGORIES = {
  br_lumira: [
    { id: "cat_l_ref", name: "Refrigerators", count: 14 },
    { id: "cat_l_wm",  name: "Washing Machines", count: 11 },
    { id: "cat_l_mw",  name: "Microwaves", count: 9 },
    { id: "cat_l_dw",  name: "Dishwashers", count: 6 },
    { id: "cat_l_ac",  name: "Air Conditioners", count: 8 },
  ],
  br_kasai: [
    { id: "cat_k_mix", name: "Mixers & Grinders", count: 18 },
    { id: "cat_k_kt",  name: "Kettles & Toasters", count: 12 },
    { id: "cat_k_ck",  name: "Cooktops", count: 14 },
    { id: "cat_k_ric", name: "Rice Cookers", count: 8 },
    { id: "cat_k_ind", name: "Induction", count: 12 },
  ],
};

window.RB_PRODUCTS = [
  {
    id: "pr_lr_551", sku: "LMR-RFG-551-INX", brandId: "br_lumira", categoryId: "cat_l_ref",
    name: "Lumira Frostline 551L Side-by-Side",
    basePrice: 89400, mrp: 102900, stock: 6, unit: "ea",
    description: "Inverter-driven side-by-side refrigerator with smart cooling zones, in-door water dispenser, and 5-star energy rating.",
    specs: [
      { k: "Capacity", v: "551 L" },
      { k: "Energy rating", v: "5★ BEE" },
      { k: "Compressor", v: "Digital Inverter" },
      { k: "Defrost", v: "Auto / Frost-free" },
      { k: "Dimensions", v: "912 × 716 × 1789 mm" },
    ],
    warrantyMonths: 120,
  },
  {
    id: "pr_lr_240", sku: "LMR-RFG-240-CGY", brandId: "br_lumira", categoryId: "cat_l_ref",
    name: "Lumira Cool 240L Double Door",
    basePrice: 28900, mrp: 34500, stock: 22, unit: "ea",
    description: "Frost-free double-door refrigerator with convertible mode and stabilizer-free operation.",
    specs: [
      { k: "Capacity", v: "240 L" },
      { k: "Energy rating", v: "3★ BEE" },
      { k: "Compressor", v: "Inverter" },
      { k: "Dimensions", v: "595 × 631 × 1620 mm" },
    ],
    warrantyMonths: 60,
  },
  {
    id: "pr_lr_wm_8", sku: "LMR-WAS-8-FL", brandId: "br_lumira", categoryId: "cat_l_wm",
    name: "Lumira Aquaglide 8kg Front-Load",
    basePrice: 41200, mrp: 47900, stock: 11, unit: "ea",
    description: "Steam-assisted front load washer with inverter motor and 14 wash programs.",
    specs: [
      { k: "Capacity", v: "8 kg" },
      { k: "RPM", v: "1400" },
      { k: "Programs", v: "14" },
      { k: "Energy rating", v: "5★" },
    ],
    warrantyMonths: 24,
  },
  {
    id: "pr_ka_mix", sku: "KSI-MIX-750-SLV", brandId: "br_kasai", categoryId: "cat_k_mix",
    name: "Kasai Pro 750W Mixer Grinder",
    basePrice: 4290, mrp: 5490, stock: 84, unit: "ea",
    description: "Three-jar high-torque mixer grinder with overload protection and stone-grade blades.",
    specs: [
      { k: "Wattage", v: "750 W" },
      { k: "Jars", v: "3" },
      { k: "Speed settings", v: "3 + Pulse" },
    ],
    warrantyMonths: 24,
  },
  {
    id: "pr_no_sb", sku: "NOR-SBR-2.1-BLK", brandId: "br_nordic", categoryId: null,
    name: "Nordic Cinema 2.1 Soundbar",
    basePrice: 12900, mrp: 15900, stock: 19, unit: "ea",
    description: "Wireless subwoofer-paired soundbar with HDMI ARC and Dolby Atmos support.",
    specs: [
      { k: "Output", v: "320 W RMS" },
      { k: "Channels", v: "2.1" },
      { k: "Connectivity", v: "HDMI eARC, BT 5.3" },
    ],
    warrantyMonths: 24,
  },
];

window.RB_SUMMARY = {
  outstandingBalance: 248_530,
  openInvoices: 7,
  totalOrders: 142,
  ordersThisMonth: 14,
  creditLimit: 500_000,
  creditUsed: 248_530,
};

const STATUS_META = {
  pending_approval:      { label: "Pending approval",  tone: "warn" },
  approved:              { label: "Approved",          tone: "info" },
  partially_dispatched:  { label: "Part dispatched",   tone: "info" },
  fully_dispatched:      { label: "Dispatched",        tone: "success" },
  rejected:              { label: "Rejected",          tone: "danger" },
  cancelled:             { label: "Cancelled",         tone: "default" },
  on_hold:               { label: "On hold",           tone: "warn" },
};
window.RB_STATUS_META = STATUS_META;

window.RB_ORDERS = [
  {
    id: "ord_19842", code: "SO-19842", date: "May 24, 2026",
    status: "partially_dispatched", lineCount: 4,
    subtotal: 137800, discount: 6890, tax: 23561, total: 154471,
  },
  {
    id: "ord_19839", code: "SO-19839", date: "May 23, 2026",
    status: "fully_dispatched", lineCount: 2,
    subtotal: 28900, discount: 1156, tax: 4998, total: 32742,
  },
  {
    id: "ord_19831", code: "SO-19831", date: "May 22, 2026",
    status: "approved", lineCount: 6,
    subtotal: 91240, discount: 3650, tax: 15768, total: 103358,
  },
  {
    id: "ord_19824", code: "SO-19824", date: "May 21, 2026",
    status: "pending_approval", lineCount: 3,
    subtotal: 16470, discount: 0, tax: 2965, total: 19435,
  },
  {
    id: "ord_19811", code: "SO-19811", date: "May 19, 2026",
    status: "on_hold", lineCount: 5,
    subtotal: 53800, discount: 2152, tax: 9296, total: 60944,
  },
  {
    id: "ord_19798", code: "SO-19798", date: "May 16, 2026",
    status: "fully_dispatched", lineCount: 8,
    subtotal: 218400, discount: 13104, tax: 36953, total: 242249,
  },
  {
    id: "ord_19782", code: "SO-19782", date: "May 14, 2026",
    status: "rejected", lineCount: 2,
    subtotal: 8400, discount: 0, tax: 1512, total: 9912,
  },
];

window.RB_ORDER_DETAIL = {
  id: "ord_19842", code: "SO-19842", date: "May 24, 2026 · 10:42",
  status: "partially_dispatched",
  outlet: "Sunrise Electronics — MG Road",
  deliveryAddress: "Shop 14, MG Rd Phase 2, Bengaluru 560001",
  lines: [
    { id: "ln_1", productId: "pr_lr_551", name: "Lumira Frostline 551L Side-by-Side", sku: "LMR-RFG-551-INX", qty: 1, price: 89400, dispatched: 1 },
    { id: "ln_2", productId: "pr_lr_240", name: "Lumira Cool 240L Double Door", sku: "LMR-RFG-240-CGY", qty: 2, price: 28900, dispatched: 1 },
    { id: "ln_3", productId: "pr_ka_mix", name: "Kasai Pro 750W Mixer Grinder", sku: "KSI-MIX-750-SLV", qty: 12, price: 4290, dispatched: 0 },
    { id: "ln_4", productId: "pr_no_sb", name: "Nordic Cinema 2.1 Soundbar", sku: "NOR-SBR-2.1-BLK", qty: 4, price: 12900, dispatched: 4 },
  ],
  subtotal: 248480, discount: 12424, taxBreakdown: [
    { k: "CGST 9%", v: 21245 },
    { k: "SGST 9%", v: 21245 },
  ],
  tax: 42490, total: 278546,
  linkedInvoices: [
    { id: "inv_8211", code: "INV-8211", amount: 102270, status: "paid" },
    { id: "inv_8242", code: "INV-8242", amount: 51610, status: "partial" },
  ],
  linkedDispatches: [
    { id: "dis_4421", code: "DSP-4421", date: "May 24", status: "delivered", items: 5 },
    { id: "dis_4438", code: "DSP-4438", date: "May 25", status: "in_transit", items: 4 },
  ],
};

window.RB_DISPATCH_DETAIL = {
  id: "dis_4438", code: "DSP-4438",
  orderCode: "SO-19842",
  status: "in_transit",
  transporter: "Bluedart Surface",
  vehicleNo: "KA-05-MN-4421",
  awb: "BD-7782-441-09",
  dispatchedAt: "May 25, 2026 · 06:18",
  expectedAt: "May 25, 2026 · 17:30",
  driverPhone: "+91 98112 47821",
  lines: [
    { productId: "pr_lr_240", name: "Lumira Cool 240L Double Door", qty: 1, serials: ["LMR240-A4421", "LMR240-A4422"] },
    { productId: "pr_no_sb",  name: "Nordic Cinema 2.1 Soundbar",   qty: 4, serials: ["NORSB-110-228","NORSB-110-229","NORSB-110-230","NORSB-110-231"] },
  ],
  timeline: [
    { t: "06:18", label: "Picked up from warehouse", done: true },
    { t: "09:42", label: "Departed Bengaluru hub", done: true },
    { t: "13:10", label: "Out for delivery", done: true, current: true },
    { t: "—",     label: "Delivered", done: false },
  ],
};

window.RB_INVOICES = [
  {
    id: "inv_8242", code: "INV-8242", date: "May 24, 2026",
    orderCode: "SO-19842",
    total: 154471, amountPaid: 102861, amountDue: 51610,
    dueDate: "Jun 23, 2026",
    status: "partial",
  },
  {
    id: "inv_8221", code: "INV-8221", date: "May 22, 2026",
    orderCode: "SO-19798",
    total: 121120, amountPaid: 121120, amountDue: 0,
    dueDate: "Jun 21, 2026",
    status: "paid",
  },
  {
    id: "inv_8204", code: "INV-8204", date: "May 19, 2026",
    orderCode: "SO-19798",
    total: 121129, amountPaid: 0, amountDue: 121129,
    dueDate: "Jun 18, 2026",
    status: "overdue",
  },
  {
    id: "inv_8188", code: "INV-8188", date: "May 16, 2026",
    orderCode: "SO-19782", total: 9912, amountPaid: 0, amountDue: 9912,
    dueDate: "Jun 15, 2026", status: "open",
  },
  {
    id: "inv_8174", code: "INV-8174", date: "May 14, 2026",
    orderCode: "SO-19764", total: 38420, amountPaid: 38420, amountDue: 0,
    dueDate: "Jun 13, 2026", status: "paid",
  },
];

window.RB_INVOICE_DETAIL = {
  id: "inv_8242", code: "INV-8242", date: "May 24, 2026",
  orderCode: "SO-19842",
  status: "partial",
  dueDate: "Jun 23, 2026",
  outlet: "Sunrise Electronics — MG Road",
  lines: [
    { id: "ln_1", name: "Lumira Frostline 551L Side-by-Side", qty: 1, price: 89400, subtotal: 89400 },
    { id: "ln_2", name: "Lumira Cool 240L Double Door", qty: 1, price: 28900, subtotal: 28900 },
    { id: "ln_4", name: "Nordic Cinema 2.1 Soundbar", qty: 4, price: 12900, subtotal: 51600 },
  ],
  subtotal: 169900,
  discount: 6796,
  charges: [
    { k: "CGST 9%", v: 14679 },
    { k: "SGST 9%", v: 14679 },
    { k: "Freight",  v: 750 },
  ],
  total: 193212,
  amountPaid: 102861,
  amountDue: 90351,
  payments: [
    { id: "pay_1", date: "May 24", method: "UPI",  amount: 50000 },
    { id: "pay_2", date: "May 25", method: "Bank", amount: 52861 },
  ],
};

window.RB_SHIFT = {
  id: "sft_9912",
  clientShiftId: "csft_local_2811",
  startedAt: "08:14 AM",
  durationMin: 287,
  visitsToday: 6,
  stopsToday: 2,
  distanceKm: 41.2,
  active: true,
};

window.RB_VISITS_TODAY = [
  { id: "v1", outlet: "Sunrise Electronics — MG Road",   time: "08:42", note: "Stock check + new order", lat: "12.9716", lng: "77.5946" },
  { id: "v2", outlet: "Crescent Home Store — JP Nagar",  time: "10:18", note: "Promo material drop",     lat: "12.9082", lng: "77.5856" },
  { id: "v3", outlet: "Pinnacle Appliances — Indiranagar", time: "11:34", note: "Demo: Lumira 551L",     lat: "12.9784", lng: "77.6408" },
  { id: "v4", outlet: "Harvest Mart — Koramangala",      time: "12:50", note: "Invoice follow-up",       lat: "12.9352", lng: "77.6245" },
  { id: "v5", outlet: "Bluewave Retail — HSR",           time: "14:22", note: "—",                       lat: "12.9120", lng: "77.6446" },
  { id: "v6", outlet: "Northstar Mall Kiosk — Hebbal",   time: "15:48", note: "Schedule install crew",   lat: "13.0359", lng: "77.5969" },
];

window.RB_SHIFT_HISTORY = [
  { id: "h1", date: "May 24",  startedAt: "08:02", endedAt: "18:14", durationMin: 612, visits: 11, distanceKm: 58.4 },
  { id: "h2", date: "May 23",  startedAt: "08:30", endedAt: "17:48", durationMin: 558, visits: 9,  distanceKm: 44.1 },
  { id: "h3", date: "May 22",  startedAt: "09:11", endedAt: "16:32", durationMin: 441, visits: 7,  distanceKm: 31.7 },
  { id: "h4", date: "May 21",  startedAt: "08:14", endedAt: "18:51", durationMin: 637, visits: 12, distanceKm: 62.0 },
  { id: "h5", date: "May 20",  startedAt: "08:48", endedAt: "17:10", durationMin: 502, visits: 8,  distanceKm: 39.5 },
];

window.RB_STOPS_TODAY = [
  { id: "s1", label: "Lunch", startedAt: "13:05", endedAt: "13:52", durationMin: 47 },
  { id: "s2", label: "Tea break", startedAt: "16:10", endedAt: null, durationMin: null, active: true },
];

// Money formatter — Indian Rupee with lakh/crore grouping
window.fmtMoney = function (n, { compact = false, sign = "₹" } = {}) {
  if (n == null || isNaN(n)) return "—";
  const neg = n < 0; n = Math.abs(n);
  if (compact) {
    if (n >= 1e7) return (neg ? "−" : "") + sign + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + "Cr";
    if (n >= 1e5) return (neg ? "−" : "") + sign + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + "L";
    if (n >= 1e3) return (neg ? "−" : "") + sign + (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + "k";
  }
  // Indian grouping: last 3 then 2-2-2…
  const s = Math.round(n).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return (neg ? "−" : "") + sign + grouped;
};
