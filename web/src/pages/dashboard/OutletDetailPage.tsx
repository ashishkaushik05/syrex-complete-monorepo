import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Package,
  Receipt,
  Star,
  User,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { api } from '@/lib/api'
import { formatCurrencyINR, timeAgo } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type OutletRecord = {
  id: string
  outletCode: string
  warehouseId?: string | null
  name: string
  ownerName: string
  phone: string
  address: string
  creditLimit: number | string
  outstandingBalance: number | string
  pointsBalance: number
  isActive: boolean
  createdAt: string
  transitDaysToOutlet?: number
  // Billing / GST details
  legalName?: string | null
  gstin?: string | null
  billingAddress1?: string | null
  billingAddress2?: string | null
  billingCity?: string | null
  billingState?: string | null
  billingPincode?: string | null
  billingCountry?: string | null
}

type WarehouseOption = {
  id: string
  name: string
  location: string
  isActive: boolean
}

type OrderItem = {
  id: string
  status: string
  grandTotal: number | string
  createdAt: string
}

type OrdersResponse = { data: OrderItem[] }

type PointsSummary = {
  id: string
  outletCode: string
  name: string
  pointsBalance: number
  creditLimit: number | string
  outstandingBalance: number | string
}

type PointsHistoryItem = {
  id: string
  actionType: string
  points: number
  note: string | null
  createdAt: string
}

type PointsHistoryResponse = { data: PointsHistoryItem[] }

