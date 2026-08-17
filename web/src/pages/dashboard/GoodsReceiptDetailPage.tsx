import { PDFDownloadLink } from '@react-pdf/renderer'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { GoodsReceiptInvoicePDF } from '@/components/GoodsReceiptInvoicePDF'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePermission } from '@/context/PermissionContext'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'

export function GoodsReceiptDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const { can } = usePermission()
  const query = useQuery({ queryKey: ['grn', id], queryFn: async () => (await api.get<any>(`/grns/${id}`)).data.data })
  const reverse = useMutation({
    mutationFn: async () => {
      const reason = window.prompt('Reversal reason')
      if (!reason) throw new Error('Reversal reason is required')
      return api.patch(`/grns/${id}/reverse`, { reason })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grn', id] }),
  })
  const receipt = query.data
  if (query.isLoading) return <p>Loading GRN...</p>
  if (!receipt) return <p className="text-red-600">{apiErrorMessage(query.error, 'GRN not found.')}</p>

  const downloadJson = () => {
    const payload = {
      version: '1.1',
      documentType: 'INV',
      goodsReceipt: receipt.grnNumber,
      invoice: receipt.invoice,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${receipt.invoice.invoiceNumber.replaceAll('/', '-')}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <div className="space-y-4">
    <Card><CardHeader><div className="flex items-center justify-between"><CardTitle>{receipt.grnNumber}</CardTitle><div className="flex gap-2"><PDFDownloadLink document={<GoodsReceiptInvoicePDF receipt={receipt} />} fileName={`${receipt.invoice.invoiceNumber.replaceAll('/', '-')}.pdf`}><Button variant="outline">Download PDF</Button></PDFDownloadLink><Button variant="outline" onClick={downloadJson}>GST JSON</Button>{receipt.status === 'active' && can('inventory:grn-replace') ? <Link to={`/dashboard/dispatch/warehouses/${receipt.warehouseId}/grn?replace=${receipt.id}`}><Button variant="outline">Replace</Button></Link> : null}{receipt.status === 'active' && can('inventory:grn-reverse') ? <Button variant="outline" onClick={() => reverse.mutate()}>Reverse</Button> : null}</div></div></CardHeader><CardContent className="grid gap-2 text-sm md:grid-cols-2"><p>Status: <b className="capitalize">{receipt.status}</b></p><p>Invoice: {receipt.invoice.invoiceNumber}</p><p>External reference: {receipt.externalDocumentNumber}</p><p>Receipt: {new Date(receipt.receiptDate).toLocaleString()}</p><p>Source: {receipt.sourceBillingProfile.legalName} ({receipt.sourceBillingProfile.gstin})</p><p>Destination: {receipt.warehouse.billingProfile.legalName} ({receipt.warehouse.billingProfile.gstin})</p>{receipt.replaces ? <p>Replaces: {receipt.replaces.grnNumber}</p> : null}{receipt.replacement ? <p>Replacement: {receipt.replacement.grnNumber}</p> : null}</CardContent></Card>
    <Card><CardHeader><CardTitle>Tax Lines</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>HSN/UQC</TableHead><TableHead>Qty</TableHead><TableHead>Taxable</TableHead><TableHead>CGST</TableHead><TableHead>SGST</TableHead><TableHead>IGST</TableHead><TableHead>Total</TableHead></TableRow></TableHeader><TableBody>{receipt.invoice.lines.map((line: any) => <TableRow key={line.id}><TableCell>{line.sku}<div className="text-xs text-slate-500">{line.productName}</div></TableCell><TableCell>{line.hsnCode}/{line.uqc}</TableCell><TableCell>{line.quantity}</TableCell><TableCell>{line.taxableValue}</TableCell><TableCell>{line.cgstAmount}</TableCell><TableCell>{line.sgstAmount}</TableCell><TableCell>{line.igstAmount}</TableCell><TableCell>{line.lineTotal}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    <Card><CardHeader><CardTitle>Inventory Movements</CardTitle></CardHeader><CardContent>{receipt.movements.map((movement: any) => <div key={movement.id} className="flex justify-between border-b py-2 text-sm"><span>{movement.movementType.replaceAll('_', ' ')}</span><span className={movement.quantityDelta < 0 ? 'text-red-700' : 'text-emerald-700'}>{movement.quantityDelta > 0 ? '+' : ''}{movement.quantityDelta}</span></div>)}</CardContent></Card>
  </div>
}
