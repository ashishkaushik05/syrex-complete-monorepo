import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'
import { usePermission } from '@/context/PermissionContext'

type OrgBillingProfile = {
  id: string
  companyName: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  pincode: string
  country: string
  gstin: string
  pan: string
  sacCode: string
  logoUrl: string | null
}

type BillingProfile = {
  id: string
  legalName: string
  gstin: string
  pan: string
  state: string
  stateCode: string
  profileType: 'company' | 'warehouse' | 'outlet'
  canIssueGrnInvoice: boolean
  isActive: boolean
}

type ProfileFormState = {
  companyName: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  pincode: string
  country: string
  gstin: string
  pan: string
  sacCode: string
  logoUrl: string
}

const DEFAULT_PROFILE_FORM: ProfileFormState = {
  companyName: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  gstin: '',
  pan: '',
  sacCode: '',
  logoUrl: '',
}

type TaxCharge = {
  id: string
  name: string
  type: 'percentage' | 'fixed'
  rate: string
  isActive: boolean
  displayOrder: number
  createdAt: string
  updatedAt: string
}

type ChargeFormState = {
  name: string
  type: 'percentage' | 'fixed'
  rate: string
  isActive: boolean
  displayOrder: number
}

const DEFAULT_FORM: ChargeFormState = {
  name: '',
  type: 'percentage',
  rate: '',
  isActive: true,
  displayOrder: 0,
}