type OutletPaymentItem = {
  id: string
  amount: number
  paymentDate: string
  reference: string | null
  description: string | null
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

type OutletUserRole = 'owner'
type OutletUserItem = {
  id: string
  email: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  outletRole: OutletUserRole
}

type Tab = 'overview' | 'orders' | 'points' | 'payments' | 'users'

function asNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function orderStatusBadge(status: string) {
  if (status === 'approved' || status === 'fully_dispatched') return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  if (status === 'pending_approval' || status === 'partially_dispatched') return 'border-amber-300 bg-amber-100 text-amber-800'
  if (status === 'rejected' || status === 'cancelled') return 'border-red-300 bg-red-100 text-red-800'
  return 'border-slate-300 bg-slate-100 text-slate-700'
}

const tabs: Array<{ key: Tab; label: string; icon: typeof Building2 }> = [
  { key: 'overview', label: 'Overview', icon: Building2 },
  { key: 'orders', label: 'Orders', icon: Package },
  { key: 'points', label: 'Points', icon: Star },
  { key: 'payments', label: 'Payments', icon: Receipt },
  { key: 'users', label: 'Manage Users', icon: User },
]

export function OutletDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [toggleStatusConfirmOpen, setToggleStatusConfirmOpen] = useState(false)

  const [editName, setEditName] = useState('')
  const [editOwnerName, setEditOwnerName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editTransitDays, setEditTransitDays] = useState('3')
  const [editWarehouseId, setEditWarehouseId] = useState('')
  const [profileMessage, setProfileMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const [creditLimitDraft, setCreditLimitDraft] = useState('')
  const [creditMessage, setCreditMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const [editLegalName, setEditLegalName] = useState('')
  const [editGstin, setEditGstin] = useState('')
  const [editBillingAddr1, setEditBillingAddr1] = useState('')
  const [editBillingAddr2, setEditBillingAddr2] = useState('')
  const [editBillingCity, setEditBillingCity] = useState('')
  const [editBillingState, setEditBillingState] = useState('')
  const [editBillingPincode, setEditBillingPincode] = useState('')
  const [editBillingCountry, setEditBillingCountry] = useState('India')
  const [billingMessage, setBillingMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [userRole, setUserRole] = useState<OutletUserRole>('owner')
  const [userMessage, setUserMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [resetPasswordByUserId, setResetPasswordByUserId] = useState<Record<string, string>>({})

  const outletQuery = useQuery({
    queryKey: ['outlet-detail', id],
    enabled: !!id,
    queryFn: async () => {
      const response = await api.get<{ data: OutletRecord }>(`/outlets/${id}`)
      return response.data.data
    },
  })

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'assignment-options'],
    queryFn: async () => {
      const response = await api.get<{ data: WarehouseOption[] }>('/warehouses')
      return response.data.data.filter((warehouse) => warehouse.isActive)
    },
  })

  useEffect(() => {
    const outlet = outletQuery.data
    if (!outlet) return
    setEditName(outlet.name)
    setEditOwnerName(outlet.ownerName)
    setEditPhone(outlet.phone)
    setEditAddress(outlet.address)
    setCreditLimitDraft(String(asNumber(outlet.creditLimit)))
    setEditTransitDays(String(outlet.transitDaysToOutlet ?? 3))
    setEditWarehouseId(outlet.warehouseId ?? '')
    setEditLegalName(outlet.legalName ?? '')
    setEditGstin(outlet.gstin ?? '')
    setEditBillingAddr1(outlet.billingAddress1 ?? '')
    setEditBillingAddr2(outlet.billingAddress2 ?? '')
    setEditBillingCity(outlet.billingCity ?? '')
    setEditBillingState(outlet.billingState ?? '')
    setEditBillingPincode(outlet.billingPincode ?? '')
    setEditBillingCountry(outlet.billingCountry ?? 'India')
  }, [outletQuery.data])

  const pointsQuery = useQuery({
    queryKey: ['outlet-points', id],
    enabled: !!id,
    queryFn: async () => {
      const response = await api.get<{ data: PointsSummary }>(`/outlets/${id}/points`)
      return response.data.data
    },
  })

  const pointsHistoryQuery = useQuery({
    queryKey: ['outlet-points-history', id],
    enabled: activeTab === 'points' && !!id,
    queryFn: async () => {
      const response = await api.get<PointsHistoryResponse>(`/outlets/${id}/points/history`, {
        params: { page: 1, limit: 20 },
      })
      return response.data.data
    },
  })

  const paymentsQuery = useQuery({
    queryKey: ['outlet-payments', id],
    enabled: activeTab === 'payments' && !!id,
    queryFn: async () => {
      const response = await api.get<{ data: OutletPaymentItem[] }>(`/accounts/outlets/${id}/payments`, {
        params: { page: 1, limit: 20 },
      })
      return response.data.data
    },
  })

  const ordersQuery = useQuery({
    queryKey: ['outlet-orders', id],
    enabled: activeTab === 'orders' && !!id,
    queryFn: async () => {
      const response = await api.get<OrdersResponse>('/orders', {
        params: { outletId: id, page: 1, limit: 20 },
      })
      return response.data.data
    },
  })

  const outletUsersQuery = useQuery({
    queryKey: ['outlet-users', id],
    enabled: activeTab === 'users' && !!id,
    queryFn: async () => {
      const response = await api.get<{ data: OutletUserItem[] }>(`/outlets/${id}/users`)
      return response.data.data
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      warehouseId?: string | null
      name?: string
      ownerName?: string
      phone?: string
      address?: string
      creditLimit?: number
      transitDaysToOutlet?: number
      isActive?: boolean
    }) => {
      await api.patch(`/outlets/${id}`, payload)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['outlets-admin-list'] }),
        queryClient.invalidateQueries({ queryKey: ['outlet-detail', id] }),
        queryClient.invalidateQueries({ queryKey: ['outlet-points', id] }),
      ])
    },
  })

  const updateBillingMutation = useMutation({
    mutationFn: async (payload: Record<string, string | null | undefined>) => {
      await api.patch(`/outlets/${id}/billing`, payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['outlet-detail', id] })
    },
  })

  const createUserMutation = useMutation({
    mutationFn: async (payload: {
      name: string
      email: string
      password: string
      role: OutletUserRole
    }) => {
      await api.post(`/outlets/${id}/users`, payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['outlet-users', id] })
    },
  })

  const resetUserPasswordMutation = useMutation({
    mutationFn: async (payload: { userId: string; newPassword: string }) => {
      await api.patch(`/users/${payload.userId}/password`, { newPassword: payload.newPassword })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['outlet-users', id] })
    },
  })

  const toggleUserStatusMutation = useMutation({
    mutationFn: async (payload: { userId: string; isActive: boolean }) => {
      await api.patch(`/users/${payload.userId}`, { isActive: payload.isActive })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['outlet-users', id] })
    },
  })

  const handleSaveProfile = async () => {
    setProfileMessage(null)
    try {
      await updateMutation.mutateAsync({
        warehouseId: editWarehouseId || null,
        name: editName.trim(),
        ownerName: editOwnerName.trim(),
        phone: editPhone.trim(),
        address: editAddress.trim(),
        transitDaysToOutlet: Math.max(0, Number(editTransitDays) || 0),
      })
      setProfileMessage({ text: 'Profile updated successfully.', type: 'success' })
    } catch (error) {
      setProfileMessage({ text: apiErrorMessage(error, 'Unable to update profile.'), type: 'error' })
    }
  }

  const handleToggleStatus = async () => {
    const outlet = outletQuery.data
    if (!outlet) return
    setProfileMessage(null)
    try {
      await updateMutation.mutateAsync({ isActive: !outlet.isActive })
      setProfileMessage({
        text: `Outlet ${outlet.isActive ? 'deactivated' : 'activated'} successfully.`,
        type: 'success',
      })
    } catch (error) {
      setProfileMessage({ text: apiErrorMessage(error, 'Unable to update status.'), type: 'error' })
    }
  }

  const handleSaveCreditLimit = async () => {
    setCreditMessage(null)
    try {
      await updateMutation.mutateAsync({ creditLimit: Math.max(0, Number(creditLimitDraft) || 0) })
      setCreditMessage({ text: 'Credit limit updated.', type: 'success' })
    } catch (error) {
      setCreditMessage({ text: apiErrorMessage(error, 'Unable to update credit limit.'), type: 'error' })
    }
  }

  const handleSaveBilling = async () => {
    setBillingMessage(null)
    try {
      await updateBillingMutation.mutateAsync({
        legalName: editLegalName.trim() || null,
        gstin: editGstin.trim() || null,
        billingAddress1: editBillingAddr1.trim() || null,
        billingAddress2: editBillingAddr2.trim() || null,
        billingCity: editBillingCity.trim() || null,
        billingState: editBillingState.trim() || null,
        billingPincode: editBillingPincode.trim() || null,
        billingCountry: editBillingCountry.trim() || 'India',
      })
      setBillingMessage({ text: 'Billing details saved successfully.', type: 'success' })
    } catch (error) {
      setBillingMessage({ text: apiErrorMessage(error, 'Unable to save billing details.'), type: 'error' })
    }
  }

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setUserMessage(null)
    try {
      await createUserMutation.mutateAsync({
        name: userName.trim(),
        email: userEmail.trim(),
        password: userPassword,
        role: userRole,
      })
      setUserName('')
      setUserEmail('')
      setUserPassword('')
      setUserRole('owner')
      setUserMessage({ text: 'User created successfully.', type: 'success' })
    } catch (error) {
      setUserMessage({ text: apiErrorMessage(error, 'Unable to create user.'), type: 'error' })
    }
  }

  const handleResetUserPassword = async (user: OutletUserItem) => {
    const nextPassword = (resetPasswordByUserId[user.id] ?? '').trim()
    if (nextPassword.length < 6) {
      setUserMessage({ text: `Password for ${user.name} must be at least 6 characters.`, type: 'error' })
      return
    }

    setUserMessage(null)
    try {
      await resetUserPasswordMutation.mutateAsync({
        userId: user.id,
        newPassword: nextPassword,
      })
      setResetPasswordByUserId((prev) => ({ ...prev, [user.id]: '' }))
      setUserMessage({ text: `Password reset for ${user.name}.`, type: 'success' })
    } catch (error) {
      setUserMessage({ text: apiErrorMessage(error, `Unable to reset password for ${user.name}.`), type: 'error' })
    }
  }

  const handleToggleUserStatus = async (user: OutletUserItem) => {
    setUserMessage(null)
    try {
      await toggleUserStatusMutation.mutateAsync({
        userId: user.id,
        isActive: !user.isActive,
      })
      setUserMessage({
        text: `${user.name} has been ${user.isActive ? 'revoked (deactivated)' : 'reactivated'}.`,
        type: 'success',
      })
    } catch (error) {
      setUserMessage({
        text: apiErrorMessage(error, `Unable to ${user.isActive ? 'revoke' : 'reactivate'} ${user.name}.`),
        type: 'error',
      })
    }
  }

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
        <Link
          to="/dashboard/outlets"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Outlets
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-600">Unable to load outlet details.</p>
            <Button className="mt-4" onClick={() => outletQuery.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const outstanding = asNumber(pointsQuery.data?.outstandingBalance ?? outlet.outstandingBalance)
  const creditLimit = asNumber(outlet.creditLimit)
  const available = creditLimit - outstanding

  const outletIsActive = outlet.isActive

  return (
    <div className="space-y-5">
      <ConfirmDialog
        open={toggleStatusConfirmOpen}
        onOpenChange={setToggleStatusConfirmOpen}
        title={outletIsActive ? 'Deactivate Outlet' : 'Activate Outlet'}
        description={
          outletIsActive
            ? `This will deactivate "${outlet.name}". The outlet will no longer be able to place orders.`
            : `This will reactivate "${outlet.name}". The outlet will be able to place orders again.`
        }
        confirmLabel={outletIsActive ? 'Deactivate' : 'Activate'}
        variant={outletIsActive ? 'destructive' : 'default'}
        onConfirm={() => { setToggleStatusConfirmOpen(false); handleToggleStatus() }}
        loading={updateMutation.isPending}
      />

      {/* Header */}
      <div>
        <Link
          to="/dashboard/outlets"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
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
            <p className="mt-1 text-sm text-slate-500">
              {outlet.outletCode} · {outlet.phone}
            </p>
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

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Profile Form */}
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Outlet Profile</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setToggleStatusConfirmOpen(true)}
                  disabled={updateMutation.isPending}
                >
                  {outlet.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Outlet Name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Outlet name"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-owner">Owner / Contact Name</Label>
                <Input
                  id="edit-owner"
                  value={editOwnerName}
                  onChange={(e) => setEditOwnerName(e.target.value)}
                  placeholder="Owner name"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">Phone Number</Label>
                <Input
                  id="edit-phone"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="Phone number"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-address">Address</Label>
                <Input
                  id="edit-address"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Full address"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-transit">
                  Transit Days to Outlet
                </Label>
                <p className="text-xs text-slate-400">Used to compute estimated delivery date in dispatch planning.</p>
                <Input
                  id="edit-transit"
                  value={editTransitDays}
                  onChange={(e) => setEditTransitDays(e.target.value)}
                  placeholder="e.g. 3"
                  type="number"
                  min={0}
                  max={30}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-warehouse">Assigned Warehouse</Label>
                <p className="text-xs text-slate-400">Only this warehouse queue will include this outlet's approved orders.</p>
                <select
                  id="edit-warehouse"
                  value={editWarehouseId}
                  onChange={(e) => setEditWarehouseId(e.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="">Unassigned</option>
                  {(warehousesQuery.data ?? []).map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} ({warehouse.location})
                    </option>
                  ))}
                </select>
              </div>

              {profileMessage && (
                <div
                  className={`rounded-md border px-3 py-2 text-sm ${
                    profileMessage.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {profileMessage.text}
                </div>
              )}

              <Button
                onClick={handleSaveProfile}
                disabled={updateMutation.isPending}
                className="w-full"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Profile'}
              </Button>
            </CardContent>
          </Card>

          {/* Billing & GST Details */}
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Billing &amp; GST Details</CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">Saved here and printed on invoices for this outlet.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="b-legalName">Legal Name <span className="text-slate-400">(if different from outlet name)</span></Label>
                <Input
                  id="b-legalName"
                  value={editLegalName}
                  onChange={(e) => setEditLegalName(e.target.value)}
                  placeholder="YBK INDUSTRIES PRIVATE LIMITED"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-gstin">GSTIN</Label>
                <Input
                  id="b-gstin"
                  value={editGstin}
                  onChange={(e) => setEditGstin(e.target.value)}
                  placeholder="06AABCY1869P1ZN"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-addr1">Billing Address Line 1</Label>
                <Input
                  id="b-addr1"
                  value={editBillingAddr1}
                  onChange={(e) => setEditBillingAddr1(e.target.value)}
                  placeholder="Street / House / Plot"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-addr2">Billing Address Line 2 <span className="text-slate-400">(optional)</span></Label>
                <Input
                  id="b-addr2"
                  value={editBillingAddr2}
                  onChange={(e) => setEditBillingAddr2(e.target.value)}
                  placeholder="Area / Landmark"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="b-city">City</Label>
                  <Input id="b-city" value={editBillingCity} onChange={(e) => setEditBillingCity(e.target.value)} placeholder="City" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="b-state">State</Label>
                  <Input id="b-state" value={editBillingState} onChange={(e) => setEditBillingState(e.target.value)} placeholder="State" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="b-pin">Pincode</Label>
                  <Input id="b-pin" value={editBillingPincode} onChange={(e) => setEditBillingPincode(e.target.value)} placeholder="125001" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="b-country">Country</Label>
                  <Input id="b-country" value={editBillingCountry} onChange={(e) => setEditBillingCountry(e.target.value)} placeholder="India" />
                </div>
              </div>

              {billingMessage && (
                <div className={`rounded-md border px-3 py-2 text-sm ${billingMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                  {billingMessage.text}
                </div>
              )}

              <Button
                onClick={handleSaveBilling}
                disabled={updateBillingMutation.isPending}
                className="w-full"
              >
                {updateBillingMutation.isPending ? 'Saving...' : 'Save Billing Details'}
              </Button>
            </CardContent>
          </Card>

          {/* Credit Management */}
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Credit Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">Outstanding</p>
                  <p className="mt-1 text-sm font-bold text-amber-600">{formatCurrencyINR(outstanding)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">Current Limit</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{formatCurrencyINR(creditLimit)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">Available</p>
                  <p className={`mt-1 text-sm font-bold ${available >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatCurrencyINR(Math.max(0, available))}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">Points Balance</p>
                  <p className="mt-1 text-sm font-bold text-blue-600">
                    {pointsQuery.data?.pointsBalance ?? outlet.pointsBalance}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="credit-limit">Update Credit Limit (₹)</Label>
                <p className="text-xs text-slate-400">Setting a new limit takes effect immediately.</p>
                <Input
                  id="credit-limit"
                  value={creditLimitDraft}
                  onChange={(e) => setCreditLimitDraft(e.target.value)}
                  placeholder="Enter credit limit"
                  type="number"
                  min={0}
                />
              </div>

              {creditMessage && (
                <div
                  className={`rounded-md border px-3 py-2 text-sm ${
                    creditMessage.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {creditMessage.text}
                </div>
              )}

              <Button
                onClick={handleSaveCreditLimit}
                disabled={updateMutation.isPending}
                variant="outline"
                className="w-full"
              >
                {updateMutation.isPending ? 'Updating...' : 'Update Credit Limit'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ORDERS TAB */}
      {activeTab === 'orders' && (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Orders</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/dashboard/sales/orders?outletId=${id}`)}
              >
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
                      <p className="text-sm font-semibold text-slate-900">
                        Order #{order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-xs text-slate-500">{timeAgo(order.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-medium text-slate-700">
                        {formatCurrencyINR(asNumber(order.grandTotal))}
                      </p>
                      <Badge className={orderStatusBadge(order.status)}>
                        {order.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* POINTS TAB */}
      {activeTab === 'points' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-800">Current Points Balance</p>
            <p className="mt-1 text-3xl font-bold text-blue-900">
              {pointsQuery.data?.pointsBalance ?? outlet.pointsBalance}
            </p>
          </div>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Points History</CardTitle>
            </CardHeader>
            <CardContent>
              {pointsHistoryQuery.isLoading ? (
                <p className="py-4 text-center text-sm text-slate-500">Loading history...</p>
              ) : (pointsHistoryQuery.data ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center">
                  <Star className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm text-slate-500">No points history yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(pointsHistoryQuery.data ?? []).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
                    >
                      <div>
                        <p className="text-sm font-medium capitalize text-slate-900">
                          {entry.actionType.replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-slate-400">
                          {entry.note ?? 'No note'} · {timeAgo(entry.createdAt)}
                        </p>
                      </div>
                      <p
                        className={`text-sm font-bold ${entry.points > 0 ? 'text-emerald-600' : 'text-red-600'}`}
                      >
                        {entry.points > 0 ? `+${entry.points}` : entry.points}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* PAYMENTS TAB */}
      {activeTab === 'payments' && (
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
      )}

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Current Outlet Users</CardTitle>
              <p className="text-sm text-slate-500">
                View all users registered under this outlet, reset passwords, and revoke/reactivate access.
              </p>
            </CardHeader>
            <CardContent>
              {outletUsersQuery.isLoading ? (
                <p className="py-4 text-center text-sm text-slate-500">Loading outlet users...</p>
              ) : outletUsersQuery.isError ? (
                <p className="py-4 text-center text-sm text-slate-500">Unable to load outlet users.</p>
              ) : (outletUsersQuery.data ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center">
                  <User className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm text-slate-500">No users registered for this outlet yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(outletUsersQuery.data ?? []).map((user) => (
                    <div key={user.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            Role: {user.outletRole} · Created {timeAgo(user.createdAt)}
                          </p>
                        </div>
                        <Badge className={user.isActive ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-slate-300 bg-slate-200 text-slate-700'}>
                          {user.isActive ? 'Active' : 'Revoked'}
                        </Badge>
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                        <Input
                          value={resetPasswordByUserId[user.id] ?? ''}
                          onChange={(e) =>
                            setResetPasswordByUserId((prev) => ({
                              ...prev,
                              [user.id]: e.target.value,
                            }))
                          }
                          placeholder="Set new password (min 6 chars)"
                          type="password"
                          minLength={6}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleResetUserPassword(user)}
                          disabled={resetUserPasswordMutation.isPending}
                        >
                          {resetUserPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
                        </Button>
                        <Button
                          type="button"
                          variant={user.isActive ? 'destructive' : 'default'}
                          onClick={() => handleToggleUserStatus(user)}
                          disabled={toggleUserStatusMutation.isPending}
                        >
                          {toggleUserStatusMutation.isPending
                            ? 'Updating...'
                            : user.isActive
                              ? 'Revoke User'
                              : 'Reactivate User'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Create Outlet User</CardTitle>
              <p className="text-sm text-slate-500">
                Create a login account for the outlet owner.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateUser} className="max-w-md space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="user-name">Full Name</Label>
                  <Input
                    id="user-name"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-email">Email Address</Label>
                  <Input
                    id="user-email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="user@example.com"
                    required
                    type="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-password">Temporary Password</Label>
                  <p className="text-xs text-slate-400">Minimum 6 characters. User should change this after first login.</p>
                  <Input
                    id="user-password"
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    placeholder="Set a temporary password"
                    required
                    minLength={6}
                    type="password"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <p className="text-sm text-slate-600 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
                    Owner — full access
                  </p>
                </div>

                {userMessage && (
                  <div
                    className={`rounded-md border px-3 py-2 text-sm ${
                      userMessage.type === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                    }`}
                  >
                    {userMessage.text}
                  </div>
                )}

                <Button type="submit" disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? 'Creating...' : 'Create User Account'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
