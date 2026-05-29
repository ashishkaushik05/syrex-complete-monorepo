import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ServiceStatusBadge, STATUS_CONFIG } from '@/components/service/ServiceStatusBadge'
import type { ComplaintStatus } from '@/components/service/ServiceStatusBadge'
import { usePermission } from '@/context/PermissionContext'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type ComplaintRow = {
  id: string
  complaintNumber: string
  status: ComplaintStatus
  title: string | null
  outletName: string | null
  serials: string[]
  createdAt: string
  updatedAt: string
}

type TicketListPayload = {
  data: ComplaintRow[]
  tabCounts?: Record<string, number> | null
}

type OutletOption = { id: string; name: string; outletCode: string | null }
type SkuOption = {
  id: string
  name: string
  displayName?: string | null
  skuCode?: string | null
  sku?: string | null
  isActive?: boolean
}
type SerialLine = { productId: string; serialNumber: string; notes: string }

const STATUS_TABS: Array<{ key: 'all' | ComplaintStatus; label: string }> = [
  { key: 'all',                  label: 'All'              },
  { key: 'raised',               label: 'Raised'           },
  { key: 'assigned',             label: 'Assigned'         },
  { key: 'visit',                label: 'Site Visit'       },
  { key: 'test_result_submitted',label: 'Test Submitted'   },
  { key: 'retest_requested',     label: 'Retest'           },
  { key: 'resolved',             label: 'Resolved'         },
  { key: 'telephonic_closure',   label: 'Telephonic'       },
  { key: 'cancelled',            label: 'Cancelled'        },
]

const ACTIVE_STATUSES: ComplaintStatus[] = ['raised', 'assigned', 'visit', 'test_result_submitted', 'retest_requested']

function normalizeRows(payload: unknown) {
  const data = payload as TicketListPayload | undefined
  const rows = Array.isArray(data?.data) ? data.data : []
  const counts = (data as any)?.tabCounts ?? {}
  return {
    rows,
    tabCounts: {
      all: Number(counts.all ?? rows.length),
      raised: Number(counts.raised ?? 0),
      assigned: Number(counts.assigned ?? 0),
      visit: Number(counts.visit ?? 0),
      test_result_submitted: Number(counts.test_result_submitted ?? 0),
      retest_requested: Number(counts.retest_requested ?? 0),
      resolved: Number(counts.resolved ?? 0),
      telephonic_closure: Number(counts.telephonic_closure ?? 0),
      cancelled: Number(counts.cancelled ?? 0),
    } as Record<string, number>,
  }
}

