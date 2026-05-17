import { useQuery } from '@tanstack/react-query'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatCurrencyINR } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type ARAgingRow = {
  outletId: string
  outletCode: string
  outletName: string
  current: number
  band0_30: number
  band31_60: number
  band60_plus: number
  total: number
}

type ARAgingResponse = {
  data: {
    generatedAt: string
    totals: {
      current: number
      band0_30: number
      band31_60: number
      band60_plus: number
      totalOutstanding: number
    }
    rows: ARAgingRow[]
  }
}

export function AccountsARAgingPage() {
  const reportQuery = useQuery({
    queryKey: ['accounts-ar-aging'],
    queryFn: async () => {
      const response = await api.get<ARAgingResponse>('/accounts/ar-aging')
      return response.data.data
    },
  })

  const report = reportQuery.data

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
              <p className="text-xs text-slate-500">
                Generated at: {new Date(report.generatedAt).toLocaleString()}
              </p>
              <div className="grid gap-2 sm:grid-cols-5">
                <AmountCard label="Current" amount={report.totals.current} />
                <AmountCard label="0-30 Days" amount={report.totals.band0_30} />
                <AmountCard label="31-60 Days" amount={report.totals.band31_60} />
                <AmountCard label="60+ Days" amount={report.totals.band60_plus} />
                <AmountCard label="Total" amount={report.totals.totalOutstanding} />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="p-0">
          {report && report.rows.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>0-30</TableHead>
                    <TableHead>31-60</TableHead>
                    <TableHead>60+</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.outletId}>
                      <TableCell>
                        <p className="font-medium text-slate-900">{row.outletName}</p>
                        <p className="text-xs text-slate-500">{row.outletCode}</p>
                      </TableCell>
                      <TableCell>{formatCurrencyINR(row.current)}</TableCell>
                      <TableCell>{formatCurrencyINR(row.band0_30)}</TableCell>
                      <TableCell>{formatCurrencyINR(row.band31_60)}</TableCell>
                      <TableCell>{formatCurrencyINR(row.band60_plus)}</TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {formatCurrencyINR(row.total)}
                      </TableCell>
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
