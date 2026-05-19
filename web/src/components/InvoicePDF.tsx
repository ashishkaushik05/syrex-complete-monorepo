import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, padding: 40, color: '#1e293b' },
  header: { marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  company: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  invoiceLabel: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#0891b2', textAlign: 'right' },
  invoiceMeta: { fontSize: 9, color: '#64748b', textAlign: 'right' },
  billTo: { marginBottom: 16 },
  sectionLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#64748b', marginBottom: 2, textTransform: 'uppercase' },
  billToName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  billToDetail: { fontSize: 9, color: '#64748b' },
  table: { marginBottom: 4 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f1f5f9', padding: '6 4', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  tableHeaderCell: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#475569' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', padding: '5 4' },
  tableCell: { fontSize: 9, color: '#334155' },
  col1: { flex: 3 },
  col2: { flex: 1.5, textAlign: 'center' },
  col3: { flex: 1, textAlign: 'center' },
  col4: { flex: 1.5, textAlign: 'right' },
  col5: { flex: 1.5, textAlign: 'right' },
  totalsRow: { flexDirection: 'row', justifyContent: 'flex-end', padding: '4 4', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  totalsLabel: { fontSize: 9, color: '#64748b', width: 100, textAlign: 'right', paddingRight: 8 },
  totalsValue: { fontSize: 9, color: '#334155', width: 80, textAlign: 'right' },
  totalsFinalRow: { flexDirection: 'row', justifyContent: 'flex-end', padding: '5 4', backgroundColor: '#f8fafc' },
  totalsFinalLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0f172a', width: 100, textAlign: 'right', paddingRight: 8 },
  totalsFinalValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0f172a', width: 80, textAlign: 'right' },
  statusBadge: { marginTop: 20, alignSelf: 'flex-end', padding: '6 12', borderRadius: 4, borderWidth: 1.5 },
  statusText: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
})

function formatINR(value: number) {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function toNum(v: string | number | undefined | null) {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : 0 }
  return 0
}

type InvoicePDFProps = {
  invoice: {
    invoiceNumber: string
    invoiceDate: string
    total: number | string
    subtotal?: number | string
    paidAmount?: number | string
    remainingAmount?: number | string
    outlet?: { name: string }
    outletId: string
    lines: Array<{ id: string; sku: string; qty: number; unitPrice: number | string; lineTotal: number | string }>
    charges?: Array<{ id: string; name: string; type: 'percentage' | 'fixed'; rate: string; amount: string }>
  }
  productNameById: Map<string, string>
  paymentStatus: 'paid' | 'partially_paid' | 'unpaid' | 'overdue'
}

function statusStyle(status: string) {
  if (status === 'paid') return { badge: { ...styles.statusBadge, borderColor: '#059669', backgroundColor: '#d1fae5' }, text: { ...styles.statusText, color: '#065f46' }, label: 'PAID' }
  if (status === 'partially_paid') return { badge: { ...styles.statusBadge, borderColor: '#3b82f6', backgroundColor: '#dbeafe' }, text: { ...styles.statusText, color: '#1e40af' }, label: 'PARTIALLY PAID' }
  if (status === 'overdue') return { badge: { ...styles.statusBadge, borderColor: '#dc2626', backgroundColor: '#fee2e2' }, text: { ...styles.statusText, color: '#7f1d1d' }, label: 'OVERDUE' }
  return { badge: { ...styles.statusBadge, borderColor: '#d97706', backgroundColor: '#fef3c7' }, text: { ...styles.statusText, color: '#78350f' }, label: 'UNPAID' }
}

export function InvoicePDF({ invoice, productNameById, paymentStatus }: InvoicePDFProps) {
  const lineSubtotal = invoice.lines.reduce((s, l) => s + toNum(l.lineTotal), 0)
  const subtotal = invoice.subtotal !== undefined ? toNum(invoice.subtotal) : lineSubtotal
  const charges = invoice.charges ?? []
  const total = toNum(invoice.total)
  const { badge, text, label } = statusStyle(paymentStatus)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.company}>Syrex</Text>
            <Text style={styles.invoiceLabel}>TAX INVOICE</Text>
          </View>
          <View style={styles.headerRow}>
            <View />
            <View>
              <Text style={styles.invoiceMeta}>Invoice No: {invoice.invoiceNumber}</Text>
              <Text style={styles.invoiceMeta}>Date: {new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}</Text>
            </View>
          </View>
        </View>

        {/* Bill To */}
        <View style={styles.billTo}>
          <Text style={styles.sectionLabel}>Bill To</Text>
          <Text style={styles.billToName}>{invoice.outlet?.name ?? invoice.outletId}</Text>
        </View>

        {/* Line Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.col1]}>Product</Text>
            <Text style={[styles.tableHeaderCell, styles.col2]}>SKU</Text>
            <Text style={[styles.tableHeaderCell, styles.col3]}>Qty</Text>
            <Text style={[styles.tableHeaderCell, styles.col4]}>Unit Price</Text>
            <Text style={[styles.tableHeaderCell, styles.col5]}>Line Total</Text>
          </View>
          {invoice.lines.map((line) => (
            <View style={styles.tableRow} key={line.id}>
              <Text style={[styles.tableCell, styles.col1]}>{productNameById.get(line.sku) ?? line.sku}</Text>
              <Text style={[styles.tableCell, styles.col2]}>{line.sku}</Text>
              <Text style={[styles.tableCell, styles.col3]}>{line.qty}</Text>
              <Text style={[styles.tableCell, styles.col4]}>{formatINR(toNum(line.unitPrice))}</Text>
              <Text style={[styles.tableCell, styles.col5]}>{formatINR(toNum(line.lineTotal))}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Subtotal</Text>
          <Text style={styles.totalsValue}>{formatINR(subtotal)}</Text>
        </View>
        {charges.map((charge) => (
          <View style={styles.totalsRow} key={charge.id}>
            <Text style={styles.totalsLabel}>
              {charge.name}{charge.type === 'percentage' ? ` (${charge.rate}%)` : ''}
            </Text>
            <Text style={styles.totalsValue}>{formatINR(toNum(charge.amount))}</Text>
          </View>
        ))}
        <View style={styles.totalsFinalRow}>
          <Text style={styles.totalsFinalLabel}>Total</Text>
          <Text style={styles.totalsFinalValue}>{formatINR(total)}</Text>
        </View>

        {/* Payment Status Badge */}
        <View style={badge}>
          <Text style={text}>{label}</Text>
        </View>
      </Page>
    </Document>
  )
}