export function ServiceComplaintsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { can } = usePermission()
  const [statusFilter, setStatusFilter] = useState<'all' | ComplaintStatus>('all')
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  // FP-001: debounce search to avoid a query on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setQ(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])
  const [createTitle, setCreateTitle] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [createOutletId, setCreateOutletId] = useState('')
  const [serialLines, setSerialLines] = useState<SerialLine[]>([{ productId: '', serialNumber: '', notes: '' }])
  const [createError, setCreateError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['service', 'complaints', statusFilter, q],
    queryFn: async () => {
      const response = await api.get('/tickets', {
        params: {
          page: 1,
          limit: 100,
          status: statusFilter === 'all' ? undefined : statusFilter,
          q: q.trim() || undefined,
        },
      })
      return normalizeRows(response.data)
    },
  })

  const outletsQuery = useQuery<OutletOption[]>({
    queryKey: ['outlets-for-complaint-create'],
    enabled: createOpen,
    queryFn: async () => {
      const response = await api.get('/outlets', { params: { page: 1, limit: 200 } })
      const p = response.data as any
      if (Array.isArray(p?.data?.data)) return p.data.data
      if (Array.isArray(p?.data)) return p.data
      return []
    },
  })

  const skusQuery = useQuery<SkuOption[]>({
    queryKey: ['service-complaint-sku-options'],
    enabled: createOpen,
    queryFn: async () => {
      const response = await api.get('/catalog/skus', { params: { limit: 500 } })
      const p = response.data as any
      const rows = Array.isArray(p?.data) ? p.data : Array.isArray(p) ? p : []
      return rows.filter((row: SkuOption) => row.isActive !== false)
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const validLines = serialLines.filter((l) => l.productId)
      if (!customerName.trim()) throw new Error('Customer name is required')
      if (!customerPhone.trim()) throw new Error('Customer phone number is required')
      if (validLines.length === 0) throw new Error('At least one catalog SKU is required')
      const response = await api.post('/tickets', {
        title: createTitle.trim() || undefined,
        description: createDescription.trim() || undefined,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        outletId: createOutletId || undefined,
        lines: validLines.map((l) => ({
          productId: l.productId,
          serialNumber: l.serialNumber.trim() || undefined,
          notes: l.notes.trim() || undefined,
        })),
      })
      const p = response.data as any
      return p?.data?.data ?? p?.data ?? p
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['service', 'complaints'] })
      handleCreateOpenChange(false)
      if (created?.id) navigate(`/dashboard/service/complaints/${created.id}`)
    },
    onError: (err) => setCreateError(apiErrorMessage(err, 'Failed to create complaint')),
  })

  function resetCreateForm() {
    setCreateTitle('')
    setCreateDescription('')
    setCustomerName('')
    setCustomerPhone('')
    setCreateOutletId('')
    setSerialLines([{ productId: '', serialNumber: '', notes: '' }])
    setCreateError(null)
  }

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open)
    if (!open) resetCreateForm()
  }

  function updateSerialLine(i: number, field: keyof SerialLine, value: string) {
    setSerialLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))
  }

  const rows = query.data?.rows ?? []
  const counts = query.data?.tabCounts ?? {}
  const activeCount = ACTIVE_STATUSES.reduce((n, s) => n + (counts[s] ?? 0), 0)

  const statCards = [
    { label: 'Total',       value: counts.all ?? 0,                    color: 'text-slate-700'   },
    { label: 'Active',      value: activeCount,                         color: 'text-teal-700'    },
    { label: 'Awaiting Test', value: (counts.test_result_submitted ?? 0) + (counts.retest_requested ?? 0), color: 'text-indigo-700' },
    { label: 'Resolved',    value: (counts.resolved ?? 0) + (counts.telephonic_closure ?? 0),      color: 'text-emerald-700' },
    { label: 'Cancelled',   value: counts.cancelled ?? 0,               color: 'text-rose-700'    },
  ]

  const visibleRows = useMemo(() => rows, [rows])

  return (
    <>
      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 mb-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className={`mt-1 text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* ── Main card ── */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-lg font-semibold text-slate-900">Service Complaints</CardTitle>
          {can('service:write') && (
            <Button
              type="button"
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => setCreateOpen(true)}
            >
              + New Complaint
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Status tabs */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_TABS.map((tab) => {
              const count = counts[tab.key as keyof typeof counts] ?? 0
              const active = statusFilter === tab.key
              const cfg = tab.key !== 'all' ? STATUS_CONFIG[tab.key as ComplaintStatus] : null
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={[
                    'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all',
                    active
                      ? cfg
                        ? `${cfg.bg} ${cfg.text} ring-1 ring-current`
                        : 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {cfg && active ? <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} /> : null}
                  {tab.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? 'bg-white/40' : 'bg-slate-200 text-slate-500'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search complaint #, serial, title…"
              className="max-w-sm"
            />
            {searchInput ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setSearchInput(''); setQ('') }} className="text-slate-500">
                Clear
              </Button>
            ) : null}
          </div>

          {/* Loading / error */}
          {query.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-12 rounded-lg bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : null}
          {query.isError ? (
            <p className="text-sm text-rose-600">{apiErrorMessage(query.error, 'Unable to load complaints.')}</p>
          ) : null}

          {/* Table */}
          {!query.isLoading && !query.isError ? (
            visibleRows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
                <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm font-medium">No complaints found</p>
                <p className="text-xs">
                  {statusFilter !== 'all' ? 'Try a different filter' : null}
                  {can('service:write') ? (
                    <>
                      {statusFilter !== 'all' ? ', or ' : ''}
                      <button type="button" className="text-teal-600 underline" onClick={() => setCreateOpen(true)}>
                        raise a new complaint
                      </button>
                    </>
                  ) : null}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">Complaint</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">Outlet</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">Serials</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer hover:bg-teal-50/60 transition-colors"
                        onClick={() => navigate(`/dashboard/service/complaints/${row.id}`)}
                      >
                        <TableCell>
                          <p className="font-mono text-sm font-semibold text-slate-900">{row.complaintNumber}</p>
                          <p className="text-xs text-slate-500 truncate max-w-[220px]">{row.title ?? 'Untitled complaint'}</p>
                        </TableCell>
                        <TableCell>
                          <ServiceStatusBadge status={row.status} size="sm" />
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">{row.outletName ?? '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {row.serials.slice(0, 2).map((s) => (
                              <code key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600">
                                {s}
                              </code>
                            ))}
                            {row.serials.length > 2 ? (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                                +{row.serials.length - 2}
                              </span>
                            ) : null}
                            {row.serials.length === 0 ? (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                                Pending
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">{timeAgo(row.updatedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : null}
        </CardContent>
      </Card>

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">New Service Complaint</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Outlet</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                value={createOutletId}
                onChange={(e) => setCreateOutletId(e.target.value)}
              >
                <option value="">No outlet (walk-in / direct)</option>
                {outletsQuery.isLoading ? (
                  <option disabled>Loading outlets…</option>
                ) : (
                  (outletsQuery.data ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}{o.outletCode ? ` (${o.outletCode})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Title <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
              <Input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="Brief description of the issue"
                maxLength={200}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Customer Name <span className="text-rose-500">*</span></Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer name"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone Number <span className="text-rose-500">*</span></Label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Customer phone number"
                  maxLength={40}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
              <textarea
                className="min-h-[72px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 resize-y"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Detailed description of the fault or complaint"
                maxLength={4000}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Battery Lines <span className="text-rose-500">*</span></Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSerialLines((prev) => [...prev, { productId: '', serialNumber: '', notes: '' }])}
                  className="text-xs"
                >
                  + Add Battery
                </Button>
              </div>
              {skusQuery.isError ? (
                <p className="text-xs text-rose-600">Unable to load catalog SKUs.</p>
              ) : null}
              <div className="space-y-2">
                {serialLines.map((line, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                      value={line.productId}
                      onChange={(e) => updateSerialLine(i, 'productId', e.target.value)}
                    >
                      <option value="">{skusQuery.isLoading ? 'Loading SKUs…' : `Select battery SKU ${i + 1}`}</option>
                      {(skusQuery.data ?? []).map((sku) => (
                        <option key={sku.id} value={sku.id}>
                          {(sku.displayName || sku.name)} ({sku.skuCode || sku.sku || 'SKU'})
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <Input
                        value={line.serialNumber}
                        onChange={(e) => updateSerialLine(i, 'serialNumber', e.target.value)}
                        placeholder="Serial ID (optional at creation)"
                        className="flex-1 bg-white font-mono"
                      />
                      {serialLines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setSerialLines((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-slate-400 hover:text-rose-500 transition-colors"
                          aria-label="Remove serial"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                    <Input
                      value={line.notes}
                      onChange={(e) => updateSerialLine(i, 'notes', e.target.value)}
                      placeholder="Notes for this serial (optional)"
                      className="bg-white text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>

            {createError ? (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                {createError}
              </p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCreateOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {createMutation.isPending ? 'Creating…' : 'Create Complaint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
