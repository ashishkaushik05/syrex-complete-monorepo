import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatCurrencyINR } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type OutstandingRow = {
  outletId: string
  outletCode: string
  outletName: string
  outstandingBalance: number
  creditLimit: number
  availableCredit: number
  creditUtilisationPct: number
}

type OutstandingResponse = {
  data: {
    totalOutlets: number
    totalOutstanding: number
    rows: OutstandingRow[]
  }
}

type PaymentPreview = {
  outlet: {
    id: string
    name: string
    outletCode: string
  }
  totalOutstanding: number
  amountToAllocate: number
  unallocatedAmount: number
  allocations: Array<{
    invoiceId: string
    invoiceNumber: string
    invoiceDate: string
    remainingBefore: number
    allocateAmount: number
    remainingAfter: number
  }>
}

type PaymentSubmitResult = {
  payment: {
    id: string
    amount: number
    paymentDate: string
  }
  totalOutstandingBefore: number
  outletOutstandingAfter: number
  allocations: Array<{
    invoiceId: string
    invoiceNumber: string
    invoiceDate: string
    remainingBefore: number
    allocateAmount: number
    remainingAfter: number
  }>
}

function asNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

type ToastState = {
  text: string
  type: 'success' | 'error'
} | null

export function AccountsOutstandingPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [selectedOutlet, setSelectedOutlet] = useState<OutstandingRow | null>(null)
  const [paymentAmountInput, setPaymentAmountInput] = useState('')
  const [paymentDate, setPaymentDate] = useState(todayIsoDate())
  const [reference, setReference] = useState('')
  const [description, setDescription] = useState('')
  const [toast, setToast] = useState<ToastState>(null)

  const outstandingQuery = useQuery({
    queryKey: ['accounts-outstanding'],
    queryFn: async () => {
      const response = await api.get<OutstandingResponse>('/accounts/outstanding')
      return response.data.data
    },
  })

  const paymentAmount = asNumber(paymentAmountInput)

  const previewQuery = useQuery({
    queryKey: ['accounts-outstanding-payment-preview', selectedOutlet?.outletId, paymentAmount],
    enabled: paymentModalOpen && !!selectedOutlet && paymentAmount > 0,
    queryFn: async () => {
      if (!selectedOutlet) throw new Error('Outlet not selected')
      const response = await api.post<{ data: PaymentPreview }>(
        `/accounts/outlets/${selectedOutlet.outletId}/payments/preview`,
        {
          amount: paymentAmount,
        },
      )
      return response.data.data
    },
    retry: false,
  })

  const createPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOutlet) throw new Error('Outlet not selected')

      const payload: {
        amount: number
        paymentDate?: string
        reference?: string
        description?: string
      } = {
        amount: paymentAmount,
      }

      if (paymentDate.trim()) {
        payload.paymentDate = new Date(`${paymentDate}T00:00:00.000Z`).toISOString()
      }
      if (reference.trim()) payload.reference = reference.trim()
      if (description.trim()) payload.description = description.trim()

      const response = await api.post<{ data: PaymentSubmitResult }>(
        `/accounts/outlets/${selectedOutlet.outletId}/payments`,
        payload,
      )
      return response.data.data
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts-outstanding'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts-ar-aging'] }),
        queryClient.invalidateQueries({ queryKey: ['outlets-admin-list'] }),
        queryClient.invalidateQueries({ queryKey: ['outlet-payments'] }),
      ])

      setPaymentModalOpen(false)
      setSelectedOutlet(null)
      setPaymentAmountInput('')
      setPaymentDate(todayIsoDate())
      setReference('')
      setDescription('')
      setToast({
        text: `Payment recorded across ${result.allocations.length} invoice(s). New outstanding: ${formatCurrencyINR(result.outletOutstandingAfter)}.`,
        type: 'success',
      })
    },
    onError: (error) => {
      setToast({ text: apiErrorMessage(error, 'Unable to record payment.'), type: 'error' })
    },
  })

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!paymentModalOpen) {
      setSelectedOutlet(null)
      setPaymentAmountInput('')
      setPaymentDate(todayIsoDate())
      setReference('')
      setDescription('')
    }
  }, [paymentModalOpen])

  const rows = outstandingQuery.data?.rows ?? []

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter((row) => {
      return (
        row.outletName.toLowerCase().includes(keyword) ||
        row.outletCode.toLowerCase().includes(keyword)
      )
    })
  }, [rows, search])

  return (
    <div className="space-y-4">
      {toast ? (
        <div className="fixed right-4 top-20 z-40">
          <div
            className={`rounded-md px-4 py-2 text-sm shadow-lg ${
              toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.text}
          </div>
        </div>
      ) : null}

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Outstanding By Outlet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {outstandingQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading outstanding balances...</p>
          ) : outstandingQuery.isError ? (
            <p className="text-sm text-red-600">
              {apiErrorMessage(outstandingQuery.error, 'Unable to load outstanding balances.')}
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Outlets</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {outstandingQuery.data?.totalOutlets ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Total Outstanding</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {formatCurrencyINR(outstandingQuery.data?.totalOutstanding ?? 0)}
                  </p>
                </div>
              </div>
              <Input
                placeholder="Search outlet name or code"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="p-0">
          {filteredRows.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Credit Limit</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead>Utilisation</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.outletId}>
                      <TableCell>
                        <p className="font-medium text-slate-900">{row.outletName}</p>
                        <p className="text-xs text-slate-500">{row.outletCode}</p>
                      </TableCell>
                      <TableCell>{formatCurrencyINR(row.outstandingBalance)}</TableCell>
                      <TableCell>{formatCurrencyINR(row.creditLimit)}</TableCell>
                      <TableCell>{formatCurrencyINR(row.availableCredit)}</TableCell>
                      <TableCell>{row.creditUtilisationPct.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={row.outstandingBalance <= 0}
                          onClick={() => {
                            setSelectedOutlet(row)
                            setPaymentAmountInput('')
                            setReference('')
                            setDescription('')
                            setPaymentDate(todayIsoDate())
                            setPaymentModalOpen(true)
                          }}
                        >
                          Record Payment
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : outstandingQuery.isSuccess ? (
            <p className="p-4 text-sm text-slate-500">No outlets match this filter.</p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Outlet Payment</DialogTitle>
            <DialogDescription>
              {selectedOutlet
                ? `${selectedOutlet.outletName} (${selectedOutlet.outletCode})`
                : 'Select an outlet'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {selectedOutlet ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="text-xs text-slate-500">Current Outstanding</p>
                  <p className="font-semibold text-slate-900">{formatCurrencyINR(selectedOutlet.outstandingBalance)}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="text-xs text-slate-500">Credit Limit</p>
                  <p className="font-semibold text-slate-900">{formatCurrencyINR(selectedOutlet.creditLimit)}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="text-xs text-slate-500">Available Credit</p>
                  <p className="font-semibold text-slate-900">{formatCurrencyINR(selectedOutlet.availableCredit)}</p>
                </div>
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Payment amount"
                value={paymentAmountInput}
                onChange={(event) => setPaymentAmountInput(event.target.value)}
              />
              <Input
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
              <Input
                placeholder="Reference (optional)"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
              <Input
                placeholder="Description (optional)"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            {paymentAmountInput.trim().length === 0 ? (
              <p className="text-sm text-slate-500">Enter an amount to preview FIFO allocation.</p>
            ) : previewQuery.isLoading ? (
              <p className="text-sm text-slate-500">Calculating allocation preview...</p>
            ) : previewQuery.isError ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {apiErrorMessage(previewQuery.error, 'Unable to preview payment allocation.')}
              </p>
            ) : previewQuery.data ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-900">
                  Allocation Preview: {previewQuery.data.allocations.length} invoice(s)
                </p>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Invoice Date</TableHead>
                        <TableHead>Remaining Before</TableHead>
                        <TableHead>Allocated</TableHead>
                        <TableHead>Remaining After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewQuery.data.allocations.map((allocation) => (
                        <TableRow key={allocation.invoiceId}>
                          <TableCell>{allocation.invoiceNumber}</TableCell>
                          <TableCell>{new Date(allocation.invoiceDate).toLocaleDateString()}</TableCell>
                          <TableCell>{formatCurrencyINR(allocation.remainingBefore)}</TableCell>
                          <TableCell>{formatCurrencyINR(allocation.allocateAmount)}</TableCell>
                          <TableCell>{formatCurrencyINR(allocation.remainingAfter)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPaymentModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createPaymentMutation.mutate()}
                disabled={
                  createPaymentMutation.isPending ||
                  !selectedOutlet ||
                  paymentAmount <= 0 ||
                  previewQuery.isLoading ||
                  previewQuery.isError
                }
              >
                {createPaymentMutation.isPending ? 'Recording...' : 'Record Payment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
