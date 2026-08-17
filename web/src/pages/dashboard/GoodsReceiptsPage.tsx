import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'

type BillingProfile = {
  id: string
  legalName: string
  gstin: string
  state: string
  stateCode: string
  canIssueGrnInvoice: boolean
}

type ProductOption = {
  id: string
  name: string
  sku: string
  hsnCode: string
  uqc: string
  gstRate: string
  transferValue: string
}

type ReceiptSummary = {
  id: string
  grnNumber: string
  externalDocumentNumber: string
  receiptDate: string
  status: 'active' | 'reversed' | 'replaced'
  sourceBillingProfile: { legalName: string; gstin: string }
  invoice: { invoiceNumber: string; grandTotal: string; status: string } | null
  _count: { lines: number }
}

function localDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

export function GoodsReceiptsPage() {
  const { id: warehouseId = '' } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const replacementId = searchParams.get('replace')
  const qc = useQueryClient()
  const now = useMemo(() => localDateTime(new Date()), [])
  const [sourceBillingProfileId, setSourceBillingProfileId] = useState('')
  const [externalDocumentNumber, setExternalDocumentNumber] = useState('')
  const [dispatchDate, setDispatchDate] = useState(now)
  const [receiptDate, setReceiptDate] = useState(now)
  const [notes, setNotes] = useState('')
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [serverPreview, setServerPreview] = useState<any>(null)

  const warehouseQuery = useQuery({
    queryKey: ['warehouse', warehouseId],
    queryFn: async () => (await api.get<any>(`/warehouses/${warehouseId}`)).data.data,
  })
  const profilesQuery = useQuery({
    queryKey: ['billing-profiles', 'company'],
    queryFn: async () => (await api.get<{ data: BillingProfile[] }>('/settings/billing/profiles', {
      params: { profileType: 'company', isActive: true },
    })).data.data.filter((profile) => profile.canIssueGrnInvoice),
  })
  const productsQuery = useQuery({
    queryKey: ['grn-products'],
    queryFn: async () => (await api.get<any>('/products', { params: { limit: 500 } })).data.data as ProductOption[],
  })
  const historyQuery = useQuery({
    queryKey: ['grns', warehouseId],
    queryFn: async () => (await api.get<{ data: ReceiptSummary[] }>(`/warehouses/${warehouseId}/grns`, {
      params: { limit: 100 },
    })).data.data,
  })
  const replacementQuery = useQuery({
    queryKey: ['grn-replacement-source', replacementId],
    enabled: Boolean(replacementId),
    queryFn: async () => (await api.get<any>(`/grns/${replacementId}`)).data.data,
  })

  useEffect(() => {
    const original = replacementQuery.data
    if (!original) return
    setSourceBillingProfileId(original.sourceBillingProfileId)
    setExternalDocumentNumber(original.externalDocumentNumber)
    setDispatchDate(localDateTime(new Date(original.dispatchDate)))
    setReceiptDate(localDateTime(new Date()))
    setNotes(original.notes ?? '')
    setQtyByProduct(Object.fromEntries(original.lines.map((line: any) => [line.productId, line.qtyReceived])))
  }, [replacementQuery.data])

  const selectedLines = (productsQuery.data ?? [])
    .map((product) => ({ product, qtyReceived: qtyByProduct[product.id] ?? 0 }))
    .filter((row) => row.qtyReceived > 0)
  const source = (profilesQuery.data ?? []).find((profile) => profile.id === sourceBillingProfileId)
  const destination = warehouseQuery.data?.billingProfile as BillingProfile | undefined
  const preview = selectedLines.reduce((totals, row) => {
    const taxable = Number(row.product.transferValue) * row.qtyReceived
    const tax = taxable * Number(row.product.gstRate) / 100
    totals.taxable += taxable
    if (source && destination && source.stateCode === destination.stateCode) {
      totals.cgst += tax / 2
      totals.sgst += tax / 2
    } else {
      totals.igst += tax
    }
    return totals
  }, { taxable: 0, cgst: 0, sgst: 0, igst: 0 })

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
      sourceBillingProfileId,
      externalDocumentNumber: externalDocumentNumber.trim(),
      dispatchDate: new Date(dispatchDate).toISOString(),
      receiptDate: new Date(receiptDate).toISOString(),
      notes: notes.trim() || null,
      idempotencyKey: crypto.randomUUID(),
      lines: selectedLines.map((row) => ({ productId: row.product.id, qtyReceived: row.qtyReceived })),
      }
      return replacementId
        ? api.patch(`/grns/${replacementId}/replace`, { ...payload, correctionReason: 'Corrected through replacement workflow' })
        : api.post(`/warehouses/${warehouseId}/grns`, payload)
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['grns', warehouseId] }),
        qc.invalidateQueries({ queryKey: ['warehouses', 'stock', warehouseId] }),
      ])
      setExternalDocumentNumber('')
      setNotes('')
      setQtyByProduct({})
      setError(null)
    },
    onError: (cause) => setError(apiErrorMessage(cause, 'Unable to create production GRN.')),
  })
  const previewMutation = useMutation({
    mutationFn: async () => (await api.post<any>(`/warehouses/${warehouseId}/grns/preview`, {
      sourceBillingProfileId,
      externalDocumentNumber: externalDocumentNumber.trim() || 'PREVIEW',
      dispatchDate: new Date(dispatchDate).toISOString(),
      receiptDate: new Date(receiptDate).toISOString(),
      notes: notes.trim() || null,
      lines: selectedLines.map((row) => ({ productId: row.product.id, qtyReceived: row.qtyReceived })),
    })).data.data,
    onSuccess: setServerPreview,
    onError: (cause) => setError(apiErrorMessage(cause, 'Unable to calculate server preview.')),
  })

  const submit = () => {
    if (!sourceBillingProfileId || !externalDocumentNumber.trim() || selectedLines.length === 0) {
      setError('Source profile, external document number, and at least one quantity are required.')
      return
    }
    setError(null)
    createMutation.mutate()
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>{replacementId ? 'Replace Production GRN' : 'Production GRN'} · {warehouseQuery.data?.name ?? 'Warehouse'}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!warehouseQuery.data?.managerId || !warehouseQuery.data?.billingProfileId ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Warehouse operations are blocked until a manager and active warehouse billing profile are assigned.
            </p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Issuing company profile</Label><select className="mt-1 h-10 w-full rounded-md border px-3" value={sourceBillingProfileId} onChange={(e) => setSourceBillingProfileId(e.target.value)}><option value="">Select company</option>{(profilesQuery.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.legalName} · {p.gstin}</option>)}</select></div>
            <div><Label>External document number</Label><Input value={externalDocumentNumber} onChange={(e) => setExternalDocumentNumber(e.target.value)} /></div>
            <div><Label>Dispatch date</Label><Input type="datetime-local" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} /></div>
            <div><Label>Receipt date</Label><Input type="datetime-local" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} /></div>
          </div>
          <div className="overflow-hidden rounded-md border">
            <Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Product</TableHead><TableHead>HSN/UQC</TableHead><TableHead>GST</TableHead><TableHead>Transfer value</TableHead><TableHead className="w-28">Qty</TableHead></TableRow></TableHeader>
              <TableBody>{(productsQuery.data ?? []).map((product) => <TableRow key={product.id}><TableCell>{product.sku}</TableCell><TableCell>{product.name}</TableCell><TableCell>{product.hsnCode} / {product.uqc}</TableCell><TableCell>{product.gstRate}%</TableCell><TableCell>₹{Number(product.transferValue).toFixed(2)}</TableCell><TableCell><Input type="number" min={0} value={qtyByProduct[product.id] ?? 0} onChange={(e) => setQtyByProduct((current) => ({ ...current, [product.id]: Number(e.target.value) }))} /></TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
          <Input placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            Server tax preview: Taxable ₹{serverPreview?.taxableTotal ?? preview.taxable.toFixed(2)} · CGST ₹{serverPreview?.cgstTotal ?? preview.cgst.toFixed(2)} · SGST ₹{serverPreview?.sgstTotal ?? preview.sgst.toFixed(2)} · IGST ₹{serverPreview?.igstTotal ?? preview.igst.toFixed(2)} · Total ₹{serverPreview?.grandTotal ?? (preview.taxable + preview.cgst + preview.sgst + preview.igst).toFixed(2)}
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex gap-2"><Button variant="outline" onClick={() => previewMutation.mutate()} disabled={!sourceBillingProfileId || selectedLines.length === 0 || previewMutation.isPending}>Calculate Server Preview</Button><Button onClick={submit} disabled={createMutation.isPending || !warehouseQuery.data?.isActive}>{createMutation.isPending ? 'Finalizing...' : replacementId ? 'Reverse and Create Replacement' : 'Finalize GRN and GST Invoice'}</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>GRN History</CardTitle></CardHeader>
        <CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>GRN</TableHead><TableHead>Receipt</TableHead><TableHead>Source</TableHead><TableHead>Invoice</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{(historyQuery.data ?? []).map((receipt) => <TableRow key={receipt.id}><TableCell><Link className="font-medium text-blue-700" to={`/dashboard/dispatch/grns/${receipt.id}`}>{receipt.grnNumber}</Link><div className="text-xs text-slate-500">{receipt.externalDocumentNumber}</div></TableCell><TableCell>{new Date(receipt.receiptDate).toLocaleString()}</TableCell><TableCell>{receipt.sourceBillingProfile.legalName}</TableCell><TableCell>{receipt.invoice?.invoiceNumber ?? '-'}</TableCell><TableCell className="capitalize">{receipt.status}</TableCell></TableRow>)}</TableBody>
        </Table></CardContent>
      </Card>
    </div>
  )
}
