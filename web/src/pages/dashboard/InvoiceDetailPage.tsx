import { lazy, Suspense, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatCurrencyINR, titleCase } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'
import { usePermission } from '@/context/PermissionContext'

const InvoicePDFButton = lazy(() =>
  import('@/components/InvoicePDFButton').then((m) => ({ default: m.InvoicePDFButton }))
)

type InvoiceLine = {
  id: string
  productId: string
  sku: string
  qty: number
  unitPrice: number | string
  lineTotal: number | string
}

type InvoiceCharge = {
  id: string
  taxChargeId: string | null
  name: string
  type: 'percentage' | 'fixed'
  rate: string
  amount: string
  displayOrder: number
}

type OrgProfile = {
  companyName: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  pincode: string
  country: string
  gstin: string
  pan: string
  sacCode: string
  logoUrl: string | null
}

type InvoiceRecord = {
  id: string
  orderId: string
  outletId: string
  invoiceNumber: string
  invoiceDate: string
  dueDate?: string | null
  subtotal?: string | number
  total: number | string
  paidAmount?: number | string
  remainingAmount?: number | string
  paymentStatus?: 'paid' | 'partially_paid' | 'unpaid'
  isOverdue?: boolean
  paymentDate?: string | null
  createdAt: string
  outlet?: {
    id: string
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
  lines: InvoiceLine[]
  charges?: InvoiceCharge[]
}

type EditCharge = {
  taxChargeId: string | null
  name: string
  type: 'percentage' | 'fixed'
  rate: string
  amount: string
  displayOrder: number
}

type ProductOption = { id: string; name: string }
type PaginatedResponse<T> = { data: T[] }

function normalizeInvoice(payload: unknown): InvoiceRecord | null {
  if (!payload || typeof payload !== 'object') return null
  const row = payload as Partial<InvoiceRecord>
  return {
    ...row,
    id: String(row.id ?? ''),
    orderId: String(row.orderId ?? ''),
    outletId: String(row.outletId ?? ''),
    invoiceNumber: String(row.invoiceNumber ?? ''),
    invoiceDate: String(row.invoiceDate ?? ''),
    createdAt: String(row.createdAt ?? ''),
    lines: Array.isArray(row.lines) ? row.lines : [],
    charges: Array.isArray(row.charges) ? row.charges : [],
  } as InvoiceRecord
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function computeAmount(subtotal: number, type: 'percentage' | 'fixed', rate: string): string {
  const r = Number(rate)
  if (!Number.isFinite(r) || r < 0) return '0.00'
  if (type === 'percentage') return ((subtotal * r) / 100).toFixed(2)
  return r.toFixed(2)
}

function paymentBadgeClass(status: 'paid' | 'partially_paid' | 'unpaid' | 'overdue') {
  if (status === 'paid') return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  if (status === 'partially_paid') return 'border-blue-300 bg-blue-100 text-blue-800'
  if (status === 'overdue') return 'border-red-300 bg-red-100 text-red-800'
  return 'border-amber-300 bg-amber-100 text-amber-800'
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const invoiceId = id ?? ''
  const qc = useQueryClient()
  const { can } = usePermission()

  const [editOpen, setEditOpen] = useState(false)
  const [editRows, setEditRows] = useState<EditCharge[]>([])
  const [editError, setEditError] = useState<string | null>(null)

  const invoiceQuery = useQuery({
    queryKey: ['sales-invoice-detail', invoiceId],
    enabled: Boolean(invoiceId),
    queryFn: async () => {
      const response = await api.get<{ data: InvoiceRecord }>(`/invoices/${invoiceId}`)
      return normalizeInvoice(response.data.data)
    },
  })

  const productsQuery = useQuery({
    queryKey: ['sales-products-map'],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<ProductOption>>('/products', {
        params: { page: 1, limit: 500 },
      })
      return response.data.data
    },
  })

  const orgProfileQuery = useQuery({
    queryKey: ['org-billing-profile'],
    queryFn: async () => {
      const resp = await api.get<{ data: { data: OrgProfile } }>('/settings/billing/profile')
      return (resp as any).data?.data as OrgProfile | null
    },
  })

  const outletQuery = useQuery({
    queryKey: ['outlet-detail', invoiceQuery.data?.outletId],
    enabled: Boolean(invoiceQuery.data?.outletId),
    queryFn: async () => {
      const outletId = invoiceQuery.data?.outletId
      if (!outletId) return null
      const resp = await api.get<{ data: { data: unknown } }>(`/outlets/${outletId}`)
      return (resp as any).data?.data as Record<string, unknown> | null
    },
  })

  const productNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of productsQuery.data ?? []) map.set(item.id, item.name)
    return map
  }, [productsQuery.data])

  const invoice = invoiceQuery.data

  const paymentStatus = useMemo<'paid' | 'partially_paid' | 'unpaid' | 'overdue'>(() => {
    if (!invoice) return 'unpaid'
    if (invoice.paymentStatus === 'paid') return 'paid'
    if (invoice.paymentStatus === 'partially_paid') return 'partially_paid'
    if (invoice.paymentStatus === 'unpaid' && invoice.isOverdue) return 'overdue'
    return 'unpaid'
  }, [invoice])

  const lineSubtotal = useMemo(
    () => (invoice?.lines ?? []).reduce((s, l) => s + toNumber(l.lineTotal), 0),
    [invoice?.lines]
  )
  const subtotal = invoice?.subtotal !== undefined ? toNumber(invoice.subtotal) : lineSubtotal

  // Derived totals for the edit dialog
  const editChargesTotal = editRows.reduce((s, r) => s + toNumber(r.amount), 0)
  const editNewTotal = subtotal + editChargesTotal

  const updateMutation = useMutation({
    mutationFn: (charges: EditCharge[]) =>
      api.post(`/invoices/${invoiceId}/charges`, { charges }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-invoice-detail', invoiceId] })
      setEditOpen(false)
      setEditError(null)
    },
    onError: (err) => setEditError(apiErrorMessage(err, 'Failed to update charges')),
  })

  function openEditDialog() {
    const current = (invoice?.charges ?? []).map((c) => ({
      taxChargeId: c.taxChargeId,
      name: c.name,
      type: c.type,
      rate: c.rate,
      amount: c.amount,
      displayOrder: c.displayOrder,
    }))
    setEditRows(current)
    setEditError(null)
    setEditOpen(true)
  }

  function updateRow(index: number, field: keyof EditCharge, value: string) {
    setEditRows((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row
        const updated = { ...row, [field]: value }
        // auto-recalculate amount when type or rate changes
        if (field === 'type' || field === 'rate') {
          const newType = field === 'type' ? (value as 'percentage' | 'fixed') : row.type
          const newRate = field === 'rate' ? value : row.rate
          updated.amount = computeAmount(subtotal, newType, newRate)
        }
        return updated
      })
    )
  }

  function addRow() {
    setEditRows((rows) => [
      ...rows,
      {
        taxChargeId: null,
        name: '',
        type: 'percentage',
        rate: '',
        amount: '0.00',
        displayOrder: rows.length,
      },
    ])
  }

  function removeRow(index: number) {
    setEditRows((rows) => rows.filter((_, i) => i !== index))
  }

  function saveCharges() {
    setEditError(null)
    for (const r of editRows) {
      if (!r.name.trim()) { setEditError('All charges must have a name'); return }
      if (!r.rate || Number(r.rate) < 0) { setEditError(`Invalid rate for "${r.name}"`); return }
      if (r.type === 'percentage' && Number(r.rate) > 100) {
        setEditError(`Percentage rate cannot exceed 100 for "${r.name}"`); return
      }
    }
    updateMutation.mutate(editRows)
  }

  return (
    <div className="space-y-4">
      {invoiceQuery.isLoading ? <p className="text-sm text-slate-500">Loading invoice...</p> : null}
      {invoiceQuery.isError ? <p className="text-sm text-red-600">{apiErrorMessage(invoiceQuery.error, 'Unable to load invoice.')}</p> : null}

      {invoice ? (
        <>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>{invoice.invoiceNumber}</CardTitle>
                  <p className="text-sm text-slate-500">
                    {invoice.outlet?.name ?? invoice.outletId} · {new Date(invoice.invoiceDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="border-cyan-300 bg-cyan-100 text-cyan-800">
                    Amount {formatCurrencyINR(toNumber(invoice.total))}
                  </Badge>
                  {can('invoices:write') ? (
                    <Button variant="outline" size="sm" onClick={openEditDialog}>
                      Edit Charges
                    </Button>
                  ) : null}
                  <Suspense fallback={<Button variant="outline" size="sm" disabled>Download PDF</Button>}>
                    <InvoicePDFButton
                      invoice={{
                        ...invoice,
                        outlet: outletQuery.data
                          ? {
                              name: String(outletQuery.data.name ?? invoice.outlet?.name ?? invoice.outletId),
                              legalName: outletQuery.data.legalName as string | null | undefined,
                              gstin: outletQuery.data.gstin as string | null | undefined,
                              billingAddress1: outletQuery.data.billingAddress1 as string | null | undefined,
                              billingAddress2: outletQuery.data.billingAddress2 as string | null | undefined,
                              billingCity: outletQuery.data.billingCity as string | null | undefined,
                              billingState: outletQuery.data.billingState as string | null | undefined,
                              billingPincode: outletQuery.data.billingPincode as string | null | undefined,
                              billingCountry: outletQuery.data.billingCountry as string | null | undefined,
                            }
                          : invoice.outlet,
                      }}
                      productNameById={productNameById}
                      paymentStatus={paymentStatus}
                      orgProfile={orgProfileQuery.data}
                    />
                  </Suspense>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{productNameById.get(line.productId) ?? line.sku}</TableCell>
                        <TableCell>{line.sku}</TableCell>
                        <TableCell>{line.qty}</TableCell>
                        <TableCell>{formatCurrencyINR(toNumber(line.unitPrice))}</TableCell>
                        <TableCell>{formatCurrencyINR(toNumber(line.lineTotal))}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={4} className="text-right text-slate-600">Subtotal</TableCell>
                      <TableCell className="text-slate-600">{formatCurrencyINR(subtotal)}</TableCell>
                    </TableRow>
                    {(invoice.charges ?? []).map((charge) => (
                      <TableRow key={charge.id}>
                        <TableCell colSpan={4} className="text-right text-slate-500 text-xs">
                          {charge.name}
                          {charge.type === 'percentage' ? ` (${charge.rate}%)` : ' (fixed)'}
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs">
                          {formatCurrencyINR(toNumber(charge.amount))}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={4} className="text-right font-semibold text-slate-900">Total</TableCell>
                      <TableCell className="font-semibold text-slate-900">
                        {formatCurrencyINR(toNumber(invoice.total))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader><CardTitle>Payment Status</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Badge className={paymentBadgeClass(paymentStatus)}>
                {paymentStatus === 'partially_paid' ? 'Partially Paid' : titleCase(paymentStatus)}
              </Badge>
              <p className="text-sm text-slate-600">
                Paid: {formatCurrencyINR(toNumber(invoice.paidAmount))} · Remaining:{' '}
                {formatCurrencyINR(toNumber(invoice.remainingAmount))}
              </p>
              <p className="text-xs text-slate-500">
                Last payment: {invoice.paymentDate ? new Date(invoice.paymentDate).toLocaleDateString() : '-'}
              </p>
              <div>
                <Link to={`/dashboard/sales/orders/${invoice.orderId}`} className="text-sm text-cyan-700 hover:underline">
                  View source order
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Edit Charges Dialog */}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Charges — {invoice.invoiceNumber}</DialogTitle>
              </DialogHeader>

              <div className="space-y-3 py-2">
                {editRows.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No charges. Click "Add Charge" to add one.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="w-24">Rate</TableHead>
                          <TableHead className="w-28">Amount</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editRows.map((row, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Input
                                value={row.name}
                                onChange={(e) => updateRow(index, 'name', e.target.value)}
                                placeholder="e.g. CGST 9%"
                                className="h-8 text-sm"
                              />
                            </TableCell>
                            <TableCell>
                              <select
                                value={row.type}
                                onChange={(e) => updateRow(index, 'type', e.target.value)}
                                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                              >
                                <option value="percentage">Percentage</option>
                                <option value="fixed">Fixed (₹)</option>
                              </select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={row.rate}
                                onChange={(e) => updateRow(index, 'rate', e.target.value)}
                                placeholder={row.type === 'percentage' ? '9.00' : '50.00'}
                                className="h-8 text-sm"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={row.amount}
                                onChange={(e) => updateRow(index, 'amount', e.target.value)}
                                className="h-8 text-sm"
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-400 hover:text-red-600"
                                onClick={() => removeRow(index)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <Button variant="outline" size="sm" onClick={addRow}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Charge
                </Button>

                {/* Running totals */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>{formatCurrencyINR(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Charges</span>
                    <span>{formatCurrencyINR(editChargesTotal)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-900 border-t border-slate-200 pt-1">
                    <span>New Total</span>
                    <span>{formatCurrencyINR(editNewTotal)}</span>
                  </div>
                </div>

                {editError ? <p className="text-sm text-red-600">{editError}</p> : null}

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                  <Button onClick={saveCharges} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  )
}
