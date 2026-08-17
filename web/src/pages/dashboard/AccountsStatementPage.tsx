import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatCurrencyINR } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type OutletOption = {
  id: string
  outletCode: string
  name: string
}

type StatementRow = {
  id: string
  kind: 'invoice' | 'payment' | 'payment_reversal'
  happenedAt: string
  reference: string
  description: string | null
  debit: string
  credit: string
  runningBalance: string
}

type StatementResponse = {
  data: {
    outlet: OutletOption
    from: string
    to: string
    openingBalance: string
    closingBalance: string
    totalInvoiced: string
    totalReceived: string
    totalReversed: string
    rows: StatementRow[]
  }
}

function monthStart() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function labelForKind(kind: StatementRow['kind']) {
  if (kind === 'payment') return 'Payment'
  if (kind === 'payment_reversal') return 'Payment Void'
  return 'Invoice'
}

function toAmount(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function AccountsStatementPage() {
  const [selectedOutletId, setSelectedOutletId] = useState('')
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [search, setSearch] = useState('')

  const outletsQuery = useQuery({
    queryKey: ['accounts-statement-outlets'],
    queryFn: async () => {
      const response = await api.get<{ data: OutletOption[] }>('/outlets', {
        params: { page: 1, limit: 500, isActive: true },
      })
      return response.data.data
    },
  })

  const outlets = outletsQuery.data ?? []
  const filteredOutlets = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return outlets
    return outlets.filter((outlet) =>
      outlet.name.toLowerCase().includes(term) ||
      outlet.outletCode.toLowerCase().includes(term),
    )
  }, [outlets, search])

  const statementQuery = useQuery({
    queryKey: ['accounts-statement', selectedOutletId, from, to],
    enabled: Boolean(selectedOutletId && from && to),
    queryFn: async () => {
      const response = await api.get<StatementResponse>(
        `/accounts/outlets/${selectedOutletId}/statement`,
        {
          params: {
            from: new Date(`${from}T00:00:00.000Z`).toISOString(),
            to: new Date(`${to}T23:59:59.999Z`).toISOString(),
          },
        },
      )
      return response.data.data
    },
  })

  const statement = statementQuery.data

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-3">
            <CardTitle>Statement of Account</CardTitle>
            <Input
              placeholder="Search outlet"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {outletsQuery.isLoading ? (
              <p className="text-sm text-slate-500">Loading outlets...</p>
            ) : outletsQuery.isError ? (
              <p className="text-sm text-red-600">
                {apiErrorMessage(outletsQuery.error, 'Unable to load outlets.')}
              </p>
            ) : filteredOutlets.length === 0 ? (
              <p className="text-sm text-slate-500">No outlets found.</p>
            ) : (
              <div className="max-h-[560px] space-y-2 overflow-auto">
                {filteredOutlets.map((outlet) => {
                  const selected = outlet.id === selectedOutletId
                  return (
                    <button
                      key={outlet.id}
                      type="button"
                      onClick={() => setSelectedOutletId(outlet.id)}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                        selected
                          ? 'border-cyan-300 bg-cyan-50 text-slate-950'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block font-medium">{outlet.name}</span>
                      <span className="text-xs text-slate-500">{outlet.outletCode}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>{statement ? statement.outlet.name : 'Statement'}</CardTitle>
            <Button
              type="button"
              variant="outline"
              disabled={!statement}
              onClick={() => window.print()}
            >
              Print / PDF
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedOutletId ? (
              <p className="text-sm text-slate-500">Select an outlet to generate a statement.</p>
            ) : statementQuery.isLoading ? (
              <p className="text-sm text-slate-500">Generating statement...</p>
            ) : statementQuery.isError ? (
              <p className="text-sm text-red-600">
                {apiErrorMessage(statementQuery.error, 'Unable to generate statement.')}
              </p>
            ) : statement ? (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <AmountTile label="Opening" amount={toAmount(statement.openingBalance)} />
                  <AmountTile label="Invoiced" amount={toAmount(statement.totalInvoiced)} />
                  <AmountTile label="Received" amount={toAmount(statement.totalReceived)} />
                  <AmountTile label="Closing" amount={toAmount(statement.closingBalance)} />
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statement.rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                            No transactions in this date range.
                          </TableCell>
                        </TableRow>
                      ) : (
                        statement.rows.map((row) => (
                          <TableRow key={`${row.kind}-${row.id}`}>
                            <TableCell>{new Date(row.happenedAt).toLocaleDateString()}</TableCell>
                            <TableCell>{labelForKind(row.kind)}</TableCell>
                            <TableCell>
                              <p className="font-medium text-slate-900">{row.reference}</p>
                              {row.description ? (
                                <p className="text-xs text-slate-500">{row.description}</p>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right">
                              {toAmount(row.debit) > 0 ? formatCurrencyINR(toAmount(row.debit)) : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {toAmount(row.credit) > 0 ? formatCurrencyINR(toAmount(row.credit)) : '-'}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrencyINR(toAmount(row.runningBalance))}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AmountTile({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrencyINR(amount)}</p>
    </div>
  )
}
