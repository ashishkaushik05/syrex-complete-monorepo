import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatCurrencyINR, titleCase } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type InvoiceLine = {
  id: string
  productId: string
  sku: string
  qty: number
  unitPrice: number | string
  lineTotal: number | string
}

type InvoiceRecord = {
  id: string
  orderId: string
  outletId: string
  invoiceNumber: string
  invoiceDate: string
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
  }
  lines: InvoiceLine[]
}

type ProductOption = {
  id: string
  name: string
}

type PaginatedResponse<T> = {
  data: T[]
}

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

function paymentBadgeClass(status: 'paid' | 'partially_paid' | 'unpaid' | 'overdue') {
  if (status === 'paid') return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  if (status === 'partially_paid') return 'border-blue-300 bg-blue-100 text-blue-800'
  if (status === 'overdue') return 'border-red-300 bg-red-100 text-red-800'
  return 'border-amber-300 bg-amber-100 text-amber-800'
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const invoiceId = id ?? ''

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

  const productNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of productsQuery.data ?? []) {
      map.set(item.id, item.name)
    }
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

  const subtotal = useMemo(() => {
    return (invoice?.lines ?? []).reduce((sum, line) => sum + toNumber(line.lineTotal), 0)
  }, [invoice?.lines])

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
                <Badge className="border-cyan-300 bg-cyan-100 text-cyan-800">Amount {formatCurrencyINR(toNumber(invoice.total))}</Badge>
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
                      <TableCell colSpan={4} className="text-right font-semibold text-slate-900">
                        Subtotal
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900">{formatCurrencyINR(subtotal)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={4} className="text-right font-semibold text-slate-900">
                        Total
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900">{formatCurrencyINR(toNumber(invoice.total))}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Payment Status</CardTitle>
            </CardHeader>
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
        </>
      ) : null}
    </div>
  )
}
