import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, padding: 36, color: '#1e293b', backgroundColor: '#ffffff' },

  // Watermark — large diagonal text behind content
  watermark: {
    position: 'absolute',
    top: 220,
    left: 0,
    right: 0,
    alignItems: 'center',
    transform: 'rotate(-42deg)',
    opacity: 0.07,
  },
  watermarkText: { fontSize: 110, fontFamily: 'Helvetica-Bold', letterSpacing: 8 },

  // Corner ribbon sticker (top-right)
  ribbon: {
    position: 'absolute',
    top: 38,
    right: -36,
    width: 160,
    paddingVertical: 8,
    alignItems: 'center',
    transform: 'rotate(45deg)',
  },
  ribbonText: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 2 },

  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  logoBox: { width: 100 },
  logoImg: { width: 90, height: 40, objectFit: 'contain' },
  logoPlaceholder: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  sellerBlock: { textAlign: 'right' },
  sellerName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginBottom: 2 },
  sellerLine: { fontSize: 8, color: '#475569', marginBottom: 1 },
  sellerMeta: { fontSize: 8, color: '#475569', marginBottom: 1 },

  divider: { borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginVertical: 10 },

  // Invoice title
  invoiceTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginBottom: 6 },
  metaLine: { fontSize: 9, color: '#475569', marginBottom: 2 },

  // Bill To
  billToSection: { marginTop: 14, marginBottom: 14 },
  sectionLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  billToName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginBottom: 2 },
  billToLine: { fontSize: 8, color: '#475569', marginBottom: 1 },

  // Table
  table: { marginBottom: 4 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f1f5f9', paddingVertical: 6, paddingHorizontal: 4, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  tableHeaderCell: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#475569' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center' },
  tableCell: { fontSize: 8, color: '#334155' },
  tableCellMeta: { fontSize: 7, color: '#94a3b8', marginTop: 2 },
  colDesc: { flex: 2.8 },
  colSku:  { flex: 1.4 },
  colQty:  { flex: 0.7, textAlign: 'center' },
  colUnit: { flex: 1.5, textAlign: 'right' },
  colTotal: { flex: 1.5, textAlign: 'right' },

  // Totals
  totalsSection: { marginTop: 8 },
  totalsRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  totalsLabel: { fontSize: 8, color: '#64748b', width: 130, textAlign: 'right', paddingRight: 8 },
  totalsValue: { fontSize: 8, color: '#334155', width: 80, textAlign: 'right' },
  gstRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  gstLabel: { fontSize: 8, color: '#334155', width: 130, textAlign: 'right', paddingRight: 8 },
  gstValue: { fontSize: 8, color: '#334155', width: 80, textAlign: 'right' },
  gstBreakdown: { fontSize: 7, color: '#94a3b8', marginTop: 1 },
  totalFinalRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 6, paddingHorizontal: 4, backgroundColor: '#f1f5f9', borderRadius: 3, marginTop: 2 },
  totalFinalLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0f172a', width: 130, textAlign: 'right', paddingRight: 8 },
  totalFinalValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0f172a', width: 80, textAlign: 'right' },

  amountWordsRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 3, paddingHorizontal: 4 },
  amountWordsLabel: { fontSize: 8, color: '#64748b', width: 130, textAlign: 'right', paddingRight: 8 },
  amountWordsValue: { fontSize: 8, color: '#334155', width: 200, textAlign: 'right', fontFamily: 'Helvetica-Oblique' },

  fundsRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 3, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 4 },
  fundsLabel: { fontSize: 8, color: '#64748b', width: 130, textAlign: 'right', paddingRight: 8 },
  fundsValue: { fontSize: 8, color: '#334155', width: 80, textAlign: 'right' },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatINR(value: number) {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function toNum(v: string | number | undefined | null) {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : 0 }
  return 0
}

// Indian number-to-words (handles up to crores)
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function inWords(n: number): string {
  if (n === 0) return 'Zero'
  if (n < 0) return 'Minus ' + inWords(-n)
  if (n < 20) return ones[n]
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
  if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + inWords(n % 100) : '')
  if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + inWords(n % 1000) : '')
  if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + inWords(n % 100000) : '')
  return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + inWords(n % 10000000) : '')
}

function numberToWords(amount: number): string {
  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)
  let result = 'Rupees ' + inWords(rupees)
  if (paise > 0) result += ' and ' + inWords(paise) + ' Paise'
  return result + ' only'
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type OrgProfile = {
  companyName: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  pincode: string
  country: string
  gstin: string
  pan: string
  sacCode: string
  logoUrl?: string | null
}

