// outlet-data.jsx — Counter (Outlet portal) data
// Inherits products / brands / categories from sales app's data.jsx

window.CT_USER = {
  id: "outl_902",
  outletName: "Sunrise Electronics",
  outletAddress: "Shop 14, MG Rd Phase 2, Bengaluru 560001",
  email: "store@sunrise-electronics.in",
  initials: "SE",
  ownerName: "Priya Nair",
  gstin: "29ABCDE1234F1Z5",
  creditLimit: 500_000,
  creditUsed: 248_530,
};

window.CT_SUMMARY = {
  outstandingBalance: 248_530,
  openInvoices: 7,
  overdueInvoices: 2,
  totalOrders: 142,
  ordersThisMonth: 14,
  activeDispatches: 3,
  pendingDeliveries: 2,
  creditAvailable: 251_470,
  ytdSpend: 4_281_400,
};

// AR aging buckets
window.CT_AR_AGING = [
  { bucket: "Current",      label: "0–15 days",  amount: 51_610,  count: 1, color: "var(--accent)" },
  { bucket: "30 days",      label: "16–30 days", amount: 76_120,  count: 2, color: "#6366F1" },
  { bucket: "60 days",      label: "31–60 days", amount: 41_488,  count: 1, color: "#F59E0B" },
  { bucket: "90+ days",     label: "61+ days",   amount: 79_312,  count: 3, color: "#E11D48" },
];

window.CT_PAYMENTS = [
  { id: "pay_3014", date: "May 24, 2026", method: "UPI",        amount: 50_000,  ref: "UPI/4421/SUNRISE",       invoice: "INV-8242", status: "settled" },
  { id: "pay_3008", date: "May 22, 2026", method: "NEFT",       amount: 121_120, ref: "AXIS/NEFT/2026/N04421",  invoice: "INV-8221", status: "settled" },
  { id: "pay_2998", date: "May 18, 2026", method: "UPI",        amount: 25_000,  ref: "UPI/4392/SUNRISE",       invoice: "INV-8204", status: "settled" },
  { id: "pay_2982", date: "May 14, 2026", method: "Cheque",     amount: 38_420,  ref: "Ch #221504 (Axis)",      invoice: "INV-8174", status: "settled" },
  { id: "pay_2971", date: "May 10, 2026", method: "Cash",       amount: 12_400,  ref: "Cash receipt #2811",     invoice: "INV-8141", status: "settled" },
  { id: "pay_2960", date: "May 06, 2026", method: "UPI",        amount: 8_750,   ref: "UPI/4288/SUNRISE",       invoice: "INV-8112", status: "settled" },
];

// Reuse RB_ORDERS / RB_ORDER_DETAIL / RB_INVOICES / RB_INVOICE_DETAIL / RB_DISPATCH_DETAIL.
// But also list multiple dispatches for the outlet dispatches screen.
window.CT_DISPATCHES = [
  {
    id: "dis_4438", code: "DSP-4438", orderCode: "SO-19842",
    status: "in_transit", expectedAt: "Today · 17:30",
    transporter: "Bluedart Surface", awb: "BD-7782-441-09",
    items: 4, totalUnits: 5,
  },
  {
    id: "dis_4421", code: "DSP-4421", orderCode: "SO-19842",
    status: "delivered", expectedAt: "May 24 · 14:12",
    transporter: "Bluedart Surface", awb: "BD-7782-440-08",
    items: 3, totalUnits: 5,
  },
  {
    id: "dis_4402", code: "DSP-4402", orderCode: "SO-19798",
    status: "out_for_delivery", expectedAt: "Today · 19:00",
    transporter: "DTDC Express", awb: "DTDC-99-771-12",
    items: 6, totalUnits: 8,
  },
  {
    id: "dis_4388", code: "DSP-4388", orderCode: "SO-19798",
    status: "delivered", expectedAt: "May 22 · 11:48",
    transporter: "Bluedart Surface", awb: "BD-7782-431-04",
    items: 2, totalUnits: 4,
  },
  {
    id: "dis_4371", code: "DSP-4371", orderCode: "SO-19764",
    status: "delivered", expectedAt: "May 19 · 16:20",
    transporter: "Gati", awb: "GATI-5511-908",
    items: 4, totalUnits: 6,
  },
];

window.CT_DISPATCH_STATUS_META = {
  preparing:        { label: "Preparing",        tone: "default" },
  picked_up:        { label: "Picked up",        tone: "info" },
  in_transit:       { label: "In transit",       tone: "info" },
  out_for_delivery: { label: "Out for delivery", tone: "warn" },
  delivered:        { label: "Delivered",        tone: "success" },
  delivery_failed:  { label: "Delivery failed",  tone: "danger" },
};
