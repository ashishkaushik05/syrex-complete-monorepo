import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatCurrencyINR, titleCase } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type OrderStatus =
  | 'pending_approval'
  | 'on_hold'
  | 'approved'
  | 'partially_dispatched'
  | 'fully_dispatched'
  | 'rejected'
  | 'cancelled'

type OrderLine = {
  id: string
  productId: string
  sku: string
  qtyOrdered: number
  qtyDispatched: number
  unitPrice: number | string
}

type SalesOrder = {
  id: string
  outletId: string
  status: OrderStatus
  deliveryAddress: string
  notes?: string | null
  holdNote?: string | null
  rejectionReason?: string | null
  createdAt: string
  outlet?: {
    id: string
    name: string
  }
  lines: OrderLine[]
  linkedInvoices?: InvoiceRecord[]
  linkedDispatches?: DispatchRecord[]
}

type OutletFinance = {
  outstandingBalance: number | string
  creditLimit: number | string
  availableCredit: number | string
  creditUtilisationPct: number
  overdueInvoices: {
    count: number
    total: number
    oldestDate: string | null
  }
}

type ProductOption = {
  id: string
  name: string
}

type InvoiceRecord = {
  id: string
  invoiceNumber: string
  total: number | string
  createdAt: string
}

type DispatchRecord = {
  id: string
  lrNumber?: string | null
  dispatchDate: string
}

type PaginatedResponse<T> = {
  data: T[]
  pagination: {
    total: number
    page: number
    limit: number
  }
}

type ToastState = {
  text: string
  type: 'success' | 'error'
} | null

type MaybeNested<T> = T | { data?: T }

function unwrapNested<T>(payload: MaybeNested<T> | undefined): T | undefined {
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
    return payload.data
  }
  return payload as T | undefined
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function statusBadgeClass(status: OrderStatus) {
  if (status === 'approved' || status === 'fully_dispatched') {
    return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  }
  if (status === 'pending_approval' || status === 'partially_dispatched') {
    return 'border-amber-300 bg-amber-100 text-amber-800'
  }
  if (status === 'rejected' || status === 'cancelled') {
    return 'border-red-300 bg-red-100 text-red-800'
  }
  return 'border-slate-300 bg-slate-100 text-slate-700'
}

function timelineIndex(status: OrderStatus) {
  if (status === 'pending_approval' || status === 'on_hold') return 0
  if (status === 'approved') return 1
  if (status === 'partially_dispatched') return 2
  if (status === 'fully_dispatched') return 3
  return 0
}

const TIMELINE_STEPS = ['Pending Approval', 'Approved', 'Partially Dispatched', 'Fully Dispatched']

