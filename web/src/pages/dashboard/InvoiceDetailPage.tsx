import { lazy, Suspense, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatCurrencyINR, titleCase } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'
import { usePermission } from '@/context/PermissionContext'

const InvoicePDFButton = lazy(() =>
  import('@/components/InvoicePDFButton').then((m) => ({ default: m.InvoicePDFButton })),
)

type DiscountType = 'percentage' | 'fixed' | null
type AgingBucket = 'current' | '1_30' | '31_60' | '61_90' | '90_plus' | null

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
  discountType?: DiscountType
  discountRate?: string | number
  discountAmount?: string | number
  taxableSubtotal?: string | number
  total: number | string
  paidAmount?: number | string
  remainingAmount?: number | string
  paymentStatus?: 'paid' | 'partially_paid' | 'unpaid' | 'overdue'
  isOverdue?: boolean
  daysPastDue?: number | null
  agingBucket?: AgingBucket
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

type EditLine = {
  id: string
  productId: string
  sku: string
  qty: number
  unitPrice: string
}

type EditCharge = {
  taxChargeId: string | null
  name: string
  type: 'percentage' | 'fixed'
  rate: string
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

function toRateString(input: string) {
  if (!input.trim()) return '0'
  const parsed = Number(input)
  if (!Number.isFinite(parsed) || parsed < 0) return '0'
  return parsed.toFixed(2)
}

function computeDiscountAmount(subtotal: number, type: DiscountType, rate: string) {
  const r = Number(rate)
  if (!Number.isFinite(r) || r <= 0 || subtotal <= 0 || !type) return 0
  if (type === 'percentage') return Math.min(subtotal, (subtotal * Math.min(r, 100)) / 100)
  return Math.min(subtotal, r)
}

function computeChargeAmount(taxableSubtotal: number, type: 'percentage' | 'fixed', rate: string) {
  const r = Number(rate)
  if (!Number.isFinite(r) || r <= 0) return 0
  if (type === 'percentage') return (taxableSubtotal * r) / 100
  return r
}

function paymentBadgeClass(status: 'paid' | 'partially_paid' | 'unpaid' | 'overdue') {
  if (status === 'paid') return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  if (status === 'partially_paid') return 'border-blue-300 bg-blue-100 text-blue-800'
  if (status === 'overdue') return 'border-red-300 bg-red-100 text-red-800'
  return 'border-amber-300 bg-amber-100 text-amber-800'
}

function agingBadgeClass(bucket: AgingBucket) {
  if (bucket === '1_30') return 'border-amber-300 bg-amber-100 text-amber-800'
  if (bucket === '31_60') return 'border-orange-300 bg-orange-100 text-orange-800'
  if (bucket === '61_90') return 'border-rose-300 bg-rose-100 text-rose-800'
  if (bucket === '90_plus') return 'border-red-300 bg-red-100 text-red-800'
  return 'border-slate-300 bg-slate-100 text-slate-700'
}

function agingLabel(bucket: AgingBucket) {
  if (bucket === '1_30') return '1-30'
  if (bucket === '31_60') return '31-60'
  if (bucket === '61_90') return '61-90'
  if (bucket === '90_plus') return '90+'
  return 'Current'
}

function toDateInput(iso?: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function toDayStartIso(dateValue: string) {
  return new Date(`${dateValue}T00:00:00.000Z`).toISOString()
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const invoiceId = id ?? ''
  const qc = useQueryClient()
  const { can } = usePermission()

  const [editOpen, setEditOpen] = useState(false)
  const [editLines, setEditLines] = useState<EditLine[]>([])
  const [editCharges, setEditCharges] = useState<EditCharge[]>([])
  const [editDiscountType, setEditDiscountType] = useState<DiscountType>(null)
  const [editDiscountRate, setEditDiscountRate] = useState('0')
  const [editDueDate, setEditDueDate] = useState('')
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
    if (invoice.paymentStatus) return invoice.paymentStatus
    if (toNumber(invoice.remainingAmount) <= 0) return 'paid'
    if (invoice.isOverdue) return 'overdue'
    if (toNumber(invoice.paidAmount) > 0) return 'partially_paid'
    return 'unpaid'
  }, [invoice])

  const lineSubtotal = useMemo(
    () => (invoice?.lines ?? []).reduce((s, l) => s + toNumber(l.lineTotal), 0),
    [invoice?.lines],
  )
  const subtotal = invoice?.subtotal !== undefined ? toNumber(invoice.subtotal) : lineSubtotal
  const discountAmount =
    invoice?.discountAmount !== undefined
      ? toNumber(invoice.discountAmount)
      : computeDiscountAmount(subtotal, invoice?.discountType ?? null, String(invoice?.discountRate ?? '0'))
  const taxableSubtotal =
    invoice?.taxableSubtotal !== undefined ? toNumber(invoice.taxableSubtotal) : Math.max(0, subtotal - discountAmount)

  const editSubtotal = useMemo(
    () => editLines.reduce((sum, line) => sum + line.qty * toNumber(line.unitPrice), 0),
    [editLines],
  )
  const editDiscountAmount = useMemo(
    () => computeDiscountAmount(editSubtotal, editDiscountType, editDiscountRate),
    [editSubtotal, editDiscountType, editDiscountRate],
  )
  const editTaxableSubtotal = Math.max(0, editSubtotal - editDiscountAmount)
  const editChargeRows = useMemo(
    () =>
      editCharges.map((charge) => ({
        ...charge,
        previewAmount: computeChargeAmount(editTaxableSubtotal, charge.type, charge.rate),
      })),
    [editCharges, editTaxableSubtotal],
  )
  const editTotal = editTaxableSubtotal + editChargeRows.reduce((sum, row) => sum + row.previewAmount, 0)

  const updateMutation = useMutation({
    mutationFn: async () => {
      return api.patch(`/invoices/${invoiceId}`, {
        dueDate: editDueDate ? toDayStartIso(editDueDate) : null,
        discountType: editDiscountType,
        discountRate: toRateString(editDiscountRate),
        lines: editLines.map((line) => ({
          id: line.id,
          qty: line.qty,
          unitPrice: toRateString(line.unitPrice),
        })),
        charges: [...editChargeRows]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((row) => ({
          taxChargeId: row.taxChargeId,
          name: row.name.trim(),
          type: row.type,
          rate: toRateString(row.rate),
          displayOrder: row.displayOrder,
          })),
      })
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['sales-invoice-detail', invoiceId] }),
        qc.invalidateQueries({ queryKey: ['sales', 'invoices'] }),
        qc.invalidateQueries({ queryKey: ['accounts-ar-aging'] }),
        qc.invalidateQueries({ queryKey: ['accounts-outstanding'] }),
      ])
      setEditOpen(false)
      setEditError(null)
    },
    onError: (err) => setEditError(apiErrorMessage(err, 'Failed to update invoice')),
  })

  function openEditDialog() {
    const currentLines = (invoice?.lines ?? []).map((line) => ({
      id: line.id,
      productId: line.productId,
      sku: line.sku,
      qty: Number(line.qty ?? 0),
      unitPrice: String(line.unitPrice ?? '0'),
    }))
    const currentCharges = [...(invoice?.charges ?? [])]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((charge, index) => ({
        taxChargeId: charge.taxChargeId,
        name: charge.name,
        type: charge.type,
        rate: charge.rate,
        displayOrder: Number(charge.displayOrder ?? index),
      }))
    setEditLines(currentLines)
    setEditCharges(currentCharges)
    setEditDiscountType(invoice?.discountType ?? null)
    setEditDiscountRate(String(invoice?.discountRate ?? '0'))
    setEditDueDate(toDateInput(invoice?.dueDate))
    setEditError(null)
    setEditOpen(true)
  }

  function updateLine(index: number, patch: Partial<EditLine>) {
    setEditLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function updateCharge(index: number, patch: Partial<EditCharge>) {
    setEditCharges((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addCharge() {
    setEditCharges((rows) => [
      ...rows,
      { taxChargeId: null, name: '', type: 'percentage', rate: '0', displayOrder: rows.length },
    ])
  }

  function removeCharge(index: number) {
    setEditCharges((rows) => rows.filter((_, i) => i !== index).map((row, i) => ({ ...row, displayOrder: i })))
  }

  function saveInvoice() {
    if (editLines.length === 0) {
      setEditError('Invoice must have at least one line')
      return
    }
    for (const line of editLines) {
      if (line.qty <= 0) {
        setEditError(`Invalid qty for ${line.sku}`)
        return
      }
      if (toNumber(line.unitPrice) < 0) {
        setEditError(`Invalid unit price for ${line.sku}`)
        return
      }
    }
    if (editDiscountType === 'percentage' && toNumber(editDiscountRate) > 100) {
      setEditError('Discount percentage cannot exceed 100')
      return
    }
    if (toNumber(editDiscountRate) < 0) {
      setEditError('Discount rate must be non-negative')
      return
    }
    for (const charge of editCharges) {
      if (!charge.name.trim()) {
        setEditError('All charges must have a name')
        return
      }
      if (toNumber(charge.rate) < 0) {
        setEditError(`Invalid rate for "${charge.name}"`)
        return
      }
      if (charge.type === 'percentage' && toNumber(charge.rate) > 100) {
        setEditError(`Charge percentage cannot exceed 100 for "${charge.name}"`)
        return
      }
    }
    setEditError(null)
    updateMutation.mutate()
  }

  return (
    <div className="space-y-4">
      {invoiceQuery.isLoading ? <p className="text-sm text-slate-500">Loading invoice...</p> : null}
      {invoiceQuery.isError ? (
        <p className="text-sm text-red-600">{apiErrorMessage(invoiceQuery.error, 'Unable to load invoice.')}</p>
      ) : null}

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
                      Edit Invoice
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
                    <TableRow>
                      <TableCell colSpan={4} className="text-right text-slate-600">
                        Discount
                        {invoice.discountType
                          ? ` (${invoice.discountType === 'percentage' ? `${toNumber(invoice.discountRate)}%` : 'fixed'})`
                          : ''}
                      </TableCell>
                      <TableCell className="text-slate-600">-{formatCurrencyINR(discountAmount)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={4} className="text-right text-slate-600">Taxable Subtotal</TableCell>
                      <TableCell className="text-slate-600">{formatCurrencyINR(taxableSubtotal)}</TableCell>
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
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={paymentBadgeClass(paymentStatus)}>
                  {paymentStatus === 'partially_paid' ? 'Partially Paid' : titleCase(paymentStatus)}
                </Badge>
                <Badge className={agingBadgeClass(invoice.agingBucket ?? null)}>
                  Aging {agingLabel(invoice.agingBucket ?? null)}
                </Badge>
              </div>
              <p className="text-sm text-slate-600">
                Paid: {formatCurrencyINR(toNumber(invoice.paidAmount))} · Remaining:{' '}
                {formatCurrencyINR(toNumber(invoice.remainingAmount))}
              </p>
              <p className="text-sm text-slate-600">
                Due Date: {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '-'} · Days Past Due:{' '}
                {invoice.daysPastDue ?? 0}
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

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Invoice Financials — {invoice.invoiceNumber}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Discount Type</p>
                    <select
                      value={editDiscountType ?? 'none'}
                      onChange={(e) => setEditDiscountType(e.target.value === 'none' ? null : (e.target.value as 'percentage' | 'fixed'))}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                    >
                      <option value="none">No discount</option>
                      <option value="percentage">Percentage</option>
                      <option value="fixed">Fixed</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Discount Rate</p>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editDiscountRate}
                      onChange={(e) => setEditDiscountRate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Due Date</p>
                    <Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="w-24">Qty</TableHead>
                        <TableHead className="w-36">Unit Price</TableHead>
                        <TableHead className="w-36">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editLines.map((line, index) => (
                        <TableRow key={line.id}>
                          <TableCell>{productNameById.get(line.productId) ?? line.sku}</TableCell>
                          <TableCell>{line.sku}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              value={line.qty}
                              onChange={(e) => updateLine(index, { qty: Math.max(1, Number(e.target.value || 1)) })}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={line.unitPrice}
                              onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>{formatCurrencyINR(line.qty * toNumber(line.unitPrice))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-36">Type</TableHead>
                        <TableHead className="w-24">Rate</TableHead>
                        <TableHead className="w-32">Order</TableHead>
                        <TableHead className="w-32">Preview</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editChargeRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-sm text-slate-400">
                            No charges. Add one below.
                          </TableCell>
                        </TableRow>
                      ) : (
                        editChargeRows.map((row, index) => (
                          <TableRow key={`${row.name}-${index}`}>
                            <TableCell>
                              <Input
                                value={row.name}
                                onChange={(e) => updateCharge(index, { name: e.target.value })}
                                placeholder="e.g. CGST"
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <select
                                value={row.type}
                                onChange={(e) => updateCharge(index, { type: e.target.value as 'percentage' | 'fixed' })}
                                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                              >
                                <option value="percentage">Percentage</option>
                                <option value="fixed">Fixed</option>
                              </select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={row.rate}
                                onChange={(e) => updateCharge(index, { rate: e.target.value })}
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                value={row.displayOrder}
                                onChange={(e) => updateCharge(index, { displayOrder: Math.max(0, Number(e.target.value || 0)) })}
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell className="text-slate-600">
                              {formatCurrencyINR(row.previewAmount)}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-400 hover:text-red-600"
                                onClick={() => removeCharge(index)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <Button variant="outline" size="sm" onClick={addCharge}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Charge
                </Button>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>{formatCurrencyINR(editSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Discount</span>
                    <span>-{formatCurrencyINR(editDiscountAmount)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Subtotal</span>
                    <span>{formatCurrencyINR(editTaxableSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Charges (Preview)</span>
                    <span>{formatCurrencyINR(editChargeRows.reduce((sum, row) => sum + row.previewAmount, 0))}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-900 border-t border-slate-200 pt-1">
                    <span>Total (Preview)</span>
                    <span>{formatCurrencyINR(editTotal)}</span>
                  </div>
                </div>

                {editError ? <p className="text-sm text-red-600">{editError}</p> : null}

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                  <Button onClick={saveInvoice} disabled={updateMutation.isPending}>
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
