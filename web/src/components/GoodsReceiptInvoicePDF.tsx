import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: 'Helvetica' },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 12 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ddd', paddingVertical: 4 },
  cell: { flex: 1 },
  bold: { fontFamily: 'Helvetica-Bold' },
  parties: { flexDirection: 'row', gap: 16, marginVertical: 12 },
  party: { flex: 1, borderWidth: 1, borderColor: '#ddd', padding: 8 },
})

export function GoodsReceiptInvoicePDF({ receipt }: { receipt: any }) {
  const invoice = receipt.invoice
  const source = invoice.sourceBillingSnapshot
  const destination = invoice.destinationBillingSnapshot
  return <Document><Page size="A4" style={s.page}>
    <Text style={s.title}>GST TAX INVOICE</Text>
    <Text>Invoice: {invoice.invoiceNumber} · Date: {new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}</Text>
    <Text>GRN: {receipt.grnNumber} · External reference: {receipt.externalDocumentNumber}</Text>
    <Text>Status: {invoice.status.toUpperCase()}</Text>
    <View style={s.parties}><View style={s.party}><Text style={s.bold}>From</Text><Text>{source.legalName}</Text><Text>GSTIN: {source.gstin}</Text><Text>{source.addressLine1}, {source.city}, {source.state} {source.pincode}</Text></View><View style={s.party}><Text style={s.bold}>To / Place of Supply {invoice.placeOfSupplyStateCode}</Text><Text>{destination.legalName}</Text><Text>GSTIN: {destination.gstin}</Text><Text>{destination.addressLine1}, {destination.city}, {destination.state} {destination.pincode}</Text></View></View>
    <View style={s.row}><Text style={[s.cell, s.bold]}>SKU / Product</Text><Text style={[s.cell, s.bold]}>HSN/UQC</Text><Text style={[s.cell, s.bold]}>Qty / Rate</Text><Text style={[s.cell, s.bold]}>Tax</Text><Text style={[s.cell, s.bold]}>Total</Text></View>
    {invoice.lines.map((line: any) => <View key={line.id} style={s.row}><Text style={s.cell}>{line.sku}{'\n'}{line.productName}</Text><Text style={s.cell}>{line.hsnCode} / {line.uqc}</Text><Text style={s.cell}>{line.quantity} × ₹{line.unitValue}</Text><Text style={s.cell}>CGST {line.cgstAmount}{'\n'}SGST {line.sgstAmount}{'\n'}IGST {line.igstAmount}</Text><Text style={s.cell}>₹{line.lineTotal}</Text></View>)}
    <View style={{ marginTop: 12, alignItems: 'flex-end' }}><Text>Taxable: ₹{invoice.taxableTotal}</Text><Text>CGST: ₹{invoice.cgstTotal} · SGST: ₹{invoice.sgstTotal} · IGST: ₹{invoice.igstTotal}</Text><Text style={[s.bold, { fontSize: 11 }]}>Grand Total: ₹{invoice.grandTotal}</Text></View>
  </Page></Document>
}
