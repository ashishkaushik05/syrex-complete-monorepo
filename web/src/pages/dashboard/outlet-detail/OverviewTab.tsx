import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { api } from '@/lib/api'
import { formatCurrencyINR } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'
import type { OutletRecord, PointsSummary, WarehouseOption } from './types'
import { asNumber } from './types'

interface Props {
  id: string
  outlet: OutletRecord
}

export function OverviewTab({ id, outlet }: Props) {
  const queryClient = useQueryClient()

  const [toggleStatusConfirmOpen, setToggleStatusConfirmOpen] = useState(false)
  const [editName, setEditName] = useState(outlet.name)
  const [editOwnerName, setEditOwnerName] = useState(outlet.ownerName)
  const [editPhone, setEditPhone] = useState(outlet.phone)
  const [editAddress, setEditAddress] = useState(outlet.address)
  const [editTransitDays, setEditTransitDays] = useState(String(outlet.transitDaysToOutlet ?? 3))
  const [editWarehouseId, setEditWarehouseId] = useState(outlet.warehouseId ?? '')
  const [profileMessage, setProfileMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const [creditLimitDraft, setCreditLimitDraft] = useState(String(asNumber(outlet.creditLimit)))
  const [creditMessage, setCreditMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const [editLegalName, setEditLegalName] = useState(outlet.legalName ?? '')
  const [editGstin, setEditGstin] = useState(outlet.gstin ?? '')
  const [editBillingAddr1, setEditBillingAddr1] = useState(outlet.billingAddress1 ?? '')
  const [editBillingAddr2, setEditBillingAddr2] = useState(outlet.billingAddress2 ?? '')
  const [editBillingCity, setEditBillingCity] = useState(outlet.billingCity ?? '')
  const [editBillingState, setEditBillingState] = useState(outlet.billingState ?? '')
  const [editBillingPincode, setEditBillingPincode] = useState(outlet.billingPincode ?? '')
  const [editBillingCountry, setEditBillingCountry] = useState(outlet.billingCountry ?? 'India')
  const [editBillingProfileId, setEditBillingProfileId] = useState(outlet.billingProfileId ?? '')
  const [billingMessage, setBillingMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
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
    setEditBillingProfileId(outlet.billingProfileId ?? '')
  }, [outlet])

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'assignment-options'],
    queryFn: async () => {
      const r = await api.get<{ data: WarehouseOption[] }>('/warehouses')
      return r.data.data.filter((w) => w.isActive)
    },
  })
  const outletProfilesQuery = useQuery({
    queryKey: ['billing-profiles', 'outlet'],
    queryFn: async () => (await api.get<any>('/settings/billing/profiles', {
      params: { profileType: 'outlet', isActive: true },
    })).data.data as Array<{ id: string; legalName: string; gstin: string }>,
  })

  const pointsQuery = useQuery({
    queryKey: ['outlet-points', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await api.get<{ data: PointsSummary }>(`/outlets/${id}/points`)
      return r.data.data
    },
  })

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['outlets-admin-list'] }),
      queryClient.invalidateQueries({ queryKey: ['outlet-detail', id] }),
      queryClient.invalidateQueries({ queryKey: ['outlet-points', id] }),
    ])

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
    }) => { await api.patch(`/outlets/${id}`, payload) },
    onSuccess: invalidate,
  })

  const updateBillingMutation = useMutation({
    mutationFn: async (payload: Record<string, string | null | undefined>) => {
      await api.patch(`/outlets/${id}/billing`, payload)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['outlet-detail', id] }),
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
        billingProfileId: editBillingProfileId || null,
      })
      setBillingMessage({ text: 'Billing details saved successfully.', type: 'success' })
    } catch (error) {
      setBillingMessage({ text: apiErrorMessage(error, 'Unable to save billing details.'), type: 'error' })
    }
  }

  const outstanding = asNumber(pointsQuery.data?.outstandingBalance ?? outlet.outstandingBalance)
  const creditLimit = asNumber(outlet.creditLimit)
  const available = creditLimit - outstanding

  return (
    <>
      <ConfirmDialog
        open={toggleStatusConfirmOpen}
        onOpenChange={setToggleStatusConfirmOpen}
        title={outlet.isActive ? 'Deactivate Outlet' : 'Activate Outlet'}
        description={
          outlet.isActive
            ? `This will deactivate "${outlet.name}". The outlet will no longer be able to place orders.`
            : `This will reactivate "${outlet.name}". The outlet will be able to place orders again.`
        }
        confirmLabel={outlet.isActive ? 'Deactivate' : 'Activate'}
        variant={outlet.isActive ? 'destructive' : 'default'}
        onConfirm={() => { setToggleStatusConfirmOpen(false); handleToggleStatus() }}
        loading={updateMutation.isPending}
      />

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
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Outlet name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-owner">Owner / Contact Name</Label>
              <Input id="edit-owner" value={editOwnerName} onChange={(e) => setEditOwnerName(e.target.value)} placeholder="Owner name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone Number</Label>
              <Input id="edit-phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone number" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-address">Address</Label>
              <Input id="edit-address" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Full address" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-transit">Transit Days to Outlet</Label>
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
                {(warehousesQuery.data ?? []).map((w) => (
                  <option key={w.id} value={w.id}>{w.name} ({w.location})</option>
                ))}
              </select>
            </div>
            {profileMessage ? (
              <div className={`rounded-md border px-3 py-2 text-sm ${profileMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                {profileMessage.text}
              </div>
            ) : null}
            <Button onClick={handleSaveProfile} disabled={updateMutation.isPending} className="w-full">
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
              <Label htmlFor="b-profile">Assigned Billing Profile</Label>
              <select id="b-profile" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={editBillingProfileId} onChange={(e) => setEditBillingProfileId(e.target.value)}>
                <option value="">Unassigned</option>
                {(outletProfilesQuery.data ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.legalName} · {profile.gstin}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-legalName">Legal Name <span className="text-slate-400">(if different from outlet name)</span></Label>
              <Input id="b-legalName" value={editLegalName} onChange={(e) => setEditLegalName(e.target.value)} placeholder="YBK INDUSTRIES PRIVATE LIMITED" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-gstin">GSTIN</Label>
              <Input id="b-gstin" value={editGstin} onChange={(e) => setEditGstin(e.target.value)} placeholder="06AABCY1869P1ZN" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-addr1">Billing Address Line 1</Label>
              <Input id="b-addr1" value={editBillingAddr1} onChange={(e) => setEditBillingAddr1(e.target.value)} placeholder="Street / House / Plot" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-addr2">Billing Address Line 2 <span className="text-slate-400">(optional)</span></Label>
              <Input id="b-addr2" value={editBillingAddr2} onChange={(e) => setEditBillingAddr2(e.target.value)} placeholder="Area / Landmark" />
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
            {billingMessage ? (
              <div className={`rounded-md border px-3 py-2 text-sm ${billingMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                {billingMessage.text}
              </div>
            ) : null}
            <Button onClick={handleSaveBilling} disabled={updateBillingMutation.isPending} className="w-full">
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
            {creditMessage ? (
              <div className={`rounded-md border px-3 py-2 text-sm ${creditMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                {creditMessage.text}
              </div>
            ) : null}
            <Button onClick={handleSaveCreditLimit} disabled={updateMutation.isPending} variant="outline" className="w-full">
              {updateMutation.isPending ? 'Updating...' : 'Update Credit Limit'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
