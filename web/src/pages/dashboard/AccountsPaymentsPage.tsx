import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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

type OutletPaymentHistoryItem = {
  id: string
  amount: number
  paymentDate: string
  reference?: string | null
  description?: string | null
  voidedAt?: string | null
  voidReason?: string | null
  allocatedAmount: number
  allocatedInvoices: number
  allocations: Array<{
    id: string
    invoiceId: string
    invoiceNumber: string
    invoiceDate: string
    amount: number
    allocatedAt: string
  }>
}

type OutletPaymentHistoryResponse = {
  data: OutletPaymentHistoryItem[]
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

function asNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function AccountsPaymentsPage() {
  const queryClient = useQueryClient()
  const [selectedOutletId, setSelectedOutletId] = useState('')
  const [search, setSearch] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [paymentDate, setPaymentDate] = useState(todayIsoDate())
  const [reference, setReference] = useState('')
  const [description, setDescription] = useState('')
  const [toast, setToast] = useState<ToastState>(null)
  const [recordConfirmOpen, setRecordConfirmOpen] = useState(false)
  const [voidReasons, setVoidReasons] = useState<Record<string, string>>({})

  const outstandingQuery = useQuery({
    queryKey: ['accounts-outstanding'],
    queryFn: async () => {
      const response = await api.get<OutstandingResponse>('/accounts/outstanding')
      return response.data.data
    },
  })

  const outlets = useMemo(
    () => outstandingQuery.data?.rows ?? [],
    [outstandingQuery.data?.rows],
  )

  useEffect(() => {
    if (!selectedOutletId && outlets.length > 0) {
      setSelectedOutletId(outlets[0].outletId)
    }
  }, [outlets, selectedOutletId])

  const selectedOutlet = useMemo(
    () => outlets.find((row) => row.outletId === selectedOutletId) ?? null,
    [outlets, selectedOutletId],
  )

  const filteredOutlets = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return outlets
    return outlets.filter((row) => {
      return (
        row.outletName.toLowerCase().includes(term) ||
        row.outletCode.toLowerCase().includes(term)
      )
    })
  }, [outlets, search])

  const amount = asNumber(amountInput)

  const previewQuery = useQuery({
    queryKey: ['accounts-payments-preview', selectedOutletId, amount],
    enabled: !!selectedOutletId && amount > 0 && (selectedOutlet?.outstandingBalance ?? 0) > 0,
    queryFn: async () => {
      const response = await api.post<{ data: PaymentPreview }>(
        `/accounts/outlets/${selectedOutletId}/payments/preview`,
        { amount },
      )
      return response.data.data
    },
    retry: false,
  })

  const paymentHistoryQuery = useQuery({
    queryKey: ['accounts-outlet-payment-history', selectedOutletId],
    enabled: !!selectedOutletId,
    queryFn: async () => {
      const response = await api.get<OutletPaymentHistoryResponse>(
        `/accounts/outlets/${selectedOutletId}/payments`,
        { params: { page: 1, limit: 20 } },
      )
      return response.data
    },
  })

  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOutletId) throw new Error('Select an outlet first')

      const payload: {
        amount: number
        paymentDate?: string
        reference?: string
        description?: string
      } = { amount }

      if (paymentDate.trim()) {
        payload.paymentDate = new Date(`${paymentDate}T00:00:00.000Z`).toISOString()
      }
      if (reference.trim()) payload.reference = reference.trim()
      if (description.trim()) payload.description = description.trim()

      const response = await api.post<{ data: PaymentSubmitResult }>(
        `/accounts/outlets/${selectedOutletId}/payments`,
        payload,
      )
      return response.data.data
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts-outstanding'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts-ar-aging'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts-outlet-payment-history'] }),
        queryClient.invalidateQueries({ queryKey: ['outlet-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['outlets-admin-list'] }),
      ])
      setAmountInput('')
      setReference('')
      setDescription('')
      setPaymentDate(todayIsoDate())
      setToast({
        type: 'success',
        text: `Payment recorded across ${result.allocations.length} invoice(s). New outstanding: ${formatCurrencyINR(result.outletOutstandingAfter)}.`,
      })
    },
    onError: (error) => {
      setToast({
        type: 'error',
        text: apiErrorMessage(error, 'Unable to record payment.'),
      })
    },
  })

  const voidPaymentMutation = useMutation({
    mutationFn: async ({ paymentId, reason }: { paymentId: string; reason: string }) => {
      const response = await api.patch<{ data: OutletPaymentHistoryItem }>(
        `/accounts/payments/${paymentId}/void`,
        { reason },
      )
      return response.data.data
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts-outstanding'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts-ar-aging'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts-outlet-payment-history'] }),
        queryClient.invalidateQueries({ queryKey: ['outlet-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['outlets-admin-list'] }),
      ])
      setVoidReasons({})
      setToast({ type: 'success', text: 'Payment voided and balances restored.' })
    },
    onError: (error) => {
      setToast({
        type: 'error',
        text: apiErrorMessage(error, 'Unable to void payment.'),
      })
    },
  })

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

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

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-3">
            <CardTitle>Outlets</CardTitle>
            <Input
              placeholder="Search outlet by name/code"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </CardHeader>
          <CardContent className="p-0">
            {outstandingQuery.isLoading ? (
              <p className="p-4 text-sm text-slate-500">Loading outlets...</p>
            ) : outstandingQuery.isError ? (
              <p className="p-4 text-sm text-red-600">
                {apiErrorMessage(outstandingQuery.error, 'Unable to load outlets.')}
              </p>
            ) : filteredOutlets.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No outlets found.</p>
            ) : (
              <div className="overflow-hidden rounded-b-lg border-t border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Outlet</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead>Available Credit</TableHead>
                      <TableHead className="text-right">Select</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOutlets.map((row) => {
                      const isSelected = row.outletId === selectedOutletId
                      return (
                        <TableRow
                          key={row.outletId}
                          className={isSelected ? 'bg-cyan-50/60' : undefined}
                        >
                          <TableCell>
                            <p className="font-medium text-slate-900">{row.outletName}</p>
                            <p className="text-xs text-slate-500">{row.outletCode}</p>
                          </TableCell>
                          <TableCell>{formatCurrencyINR(row.outstandingBalance)}</TableCell>
                          <TableCell>{formatCurrencyINR(row.availableCredit)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant={isSelected ? 'default' : 'outline'}
                              onClick={() => setSelectedOutletId(row.outletId)}
                            >
                              {isSelected ? 'Selected' : 'Use'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Record Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedOutlet ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                  <p className="text-xs text-slate-500">Outlet</p>
                  <p className="text-sm font-semibold text-slate-900">{selectedOutlet.outletName}</p>
                  <p className="text-xs text-slate-500">{selectedOutlet.outletCode}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                  <p className="text-xs text-slate-500">Outstanding</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatCurrencyINR(selectedOutlet.outstandingBalance)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select an outlet to start.</p>
            )}

            {selectedOutlet && selectedOutlet.outstandingBalance <= 0 ? (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                This outlet has no outstanding balance. You can still view payment history below.
              </p>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Amount"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
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

            {amountInput.trim().length === 0 ? (
              <p className="text-sm text-slate-500">Enter amount to preview FIFO allocation.</p>
            ) : previewQuery.isLoading ? (
              <p className="text-sm text-slate-500">Preparing allocation preview...</p>
            ) : previewQuery.isError ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {apiErrorMessage(previewQuery.error, 'Unable to preview payment allocation.')}
              </p>
            ) : previewQuery.data ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-900">
                  FIFO Preview: {previewQuery.data.allocations.length} invoice(s)
                </p>
                <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Before</TableHead>
                        <TableHead>Apply</TableHead>
                        <TableHead>After</TableHead>
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

            <div className="flex justify-end">
              <Button
                onClick={() => setRecordConfirmOpen(true)}
                disabled={
                  !selectedOutletId ||
                  (selectedOutlet?.outstandingBalance ?? 0) <= 0 ||
                  amount <= 0 ||
                  recordPaymentMutation.isPending ||
                  previewQuery.isLoading ||
                  previewQuery.isError
                }
              >
                {recordPaymentMutation.isPending ? 'Recording...' : 'Record Payment'}
              </Button>
              <ConfirmDialog
                open={recordConfirmOpen}
                onOpenChange={setRecordConfirmOpen}
                title="Record Payment"
                description={`Record a payment of ${formatCurrencyINR(amount)} for ${selectedOutlet?.outletName ?? 'this outlet'}? This will allocate the amount against outstanding invoices.`}
                confirmLabel="Record Payment"
                onConfirm={() => { setRecordConfirmOpen(false); recordPaymentMutation.mutate() }}
                loading={recordPaymentMutation.isPending}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Payment History {selectedOutlet ? `· ${selectedOutlet.outletName}` : ''}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!selectedOutletId ? (
            <p className="text-sm text-slate-500">Select an outlet to view payment history.</p>
          ) : paymentHistoryQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading payment history...</p>
          ) : paymentHistoryQuery.isError ? (
            <p className="text-sm text-red-600">
              {apiErrorMessage(paymentHistoryQuery.error, 'Unable to load payment history.')}
            </p>
          ) : (paymentHistoryQuery.data?.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No payments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {(paymentHistoryQuery.data?.data ?? []).map((payment) => (
                <div
                  key={payment.id}
                  className={`rounded-md border p-3 ${
                    payment.voidedAt ? 'border-red-200 bg-red-50/50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {formatCurrencyINR(payment.amount)}
                      </p>
                      {payment.voidedAt ? (
                        <p className="text-xs font-medium text-red-700">
                          VOID · {new Date(payment.voidedAt).toLocaleDateString()}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500">
                      {new Date(payment.paymentDate).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {payment.reference?.trim() || payment.description?.trim() || 'No reference'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {payment.allocatedInvoices} invoice(s), {formatCurrencyINR(payment.allocatedAmount)} allocated
                  </p>
                  {payment.voidedAt ? (
                    <p className="mt-2 text-xs text-red-700">
                      Reason: {payment.voidReason ?? 'No reason recorded'}
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={voidReasons[payment.id] ?? ''}
                        onChange={(event) =>
                          setVoidReasons((current) => ({
                            ...current,
                            [payment.id]: event.target.value,
                          }))
                        }
                        placeholder="Void reason"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          voidPaymentMutation.isPending ||
                          (voidReasons[payment.id] ?? '').trim().length < 3
                        }
                        onClick={() =>
                          voidPaymentMutation.mutate({
                            paymentId: payment.id,
                            reason: (voidReasons[payment.id] ?? '').trim(),
                          })
                        }
                      >
                        Void
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