export function BillingSettingsPage() {
  const { can } = usePermission()
  const qc = useQueryClient()
  const [newProfile, setNewProfile] = useState({
    legalName: '', gstin: '', pan: '', addressLine1: '', addressLine2: '', city: '',
    state: '', stateCode: '', pincode: '', country: 'India',
    profileType: 'company' as BillingProfile['profileType'], canIssueGrnInvoice: true,
  })
  const [newProfileError, setNewProfileError] = useState<string | null>(null)

  const profilesQuery = useQuery({
    queryKey: ['billing-profiles'],
    queryFn: async () => (await api.get<{ data: BillingProfile[] }>('/settings/billing/profiles')).data.data,
  })
  const createProfileMutation = useMutation({
    mutationFn: () => api.post('/settings/billing/profiles', {
      ...newProfile,
      addressLine2: newProfile.addressLine2.trim() || null,
      canIssueGrnInvoice: newProfile.profileType === 'company' && newProfile.canIssueGrnInvoice,
      isActive: true,
    }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['billing-profiles'] })
      setNewProfile((current) => ({ ...current, legalName: '', gstin: '', pan: '', addressLine1: '', addressLine2: '', city: '', state: '', stateCode: '', pincode: '' }))
      setNewProfileError(null)
    },
    onError: (error) => setNewProfileError(apiErrorMessage(error, 'Unable to create billing profile.')),
  })
  const toggleProfileMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/settings/billing/profiles/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-profiles'] }),
  })

  // --- Org billing profile state ---
  const [profileForm, setProfileForm] = useState<ProfileFormState>(DEFAULT_PROFILE_FORM)
  const [profileMessage, setProfileMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const profileQuery = useQuery({
    queryKey: ['org-billing-profile'],
    queryFn: async () => {
      const resp = await api.get<{ data: { data: OrgBillingProfile } }>('/settings/billing/profile')
      return (resp as any).data?.data as OrgBillingProfile
    },
  })

  useEffect(() => {
    const p = profileQuery.data
    if (!p) return
    setProfileForm({
      companyName: p.companyName ?? '',
      addressLine1: p.addressLine1 ?? '',
      addressLine2: p.addressLine2 ?? '',
      city: p.city ?? '',
      state: p.state ?? '',
      pincode: p.pincode ?? '',
      country: p.country ?? 'India',
      gstin: p.gstin ?? '',
      pan: p.pan ?? '',
      sacCode: p.sacCode ?? '',
      logoUrl: p.logoUrl ?? '',
    })
  }, [profileQuery.data])

  const saveProfileMutation = useMutation({
    mutationFn: (payload: ProfileFormState) =>
      api.post('/settings/billing/profile', {
        ...payload,
        logoUrl: payload.logoUrl.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-billing-profile'] })
      setProfileMessage({ text: 'Company details saved.', type: 'success' })
    },
    onError: (err) => setProfileMessage({ text: apiErrorMessage(err, 'Failed to save'), type: 'error' }),
  })

  function saveProfile() {
    setProfileMessage(null)
    if (!profileForm.companyName.trim()) {
      setProfileMessage({ text: 'Company name is required.', type: 'error' })
      return
    }
    saveProfileMutation.mutate(profileForm)
  }

  // --- Tax charges state ---
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ChargeFormState>(DEFAULT_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  const chargesQuery = useQuery({
    queryKey: ['billing-charges'],
    queryFn: async () => {
      const resp = await api.get<{ data: { data: TaxCharge[] } }>('/settings/billing/charges')
      const raw = (resp as any).data?.data
      return Array.isArray(raw) ? (raw as TaxCharge[]) : []
    },
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['billing-charges'] })

  const createMutation = useMutation({
    mutationFn: (payload: Omit<ChargeFormState, 'displayOrder'> & { displayOrder: number }) =>
      api.post('/settings/billing/charges', payload),
    onSuccess: () => { invalidate(); setDialogOpen(false) },
    onError: (err) => setFormError(apiErrorMessage(err, 'Failed to create charge')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ChargeFormState> }) =>
      api.patch(`/settings/billing/charges/${id}`, payload),
    onSuccess: () => { invalidate(); setDialogOpen(false) },
    onError: (err) => setFormError(apiErrorMessage(err, 'Failed to update charge')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/billing/charges/${id}`),
    onSuccess: () => invalidate(),
  })

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => api.post('/settings/billing/charges/reorder', { orderedIds }),
    onSuccess: () => invalidate(),
  })

  const charges = chargesQuery.data ?? []

  function openCreate() {
    const nextOrder = charges.length
    setEditingId(null)
    setForm({ ...DEFAULT_FORM, displayOrder: nextOrder })
    setFormError(null)
    setDialogOpen(true)
  }

  function openEdit(charge: TaxCharge) {
    setEditingId(charge.id)
    setForm({
      name: charge.name,
      type: charge.type,
      rate: charge.rate,
      isActive: charge.isActive,
      displayOrder: charge.displayOrder,
    })
    setFormError(null)
    setDialogOpen(true)
  }

  function submitForm() {
    setFormError(null)
    if (!form.name.trim()) { setFormError('Name is required'); return }
    if (!form.rate || Number(form.rate) <= 0) { setFormError('Rate must be greater than 0'); return }
    if (form.type === 'percentage' && Number(form.rate) > 100) { setFormError('Percentage rate cannot exceed 100'); return }

    if (editingId) {
      updateMutation.mutate({ id: editingId, payload: form })
    } else {
      createMutation.mutate(form)
    }
  }

  function moveRow(index: number, direction: 'up' | 'down') {
    const items = [...charges]
    const swapWith = direction === 'up' ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= items.length) return
    ;[items[index], items[swapWith]] = [items[swapWith], items[index]]
    reorderMutation.mutate(items.map((c) => c.id))
  }

  function toggleActive(charge: TaxCharge) {
    updateMutation.mutate({ id: charge.id, payload: { isActive: !charge.isActive } })
  }

  const canManage = can('billing:manage')

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader><CardTitle>Reusable Billing Profiles</CardTitle><p className="text-sm text-slate-500">Company profiles issue GRN invoices; warehouse and outlet profiles are assigned to their records.</p></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Input placeholder="Legal name" value={newProfile.legalName} onChange={(e) => setNewProfile((p) => ({ ...p, legalName: e.target.value }))} />
            <Input placeholder="GSTIN" value={newProfile.gstin} onChange={(e) => setNewProfile((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))} />
            <Input placeholder="PAN" value={newProfile.pan} onChange={(e) => setNewProfile((p) => ({ ...p, pan: e.target.value.toUpperCase() }))} />
            <select className="h-10 rounded-md border px-3 text-sm" value={newProfile.profileType} onChange={(e) => setNewProfile((p) => ({ ...p, profileType: e.target.value as BillingProfile['profileType'] }))}><option value="company">Company</option><option value="warehouse">Warehouse</option><option value="outlet">Outlet</option></select>
            <Input placeholder="Address line 1" value={newProfile.addressLine1} onChange={(e) => setNewProfile((p) => ({ ...p, addressLine1: e.target.value }))} />
            <Input placeholder="City" value={newProfile.city} onChange={(e) => setNewProfile((p) => ({ ...p, city: e.target.value }))} />
            <Input placeholder="State" value={newProfile.state} onChange={(e) => setNewProfile((p) => ({ ...p, state: e.target.value }))} />
            <Input placeholder="State code (2 digits)" value={newProfile.stateCode} onChange={(e) => setNewProfile((p) => ({ ...p, stateCode: e.target.value }))} />
            <Input placeholder="Pincode" value={newProfile.pincode} onChange={(e) => setNewProfile((p) => ({ ...p, pincode: e.target.value }))} />
            {newProfile.profileType === 'company' ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newProfile.canIssueGrnInvoice} onChange={(e) => setNewProfile((p) => ({ ...p, canIssueGrnInvoice: e.target.checked }))} />Eligible GRN issuer</label> : null}
          </div>
          {newProfileError ? <p className="text-sm text-red-600">{newProfileError}</p> : null}
          <Button onClick={() => createProfileMutation.mutate()} disabled={!can('billing:manage') || createProfileMutation.isPending}>Add Billing Profile</Button>
          <Table><TableHeader><TableRow><TableHead>Legal Name</TableHead><TableHead>Type</TableHead><TableHead>GSTIN</TableHead><TableHead>State</TableHead><TableHead>Issuer</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{(profilesQuery.data ?? []).map((profile) => <TableRow key={profile.id}><TableCell>{profile.legalName}</TableCell><TableCell className="capitalize">{profile.profileType}</TableCell><TableCell>{profile.gstin}</TableCell><TableCell>{profile.state} ({profile.stateCode})</TableCell><TableCell>{profile.canIssueGrnInvoice ? 'Yes' : 'No'}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => toggleProfileMutation.mutate({ id: profile.id, isActive: !profile.isActive })}>{profile.isActive ? 'Deactivate' : 'Activate'}</Button></TableCell></TableRow>)}</TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Company / Seller Details */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Company / Seller Details</CardTitle>
          <p className="text-sm text-slate-500 mt-1">
            This information appears as the seller block on every generated invoice.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {profileQuery.isLoading ? <p className="text-sm text-slate-500">Loading...</p> : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="bp-companyName">Company Name</Label>
              <Input
                id="bp-companyName"
                placeholder="e.g. Syrex Distribution Pvt Ltd"
                value={profileForm.companyName}
                disabled={!canManage}
                onChange={(e) => setProfileForm((f) => ({ ...f, companyName: e.target.value }))}
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="bp-addr1">Address Line 1</Label>
              <Input
                id="bp-addr1"
                placeholder="Street / Building"
                value={profileForm.addressLine1}
                disabled={!canManage}
                onChange={(e) => setProfileForm((f) => ({ ...f, addressLine1: e.target.value }))}
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="bp-addr2">Address Line 2 <span className="text-slate-400">(optional)</span></Label>
              <Input
                id="bp-addr2"
                placeholder="Area / Landmark"
                value={profileForm.addressLine2}
                disabled={!canManage}
                onChange={(e) => setProfileForm((f) => ({ ...f, addressLine2: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bp-city">City</Label>
              <Input
                id="bp-city"
                value={profileForm.city}
                disabled={!canManage}
                onChange={(e) => setProfileForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bp-state">State</Label>
              <Input
                id="bp-state"
                value={profileForm.state}
                disabled={!canManage}
                onChange={(e) => setProfileForm((f) => ({ ...f, state: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bp-pincode">Pincode</Label>
              <Input
                id="bp-pincode"
                value={profileForm.pincode}
                disabled={!canManage}
                onChange={(e) => setProfileForm((f) => ({ ...f, pincode: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bp-country">Country</Label>
              <Input
                id="bp-country"
                value={profileForm.country}
                disabled={!canManage}
                onChange={(e) => setProfileForm((f) => ({ ...f, country: e.target.value }))}
              />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bp-gstin">GSTIN</Label>
              <Input
                id="bp-gstin"
                placeholder="27AAKCM0202D1Z2"
                value={profileForm.gstin}
                disabled={!canManage}
                onChange={(e) => setProfileForm((f) => ({ ...f, gstin: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bp-pan">PAN</Label>
              <Input
                id="bp-pan"
                placeholder="AAKCM0202D"
                value={profileForm.pan}
                disabled={!canManage}
                onChange={(e) => setProfileForm((f) => ({ ...f, pan: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bp-sac">SAC Code</Label>
              <Input
                id="bp-sac"
                placeholder="998315"
                value={profileForm.sacCode}
                disabled={!canManage}
                onChange={(e) => setProfileForm((f) => ({ ...f, sacCode: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bp-logo">Logo URL <span className="text-slate-400">(optional)</span></Label>
            <Input
              id="bp-logo"
              placeholder="https://…/logo.png"
              value={profileForm.logoUrl}
              disabled={!canManage}
              onChange={(e) => setProfileForm((f) => ({ ...f, logoUrl: e.target.value }))}
            />
          </div>

          {profileMessage ? (
            <p className={`text-sm ${profileMessage.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
              {profileMessage.text}
            </p>
          ) : null}

          {canManage ? (
            <div className="flex justify-end">
              <Button onClick={saveProfile} disabled={saveProfileMutation.isPending}>
                {saveProfileMutation.isPending ? 'Saving…' : 'Save Company Details'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>GST &amp; Charges Configuration</CardTitle>
            {canManage ? (
              <Button size="sm" onClick={openCreate}>Add Charge</Button>
            ) : null}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            These charges are automatically applied to every invoice when an order is approved. Changes apply to future invoices only.
          </p>
        </CardHeader>
        <CardContent>
          {chargesQuery.isLoading ? <p className="text-sm text-slate-500">Loading...</p> : null}
          {chargesQuery.isError ? <p className="text-sm text-red-600">{apiErrorMessage(chargesQuery.error, 'Failed to load charges')}</p> : null}

          {charges.length === 0 && !chargesQuery.isLoading ? (
            <p className="text-sm text-slate-400 py-4 text-center">No charges configured. Add CGST, SGST, or other charges to get started.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {charges.map((charge, index) => (
                    <TableRow key={charge.id}>
                      <TableCell className="font-medium">{charge.name}</TableCell>
                      <TableCell className="capitalize">{charge.type}</TableCell>
                      <TableCell>
                        {charge.type === 'percentage' ? `${charge.rate}%` : `₹${charge.rate}`}
                      </TableCell>
                      <TableCell>
                        <Badge className={charge.isActive
                          ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                          : 'border-slate-300 bg-slate-100 text-slate-600'}>
                          {charge.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      {canManage ? (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveRow(index, 'up')} disabled={index === 0}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveRow(index, 'down')} disabled={index === charges.length - 1}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(charge)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-slate-500"
                              onClick={() => toggleActive(charge)}
                            >
                              {charge.isActive ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-500 hover:text-red-700"
                              onClick={() => { if (confirm(`Delete "${charge.name}"?`)) deleteMutation.mutate(charge.id) }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Charge' : 'Add Charge'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="charge-name">Name</Label>
              <Input
                id="charge-name"
                placeholder="e.g. CGST 9%"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="charge-type"
                    value="percentage"
                    checked={form.type === 'percentage'}
                    onChange={() => setForm((f) => ({ ...f, type: 'percentage' }))}
                  />
                  <span className="text-sm">Percentage of Subtotal</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="charge-type"
                    value="fixed"
                    checked={form.type === 'fixed'}
                    onChange={() => setForm((f) => ({ ...f, type: 'fixed' }))}
                  />
                  <span className="text-sm">Fixed Amount (₹)</span>
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="charge-rate">
                {form.type === 'percentage' ? 'Rate (%)' : 'Amount (₹)'}
              </Label>
              <Input
                id="charge-rate"
                type="number"
                step="0.01"
                min="0"
                placeholder={form.type === 'percentage' ? '9.00' : '50.00'}
                value={form.rate}
                onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="charge-order">Display Order</Label>
              <Input
                id="charge-order"
                type="number"
                min="0"
                value={form.displayOrder}
                onChange={(e) => setForm((f) => ({ ...f, displayOrder: Number(e.target.value) }))}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              <span className="text-sm">Active</span>
            </label>

            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={submitForm}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