type OutletBilling = {
  name: string
  legalName?: string | null
  gstin?: string | null
  billingAddress1?: string | null
  billingAddress2?: string | null
  billingCity?: string | null
  billingState?: string | null
  billingPincode?: string | null
  billingCountry?: string | null
}

type InvoicePDFProps = {
  invoice: {
    invoiceNumber: string
    invoiceDate: string
    dueDate?: string | null
    total: number | string
    subtotal?: number | string
    discountType?: 'percentage' | 'fixed' | null
    discountRate?: string | number
    discountAmount?: string | number
    taxableSubtotal?: string | number
    paidAmount?: number | string
    remainingAmount?: number | string
    outlet?: OutletBilling
    outletId: string
    lines: Array<{ id: string; productId: string; sku: string; qty: number; unitPrice: number | string; lineTotal: number | string }>
    charges?: Array<{ id: string; name: string; type: 'percentage' | 'fixed'; rate: string; amount: string }>
  }
  productNameById: Map<string, string>
  paymentStatus: 'paid' | 'partially_paid' | 'unpaid' | 'overdue'
  orgProfile?: OrgProfile | null
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------
type StatusConfig = { label: string; color: string; watermarkColor: string }

function statusConfig(status: string): StatusConfig {
  if (status === 'paid')            return { label: 'PAID',            color: '#059669', watermarkColor: '#059669' }
  if (status === 'partially_paid')  return { label: 'PARTIAL',         color: '#2563eb', watermarkColor: '#2563eb' }
  if (status === 'overdue')         return { label: 'OVERDUE',         color: '#dc2626', watermarkColor: '#dc2626' }
  return                                   { label: 'UNPAID',          color: '#d97706', watermarkColor: '#d97706' }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function InvoicePDF({ invoice, productNameById, paymentStatus, orgProfile }: InvoicePDFProps) {
  const lineSubtotal = invoice.lines.reduce((s, l) => s + toNum(l.lineTotal), 0)
  const subtotal = invoice.subtotal !== undefined ? toNum(invoice.subtotal) : lineSubtotal
  const discountAmount = invoice.discountAmount !== undefined ? toNum(invoice.discountAmount) : 0
  const taxableSubtotal = invoice.taxableSubtotal !== undefined ? toNum(invoice.taxableSubtotal) : Math.max(0, subtotal - discountAmount)
  const charges = invoice.charges ?? []
  const total = toNum(invoice.total)
  const paid = toNum(invoice.paidAmount)
  const remaining = toNum(invoice.remainingAmount)
  const outlet = invoice.outlet

  const sacCode = orgProfile?.sacCode ?? ''

  // Format address parts for seller
  const sellerAddrParts = [
    orgProfile?.addressLine1,
    orgProfile?.addressLine2,
    [orgProfile?.city, orgProfile?.state, orgProfile?.pincode].filter(Boolean).join(', '),
    orgProfile?.country,
  ].filter(Boolean)

  // Format address parts for buyer
  const buyerName = outlet?.legalName ?? outlet?.name ?? invoice.outletId
  const buyerAddrParts = [
    outlet?.billingAddress1,
    outlet?.billingAddress2,
    [outlet?.billingCity, outlet?.billingState, outlet?.billingPincode].filter(Boolean).join(', '),
    outlet?.billingCountry ?? 'India',
  ].filter(Boolean)

  const status = statusConfig(paymentStatus)

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Watermark — behind all content */}
        <View style={styles.watermark} fixed>
          <Text style={[styles.watermarkText, { color: status.watermarkColor }]}>
            {status.label}
          </Text>
        </View>

        {/* Corner ribbon sticker */}
        <View style={[styles.ribbon, { backgroundColor: status.color }]} fixed>
          <Text style={styles.ribbonText}>{status.label}</Text>
        </View>

        {/* Header: Logo left, Seller block right */}
        <View style={styles.headerRow}>
          <View style={styles.logoBox}>
            {orgProfile?.logoUrl ? (
              <Image src={orgProfile.logoUrl} style={styles.logoImg} />
            ) : (
              <Text style={styles.logoPlaceholder}>{orgProfile?.companyName?.split(' ')[0] ?? 'Invoice'}</Text>
            )}
          </View>
          <View style={styles.sellerBlock}>
            <Text style={styles.sellerName}>{orgProfile?.companyName ?? 'Your Company'}</Text>
            {sellerAddrParts.map((line, i) => (
              <Text key={i} style={styles.sellerLine}>{line}</Text>
            ))}
            {orgProfile?.gstin ? <Text style={styles.sellerMeta}>GSTIN: {orgProfile.gstin}</Text> : null}
            {orgProfile?.pan ? <Text style={styles.sellerMeta}>PAN: {orgProfile.pan}</Text> : null}
            {orgProfile?.sacCode ? <Text style={styles.sellerMeta}>SAC Code: {orgProfile.sacCode}</Text> : null}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Invoice title + dates */}
        <Text style={styles.invoiceTitle}>Invoice #{invoice.invoiceNumber}</Text>
        <Text style={styles.metaLine}>Invoice Date: {new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
        {invoice.dueDate ? (
          <Text style={styles.metaLine}>Due Date: {new Date(invoice.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
        ) : null}

        {/* Bill To */}
        <View style={styles.billToSection}>
          <Text style={styles.sectionLabel}>Invoiced To</Text>
          <Text style={styles.billToName}>{buyerName}</Text>
          {buyerAddrParts.map((line, i) => (
            <Text key={i} style={styles.billToLine}>{line}</Text>
          ))}
          {outlet?.gstin ? <Text style={[styles.billToLine, { marginTop: 3 }]}>GSTIN: {outlet.gstin}</Text> : null}
        </View>

        {/* Line Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>Description</Text>
            <Text style={[styles.tableHeaderCell, styles.colSku]}>SKU</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderCell, styles.colUnit]}>Unit Price</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>Total</Text>
          </View>
          {invoice.lines.map((line) => {
            const productName = productNameById.get(line.productId) ?? productNameById.get(line.sku) ?? line.sku
            return (
              <View style={styles.tableRow} key={line.id}>
                <View style={styles.colDesc}>
                  <Text style={styles.tableCell}>{productName}</Text>
                  {sacCode ? (
                    <Text style={styles.tableCellMeta}>SAC: {sacCode}</Text>
                  ) : null}
                </View>
                <Text style={[styles.tableCell, styles.colSku]}>{line.sku}</Text>
                <Text style={[styles.tableCell, styles.colQty]}>{line.qty}</Text>
                <Text style={[styles.tableCell, styles.colUnit]}>{formatINR(toNum(line.unitPrice))}</Text>
                <Text style={[styles.tableCell, styles.colTotal]}>{formatINR(toNum(line.lineTotal))}</Text>
              </View>
            )
          })}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Sub Total</Text>
            <Text style={styles.totalsValue}>{formatINR(subtotal)}</Text>
          </View>

          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>
              Discount{invoice.discountType ? ` (${invoice.discountType === 'percentage' ? `${toNum(invoice.discountRate)}%` : 'fixed'})` : ''}
            </Text>
            <Text style={styles.totalsValue}>-{formatINR(discountAmount)}</Text>
          </View>

          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Taxable Subtotal</Text>
            <Text style={styles.totalsValue}>{formatINR(taxableSubtotal)}</Text>
          </View>

          {/* Charge rows — GST charges grouped in one row */}
          {charges.map((charge) => {
            const isGst = /cgst|sgst|igst|gst/i.test(charge.name)
            return isGst ? (
              <View style={styles.gstRow} key={charge.id}>
                <Text style={styles.gstLabel}>GST  {charge.name}{charge.type === 'percentage' ? ` (${charge.rate}%)` : ''}</Text>
                <Text style={styles.gstValue}>{formatINR(toNum(charge.amount))}</Text>
              </View>
            ) : (
              <View style={styles.totalsRow} key={charge.id}>
                <Text style={styles.totalsLabel}>{charge.name}{charge.type === 'percentage' ? ` (${charge.rate}%)` : ''}</Text>
                <Text style={styles.totalsValue}>{formatINR(toNum(charge.amount))}</Text>
              </View>
            )
          })}

          <View style={styles.totalFinalRow}>
            <Text style={styles.totalFinalLabel}>Total Amount Incl. GST</Text>
            <Text style={styles.totalFinalValue}>{formatINR(total)}</Text>
          </View>

          {/* Amount in words */}
          <View style={styles.amountWordsRow}>
            <Text style={styles.amountWordsLabel}>Total Amount (in words)</Text>
            <Text style={styles.amountWordsValue}>{numberToWords(total)}</Text>
          </View>

          {/* Funds applied / balance */}
          <View style={styles.fundsRow}>
            <Text style={styles.fundsLabel}>Funds Applied</Text>
            <Text style={styles.fundsValue}>{formatINR(paid)}</Text>
          </View>
          <View style={[styles.fundsRow, { borderTopWidth: 0 }]}>
            <Text style={styles.fundsLabel}>Balance</Text>
            <Text style={styles.fundsValue}>{formatINR(remaining)}</Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}
