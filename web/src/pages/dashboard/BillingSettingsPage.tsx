import { useState } from 'react'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'
import { usePermission } from '@/context/PermissionContext'

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
