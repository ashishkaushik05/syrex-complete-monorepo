import { PDFDownloadLink } from '@react-pdf/renderer'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InvoicePDF } from './InvoicePDF'
import type { OrgProfile } from './InvoicePDF'

type InvoicePDFButtonProps = {
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
    outlet?: {
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
    outletId: string
    lines: Array<{ id: string; productId: string; sku: string; qty: number; unitPrice: number | string; lineTotal: number | string }>
    charges?: Array<{ id: string; name: string; type: 'percentage' | 'fixed'; rate: string; amount: string }>
  }
  productNameById: Map<string, string>
  paymentStatus: 'paid' | 'partially_paid' | 'unpaid' | 'overdue'
  orgProfile?: OrgProfile | null
}

export function InvoicePDFButton({ invoice, productNameById, paymentStatus, orgProfile }: InvoicePDFButtonProps) {
  return (
    <PDFDownloadLink
      document={
        <InvoicePDF
          invoice={invoice}
          productNameById={productNameById}
          paymentStatus={paymentStatus}
          orgProfile={orgProfile}
        />
      }
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