type DetailTab = 'invoice' | 'dispatch' | 'notes'

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const orderId = id ?? ''

  const [tab, setTab] = useState<DetailTab>('invoice')
  const [toast, setToast] = useState<ToastState>(null)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const orderQuery = useQuery<SalesOrder>({
    queryKey: ['sales-order-detail', orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const response = await api.get<MaybeNested<SalesOrder>>(`/orders/${orderId}`)
      const payload = response.data as MaybeNested<SalesOrder> | undefined
      const order = unwrapNested(payload)
      if (order) return order
      throw new Error('Order not found')
    },
  })

  const productsQuery = useQuery<ProductOption[]>({
    queryKey: ['sales-products-map'],
    queryFn: async () => {
      const response = await api.get<MaybeNested<PaginatedResponse<ProductOption>>>('/products', {
        params: { page: 1, limit: 200 },
      })
      const payload = response.data as MaybeNested<PaginatedResponse<ProductOption>> | undefined
      const pageData = unwrapNested(payload)
      return pageData?.data ?? []
    },
  })

  const outletFinanceQuery = useQuery<OutletFinance>({
    queryKey: ['sales-order-outlet-finance', orderQuery.data?.outletId],
    enabled: Boolean(orderQuery.data?.outletId),
    queryFn: async () => {
      const response = await api.get<MaybeNested<OutletFinance>>(
        `/accounts/outlet/${orderQuery.data?.outletId}/financial-profile`,
      )
      const payload = response.data as MaybeNested<OutletFinance> | undefined
      const finance = unwrapNested(payload)
      if (finance) return finance
      return {
        outstandingBalance: 0,
        creditLimit: 0,
        availableCredit: 0,
        creditUtilisationPct: 0,
        overdueInvoices: {
          count: 0,
          total: 0,
          oldestDate: null,
        },
      }
    },
  })

  const order = orderQuery.data
  const linkedInvoices = order?.linkedInvoices ?? []
  const linkedDispatches = order?.linkedDispatches ?? []

  const lineTotals = useMemo(() => {
    return (order?.lines ?? []).map((line) => ({
      ...line,
      lineTotal: line.qtyOrdered * toNumber(line.unitPrice),
    }))
  }, [order?.lines])

  const subtotal = useMemo(() => {
    return lineTotals.reduce((sum, line) => sum + line.lineTotal, 0)
  }, [lineTotals])

  const productNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const product of productsQuery.data ?? []) {
      map.set(product.id, product.name)
    }
    return map
  }, [productsQuery.data])

  return (
    <div className="space-y-4">
      {toast ? (
        <div className="fixed right-4 top-4 z-40">
          <div
            className={`rounded-lg px-4 py-2 text-sm font-medium shadow-md ${
              toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.text}
          </div>
        </div>
      ) : null}

      {orderQuery.isLoading ? <p className="text-sm text-slate-500">Loading order...</p> : null}
      {orderQuery.isError ? <p className="text-sm text-red-600">Unable to load order.</p> : null}

      {order ? (
        <>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Order {order.id.slice(0, 12)}</CardTitle>
                  <p className="text-sm text-slate-500">
                    {order.outlet?.name ?? order.outletId} · Created {new Date(order.createdAt).toLocaleString()}
                  </p>
                </div>
                <Badge className={statusBadgeClass(order.status)}>{titleCase(order.status)}</Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-5">
                {TIMELINE_STEPS.map((step, index) => {
                  const active = index <= timelineIndex(order.status)
                  return (
                    <div
                      key={step}
                      className={`rounded-lg border px-3 py-2 text-center text-xs font-medium ${
                        active
                          ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      {step}
                    </div>
                  )
                })}
              </div>

              {order.holdNote?.trim() ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Hold Note</p>
                  <p className="mt-1 text-sm font-medium text-amber-900">{order.holdNote.trim()}</p>
                </div>
              ) : null}

              {order.rejectionReason?.trim() ? (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-800">Rejection Reason</p>
                  <p className="mt-1 text-sm font-medium text-red-900">{order.rejectionReason.trim()}</p>
                </div>
              ) : null}
            </CardHeader>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Outlet Financial Profile</CardTitle>
            </CardHeader>
            <CardContent>
              {outletFinanceQuery.isLoading ? (
                <p className="text-sm text-slate-500">Loading outlet finance...</p>
              ) : outletFinanceQuery.isError ? (
                <p className="text-sm text-red-600">
                  {apiErrorMessage(outletFinanceQuery.error, 'Unable to load outlet financial profile.')}
                </p>
              ) : outletFinanceQuery.data ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Outstanding</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {formatCurrencyINR(toNumber(outletFinanceQuery.data.outstandingBalance))}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Credit Limit</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {formatCurrencyINR(toNumber(outletFinanceQuery.data.creditLimit))}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Available Credit</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {formatCurrencyINR(toNumber(outletFinanceQuery.data.availableCredit))}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Credit Utilisation</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {toNumber(outletFinanceQuery.data.creditUtilisationPct).toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Overdue Invoices</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {outletFinanceQuery.data.overdueInvoices.count}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Overdue Total</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {formatCurrencyINR(toNumber(outletFinanceQuery.data.overdueInvoices.total))}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No financial profile data available.</p>
              )}
            </CardContent>
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
                      <TableHead>Dispatched</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineTotals.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{productNameById.get(line.productId) ?? line.sku}</TableCell>
                        <TableCell>{line.sku}</TableCell>
                        <TableCell>{line.qtyOrdered}</TableCell>
                        <TableCell>{line.qtyDispatched}</TableCell>
                        <TableCell>{formatCurrencyINR(toNumber(line.unitPrice))}</TableCell>
                        <TableCell>{formatCurrencyINR(line.lineTotal)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={5} className="text-right font-semibold text-slate-900">
                        Total
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900">{formatCurrencyINR(subtotal)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Related</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant={tab === 'invoice' ? 'default' : 'outline'} onClick={() => setTab('invoice')}>
                  Invoice
                </Button>
                <Button variant={tab === 'dispatch' ? 'default' : 'outline'} onClick={() => setTab('dispatch')}>
                  Dispatch
                </Button>
                <Button variant={tab === 'notes' ? 'default' : 'outline'} onClick={() => setTab('notes')}>
                  Notes
                </Button>
              </div>

              {tab === 'invoice' ? (
                orderQuery.isLoading ? (
                  <p className="text-sm text-slate-500">Loading linked invoices...</p>
                ) : linkedInvoices.length === 0 ? (
                  <p className="text-sm text-slate-500">No linked invoice yet.</p>
                ) : (
                  <div className="space-y-2">
                    {linkedInvoices.map((invoice) => (
                      <Link
                        key={invoice.id}
                        to={`/dashboard/accounts/invoices/${invoice.id}`}
                        className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                      >
                        <p className="font-medium text-slate-900">{invoice.invoiceNumber}</p>
                        <p className="text-xs text-slate-500">
                          {formatCurrencyINR(toNumber(invoice.total))} · {new Date(invoice.createdAt).toLocaleDateString()}
                        </p>
                      </Link>
                    ))}
                  </div>
                )
              ) : null}

              {tab === 'dispatch' ? (
                orderQuery.isLoading ? (
                  <p className="text-sm text-slate-500">Loading linked dispatches...</p>
                ) : linkedDispatches.length === 0 ? (
                  <p className="text-sm text-slate-500">No linked dispatch yet.</p>
                ) : (
                  <div className="space-y-2">
                    {linkedDispatches.map((dispatch) => (
                      <Link
                        key={dispatch.id}
                        to={`/dashboard/sales/dispatches/${dispatch.id}`}
                        className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                      >
                        <p className="font-medium text-slate-900">Dispatch {dispatch.id.slice(0, 8)}</p>
                        <p className="text-xs text-slate-500">
                          LR: {dispatch.lrNumber ?? '-'} · {new Date(dispatch.dispatchDate).toLocaleDateString()}
                        </p>
                      </Link>
                    ))}
                  </div>
                )
              ) : null}

              {tab === 'notes' ? (
                <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                  {order.notes?.trim() ? order.notes : 'No notes on this order.'}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
