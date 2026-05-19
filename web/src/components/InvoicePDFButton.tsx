import { PDFDownloadLink } from '@react-pdf/renderer'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InvoicePDF } from './InvoicePDF'

type InvoicePDFButtonProps = {
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

export function InvoicePDFButton({ invoice, productNameById, paymentStatus }: InvoicePDFButtonProps) {
  return (
    <PDFDownloadLink
      document={<InvoicePDF invoice={invoice} productNameById={productNameById} paymentStatus={paymentStatus} />}
      fileName={`${invoice.invoiceNumber}.pdf`}
    >
      {({ loading }) => (
        <Button variant="outline" size="sm" disabled={loading}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {loading ? 'Preparing...' : 'Download PDF'}
        </Button>
      )}
    </PDFDownloadLink>
  )
}
