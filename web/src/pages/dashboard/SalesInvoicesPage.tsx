import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatCurrencyINR, timeAgo } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type Invoice = {
  id: string
  invoiceNumber: string
  invoiceDate: string
  total: number | string
  paidAmount?: number | string
  remainingAmount?: number | string
  paymentStatus?: 'paid' | 'partially_paid' | 'unpaid'
  isOverdue?: boolean
  createdAt: string
  outlet?: {
    id: string
    name: string
  }
}

type Response = {
  data: Invoice[]
}

function normalizeInvoiceRows(payload: unknown): Invoice[] {
  if (Array.isArray(payload)) return payload as Invoice[]
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: Invoice[] }).data
  }
  return []
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function paymentStatus(invoice: Invoice): 'paid' | 'partially_paid' | 'unpaid' | 'overdue' {
  if (invoice.paymentStatus === 'paid') return 'paid'
  if (invoice.paymentStatus === 'partially_paid') return 'partially_paid'
  if (invoice.paymentStatus === 'unpaid' && invoice.isOverdue) return 'overdue'
  return 'unpaid'
}

function statusBadgeClass(status: 'paid' | 'partially_paid' | 'unpaid' | 'overdue') {
  if (status === 'paid') return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  if (status === 'partially_paid') return 'border-blue-300 bg-blue-100 text-blue-800'
  if (status === 'overdue') return 'border-red-300 bg-red-100 text-red-800'
  return 'border-amber-300 bg-amber-100 text-amber-800'
}

export function SalesInvoicesPage() {
  const navigate = useNavigate()

  const query = useQuery({
    queryKey: ['sales', 'invoices'],
    queryFn: async () => {
      const response = await api.get<Response>('/invoices', { params: { page: 1, limit: 50 } })
      return normalizeInvoiceRows(response.data.data)
    },
  })
  const loadError = query.isError ? apiErrorMessage(query.error, 'Unable to load invoices.') : null

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle>Sales Invoices</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {query.isLoading ? <p className="text-sm text-slate-500">Loading invoices...</p> : null}
        {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
        {!query.isLoading && !query.isError ? (
          (query.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No invoices found.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(query.data ?? []).map((invoice) => {
                    const status = paymentStatus(invoice)
                    return (
                      <TableRow
                        key={invoice.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/dashboard/accounts/invoices/${invoice.id}`)}
                      >
                        <TableCell>
                          <p className="font-medium text-slate-900">{invoice.invoiceNumber}</p>
                          <p className="text-xs text-slate-500">{invoice.id.slice(0, 8)}</p>
                        </TableCell>
                        <TableCell>{invoice.outlet?.name ?? '-'}</TableCell>
                        <TableCell>{formatCurrencyINR(toNumber(invoice.total))}</TableCell>
                        <TableCell>
                          <Badge className={statusBadgeClass(status)}>
                            {status === 'paid'
                              ? 'Paid'
                              : status === 'partially_paid'
                                ? 'Partially Paid'
                                : status === 'overdue'
                                  ? 'Overdue'
                                  : 'Unpaid'}
                          </Badge>
                        </TableCell>
                        <TableCell>{timeAgo(invoice.createdAt)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}
