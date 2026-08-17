import { useQuery } from '@tanstack/react-query'
import { Package } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { formatCurrencyINR, timeAgo } from '@/lib/format'
import { asNumber, orderStatusBadge } from './types'
import type { OrderItem } from './types'

interface Props { id: string }

export function OrdersTab({ id }: Props) {
  const navigate = useNavigate()

  const ordersQuery = useQuery({
    queryKey: ['outlet-orders', id],
    queryFn: async () => {
      const r = await api.get<{ data: OrderItem[] }>('/orders', { params: { outletId: id, page: 1, limit: 20 } })
      return r.data.data
    },
  })

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Recent Orders</CardTitle>
          <Button size="sm" variant="outline" onClick={() => navigate(`/dashboard/sales/orders?outletId=${id}`)}>
            View All Orders
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {ordersQuery.isLoading ? (
          <p className="py-4 text-center text-sm text-slate-500">Loading orders...</p>
        ) : (ordersQuery.data ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center">
            <Package className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">No orders placed yet for this outlet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(ordersQuery.data ?? []).map((order) => (
              <div
                key={order.id}
                className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 transition hover:bg-slate-50"
                onClick={() => navigate(`/dashboard/sales/orders/${order.id}`)}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">Order #{order.id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-xs text-slate-500">{timeAgo(order.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium text-slate-700">{formatCurrencyINR(asNumber(order.grandTotal))}</p>
                  <Badge className={orderStatusBadge(order.status)}>{order.status.replace(/_/g, ' ')}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
