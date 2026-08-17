import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Building2, CreditCard, Package, Receipt, Star, User } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { api } from '@/lib/api'
import { formatCurrencyINR } from '@/lib/format'
import { OverviewTab } from './outlet-detail/OverviewTab'
import { OrdersTab } from './outlet-detail/OrdersTab'
import { PointsTab } from './outlet-detail/PointsTab'
import { PaymentsTab } from './outlet-detail/PaymentsTab'
import { UsersTab } from './outlet-detail/UsersTab'
import { asNumber } from './outlet-detail/types'
import type { OutletRecord } from './outlet-detail/types'

type Tab = 'overview' | 'orders' | 'points' | 'payments' | 'users'

const tabs: Array<{ key: Tab; label: string; icon: typeof Building2 }> = [
  { key: 'overview', label: 'Overview', icon: Building2 },
  { key: 'orders', label: 'Orders', icon: Package },
  { key: 'points', label: 'Points', icon: Star },
  { key: 'payments', label: 'Payments', icon: Receipt },
  { key: 'users', label: 'Manage Users', icon: User },
]

export function OutletDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const outletQuery = useQuery({
    queryKey: ['outlet-detail', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await api.get<{ data: OutletRecord }>(`/outlets/${id}`)
      return r.data.data
    },
  })

  const outlet = outletQuery.data

  if (outletQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-md bg-slate-200" />
        <div className="h-32 animate-pulse rounded-xl bg-slate-200" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
        </div>
      </div>
    )
  }

  if (outletQuery.isError || !outlet) {
    return (
      <div className="space-y-4">
        <Link to="/dashboard/outlets" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Back to Outlets
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-600">Unable to load outlet details.</p>
            <Button className="mt-4" onClick={() => outletQuery.refetch()}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const outstanding = asNumber(outlet.outstandingBalance)
  const creditLimit = asNumber(outlet.creditLimit)
  const available = creditLimit - outstanding

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link to="/dashboard/outlets" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Back to Outlets
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{outlet.name}</h1>
              <Badge className={outlet.isActive ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-slate-300 bg-slate-200 text-slate-700'}>
                {outlet.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">{outlet.outletCode} · {outlet.phone}</p>
          </div>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-slate-400" />
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Outstanding Balance</p>
          </div>
          <p className="mt-2 text-xl font-bold text-amber-600">{formatCurrencyINR(outstanding)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-slate-400" />
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Credit Limit</p>
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900">{formatCurrencyINR(creditLimit)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-slate-400" />
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Available Credit</p>
          </div>
          <p className={`mt-2 text-xl font-bold ${available >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrencyINR(Math.max(0, available))}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab id={id!} outlet={outlet} />}
      {activeTab === 'orders' && <OrdersTab id={id!} />}
      {activeTab === 'points' && <PointsTab id={id!} outlet={outlet} />}
      {activeTab === 'payments' && <PaymentsTab id={id!} />}
      {activeTab === 'users' && <UsersTab id={id!} />}
    </div>
  )
}
