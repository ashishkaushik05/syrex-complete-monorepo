import { useQuery } from '@tanstack/react-query'
import { Building2, PackageCheck, ReceiptIndianRupee, ShoppingCart, Truck, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { formatCurrencyINR, timeAgo } from '@/lib/format'

type PaginatedResponse<T> = {
  data: T[]
  pagination: { total: number; page: number; limit: number }
}

type OutletItem = { id: string }
type UserItem = { id: string }
type OrderItem = {
  id: string
  status: string
  createdAt: string
  outlet?: { name?: string }
}
type InvoiceItem = {
  id: string
  remainingAmount: number
}
type DispatchItem = {
  id: string
  createdAt: string
  order?: { outlet?: { name?: string } }
}

export function OverviewPage() {
  const navigate = useNavigate()

  const overviewQuery = useQuery({
    queryKey: ['overview-live'],
    queryFn: async () => {
      const [outletsRes, usersRes, allOrdersRes, invoicesRes, dispatchesRes, pendingOrdersRes] = await Promise.all([
        api.get<PaginatedResponse<OutletItem>>('/outlets', { params: { page: 1, limit: 1 } }),
        api.get<{ data: UserItem[] }>('/users'),
        api.get<PaginatedResponse<OrderItem>>('/orders', { params: { page: 1, limit: 200 } }),
        api.get<PaginatedResponse<InvoiceItem>>('/invoices', { params: { page: 1, limit: 200 } }),
        api.get<PaginatedResponse<DispatchItem>>('/dispatches', { params: { page: 1, limit: 200 } }),
        api.get<PaginatedResponse<OrderItem>>('/orders', { params: { status: 'pending_approval', page: 1, limit: 1 } }),
      ])

      const orders = allOrdersRes.data.data ?? []
      const invoices = invoicesRes.data.data ?? []
      const dispatches = dispatchesRes.data.data ?? []

      const approvedOrders = orders.filter((row) => row.status === 'approved').length
      const partialDispatchOrders = orders.filter((row) => row.status === 'partially_dispatched').length
      const fullDispatchOrders = orders.filter((row) => row.status === 'fully_dispatched').length
      const totalOutstanding = invoices.reduce((sum, row) => sum + Number(row.remainingAmount ?? 0), 0)

      return {
        outlets: outletsRes.data.pagination.total,
        users: usersRes.data.data.length,
        pendingOrders: pendingOrdersRes.data.pagination.total,
        approvedOrders,
        partialDispatchOrders,
        fullDispatchOrders,
        totalOutstanding,
        dispatchCount: dispatches.length,
        recentOrders: orders.slice(0, 5),
        recentDispatches: dispatches.slice(0, 5),
      }
    },
  })

  if (overviewQuery.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton className="h-28" key={i} />
        ))}
      </div>
    )
  }

  const stats = overviewQuery.data ?? {
    outlets: 0,
    users: 0,
    pendingOrders: 0,
    approvedOrders: 0,
    partialDispatchOrders: 0,
    fullDispatchOrders: 0,
    totalOutstanding: 0,
    dispatchCount: 0,
    recentOrders: [] as OrderItem[],
    recentDispatches: [] as DispatchItem[],
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Outlets</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-3xl font-semibold">{stats.outlets}</p>
            <Building2 className="h-5 w-5 text-slate-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Users</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-3xl font-semibold">{stats.users}</p>
            <Users className="h-5 w-5 text-slate-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Pending Orders</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-3xl font-semibold">{stats.pendingOrders}</p>
            <ShoppingCart className="h-5 w-5 text-slate-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Dispatches</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-3xl font-semibold">{stats.dispatchCount}</p>
            <Truck className="h-5 w-5 text-slate-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Approved Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{stats.approvedOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Partially Dispatched</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{stats.partialDispatchOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Fully Dispatched</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{stats.fullDispatchOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Outstanding</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-2xl font-semibold">{formatCurrencyINR(stats.totalOutstanding)}</p>
            <ReceiptIndianRupee className="h-5 w-5 text-slate-500" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/dashboard/outlets')} variant="outline">
            <Building2 className="mr-2 h-4 w-4" />
            View outlets
          </Button>
          <Button onClick={() => navigate('/dashboard/users')} variant="outline">
            <Users className="mr-2 h-4 w-4" />
            Manage users
          </Button>
          <Button onClick={() => navigate('/dashboard/dispatch/orders')} variant="outline">
            <PackageCheck className="mr-2 h-4 w-4" />
            Review order queue
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.recentOrders.length === 0 ? (
              <p className="text-sm text-slate-500">No orders yet.</p>
            ) : (
              stats.recentOrders.map((row) => (
                <button
                  key={row.id}
                  className="w-full rounded-md border border-slate-200 p-2 text-left hover:bg-slate-50"
                  onClick={() => navigate(`/dashboard/sales/orders/${row.id}`)}
                >
                  <p className="text-sm font-medium text-slate-900">
                    Order {row.id.slice(0, 8)} · {row.status.replaceAll('_', ' ')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {row.outlet?.name ?? '-'} · {timeAgo(row.createdAt)}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Dispatches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.recentDispatches.length === 0 ? (
              <p className="text-sm text-slate-500">No dispatches yet.</p>
            ) : (
              stats.recentDispatches.map((row) => (
                <button
                  key={row.id}
                  className="w-full rounded-md border border-slate-200 p-2 text-left hover:bg-slate-50"
                  onClick={() => navigate(`/dashboard/sales/dispatches/${row.id}`)}
                >
                  <p className="text-sm font-medium text-slate-900">Dispatch {row.id.slice(0, 8)}</p>
                  <p className="text-xs text-slate-500">
                    {row.order?.outlet?.name ?? '-'} · {timeAgo(row.createdAt)}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
