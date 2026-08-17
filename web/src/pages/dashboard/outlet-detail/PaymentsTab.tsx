import { useQuery } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { formatCurrencyINR } from '@/lib/format'
import { asNumber } from './types'
import type { OutletPaymentItem } from './types'

interface Props { id: string }

export function PaymentsTab({ id }: Props) {
  const paymentsQuery = useQuery({
    queryKey: ['outlet-payments', id],
    queryFn: async () => {
      const r = await api.get<{ data: OutletPaymentItem[] }>(`/accounts/outlets/${id}/payments`, {
        params: { page: 1, limit: 20 },
      })
      return r.data.data
    },
  })

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Payment History</CardTitle>
      </CardHeader>
      <CardContent>
        {paymentsQuery.isLoading ? (
          <p className="py-4 text-center text-sm text-slate-500">Loading payments...</p>
        ) : paymentsQuery.isError ? (
          <p className="py-4 text-center text-sm text-slate-500">Payment history unavailable.</p>
        ) : (paymentsQuery.data ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center">
            <Receipt className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">No payments recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(paymentsQuery.data ?? []).map((payment) => (
              <div key={payment.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-slate-900">
                      {formatCurrencyINR(asNumber(payment.amount))}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {payment.reference?.trim() || payment.description?.trim() || 'No reference'}
                    </p>
                  </div>
                  <p className="text-sm text-slate-500">
                    {new Date(payment.paymentDate).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                {payment.allocations.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="mb-2 text-xs font-medium text-slate-500">
                      Allocated to {payment.allocatedInvoices} invoice(s)
                    </p>
                    <div className="space-y-1">
                      {payment.allocations.map((alloc) => (
                        <div key={alloc.id} className="flex items-center justify-between text-xs text-slate-600">
                          <span>{alloc.invoiceNumber}</span>
                          <span className="font-medium">{formatCurrencyINR(asNumber(alloc.amount))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
