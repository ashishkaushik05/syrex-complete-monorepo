import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatCurrencyINR } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type ARAgingBucket = 'current' | '1_30' | '31_60' | '61_90' | '90_plus'

type ARAgingRow = {
  invoiceId: string
  invoiceNumber: string
  outletId: string
  outletCode: string
  outletName: string
  invoiceDate: string
  dueDate: string | null
  amountDue: number
  daysPastDue: number
  agingBucket: ARAgingBucket
}

type ARAgingResponse = {
  data: {
    generatedAt: string
    totals: {
      current: number
      band1_30: number
      band31_60: number
      band61_90: number
      band90_plus: number
      totalOutstanding: number
    }
    rows: ARAgingRow[]
  }
}

function agingLabel(bucket: ARAgingBucket) {
  if (bucket === '1_30') return '1-30'
  if (bucket === '31_60') return '31-60'
  if (bucket === '61_90') return '61-90'
  if (bucket === '90_plus') return '90+'
  return 'Current'
}

export function AccountsARAgingPage() {
  const [query, setQuery] = useState('')
  const [bucketFilter, setBucketFilter] = useState<'all' | ARAgingBucket>('all')

  const reportQuery = useQuery({
    queryKey: ['accounts-ar-aging'],
    queryFn: async () => {
      const response = await api.get<ARAgingResponse>('/accounts/ar-aging')
      return response.data.data
    },
  })

  const report = reportQuery.data

  const filteredRows = useMemo(() => {
    const allRows = report?.rows ?? []
    const keyword = query.trim().toLowerCase()
    return allRows.filter((row) => {
      if (bucketFilter !== 'all' && row.agingBucket !== bucketFilter) return false
      if (!keyword) return true
      return (
        row.invoiceNumber.toLowerCase().includes(keyword) ||
        row.outletName.toLowerCase().includes(keyword) ||
        row.outletCode.toLowerCase().includes(keyword)
      )
    })
  }, [bucketFilter, query, report?.rows])

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>AR Aging Report</CardTitle>
        </CardHeader>
        <CardContent>
          {reportQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading AR aging report...</p>
          ) : reportQuery.isError ? (
            <p className="text-sm text-red-600">
              {apiErrorMessage(reportQuery.error, 'Unable to load AR aging report.')}
            </p>
          ) : report ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Generated at: {new Date(report.generatedAt).toLocaleString()}</p>
              <div className="grid gap-2 sm:grid-cols-6">
                <AmountCard label="Current" amount={report.totals.current} />
                <AmountCard label="1-30" amount={report.totals.band1_30} />
                <AmountCard label="31-60" amount={report.totals.band31_60} />
                <AmountCard label="61-90" amount={report.totals.band61_90} />
                <AmountCard label="90+" amount={report.totals.band90_plus} />
                <AmountCard label="Total" amount={report.totals.totalOutstanding} />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search outlet or invoice"
            />
            <select
              value={bucketFilter}
              onChange={(event) => setBucketFilter(event.target.value as 'all' | ARAgingBucket)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
            >
              <option value="all">All Buckets</option>
              <option value="current">Current</option>
              <option value="1_30">1-30</option>
              <option value="31_60">31-60</option>
              <option value="61_90">61-90</option>
              <option value="90_plus">90+</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredRows.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Amount Due</TableHead>
                    <TableHead>Days Past Due</TableHead>
                    <TableHead>Bucket</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.invoiceId}>
                      <TableCell>
                        <p className="font-medium text-slate-900">{row.invoiceNumber}</p>
                        <p className="text-xs text-slate-500">{row.invoiceId.slice(0, 8)}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-900">{row.outletName}</p>
                        <p className="text-xs text-slate-500">{row.outletCode}</p>
                      </TableCell>
                      <TableCell>{new Date(row.invoiceDate).toLocaleDateString()}</TableCell>
                      <TableCell>{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '-'}</TableCell>
                      <TableCell>{formatCurrencyINR(row.amountDue)}</TableCell>
                      <TableCell>{row.daysPastDue}</TableCell>
                      <TableCell>{agingLabel(row.agingBucket)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : reportQuery.isSuccess ? (
            <p className="p-4 text-sm text-slate-500">No outstanding AR entries found.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function AmountCard({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrencyINR(amount)}</p>
    </div>
  )
}
