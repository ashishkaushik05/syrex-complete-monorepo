import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { localDateToken } from '@/lib/date'
import { formatCurrencyINR, titleCase } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type Warehouse = { id: string; name: string; location: string; isActive: boolean }

type QueueLine = {
  orderLineId: string
  productId: string
  sku: string
  productName: string
  qtyRemaining: number
  qtyDispatchable: number
  shortage: number
  availableNow: number
}

type QueueItem = {
  orderId: string
  orderNumber: string | null
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: string
  totalValue?: number | string | null
  waitFrom: string
  baseScore: number
  fillRate: number
  fillRateWeight: number
  finalScore: number
  classification: 'full' | 'partial' | 'blocked'
  pendingQty: number
  dispatchableQty: number
  shortageQty: number
  lines: QueueLine[]
  outlet: {
    id: string
    name: string
    outletCode: string
    outletPaymentScore: number
  } | null
}

type DispatchQueue = {
  warehouse: { id: string; name: string; location: string }
  generatedAt: string
  totals: {
    orders: number
    full: number
    partial: number
    blocked: number
    pendingQty: number
    dispatchableQty: number
  }
  items: QueueItem[]
}

type SerialUsageRow = {
  serialNumber: string
  used: boolean
  dispatchId: string | null
  orderId: string | null
  dispatchDate: string | null
  outletName: string | null
}

type LineDraft = { qty: string; serialNumbers: string }
type ItemDraft = { selected: boolean; lrNumber: string; lines: Record<string, LineDraft> }

type QueueFilter = 'all' | 'full' | 'partial' | 'blocked'

function priorityBadgeClass(priority: 'low' | 'medium' | 'high' | 'critical') {
  if (priority === 'critical') return 'border-red-300 bg-red-100 text-red-800'
  if (priority === 'high') return 'border-amber-300 bg-amber-100 text-amber-800'
  if (priority === 'medium') return 'border-blue-300 bg-blue-100 text-blue-800'
  return 'border-slate-300 bg-slate-100 text-slate-700'
}

function parseSerialInput(value: string) {
  return value
    .split(/[,\n\s]+/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.toUpperCase())
}

function makeLineDraft(line: QueueLine): LineDraft {
  return { qty: String(line.qtyDispatchable), serialNumbers: '' }
}

function makeItemDraft(item: QueueItem): ItemDraft {
  const lines: Record<string, LineDraft> = {}
  for (const line of item.lines) lines[line.orderLineId] = makeLineDraft(line)
  return { selected: false, lrNumber: '', lines }
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return localDateToken(date)
}

export function DispatchPlanPage() {
  const { warehouseId } = useParams<{ warehouseId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all')
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({})
  const [tripTransporter, setTripTransporter] = useState('')
  const [tripVehicle, setTripVehicle] = useState('')
  const isTripDetailsValid = tripTransporter.trim().length > 0 && tripVehicle.trim().length > 0

  const warehousesQuery = useQuery({
    queryKey: ['planning', 'dispatch-queue', 'warehouses'],
    queryFn: async () => {
      const response = await api.get<{ data: Warehouse[] }>('/warehouses')
      return response.data.data.filter((warehouse) => warehouse.isActive)
    },
  })

  const queueQuery = useQuery({
    queryKey: ['planning', 'dispatch-queue', warehouseId],
    enabled: Boolean(warehouseId),
    queryFn: async () => {
      const response = await api.get<{ data: DispatchQueue }>(`/planning/dispatch/${warehouseId}/queue`)
      return response.data.data
    },
  })

  useEffect(() => {
    if (!queueQuery.data) {
      setDrafts({})
      return
    }
    setDrafts((current) => {
      const next: Record<string, ItemDraft> = {}
      for (const item of queueQuery.data.items) {
        if (item.classification === 'blocked') continue
        next[item.orderId] = current[item.orderId] ?? makeItemDraft(item)
      }
      return next
    })
  }, [queueQuery.data])

  const visibleItems = useMemo(() => {
    const all = queueQuery.data?.items ?? []
    if (queueFilter === 'all') return all
    return all.filter((item) => item.classification === queueFilter)
  }, [queueQuery.data?.items, queueFilter])

  const actionableItems = useMemo(
    () => visibleItems.filter((item) => item.classification !== 'blocked' && item.dispatchableQty > 0),
    [visibleItems],
  )

  const selectedCount = Object.values(drafts).filter((draft) => draft.selected).length

  const selectedSerials = useMemo(() => {
    const serials = new Set<string>()
    for (const item of actionableItems) {
      const draft = drafts[item.orderId]
      if (!draft?.selected) continue
      for (const line of item.lines) {
        const lineDraft = draft.lines[line.orderLineId]
        if (!lineDraft) continue
        const qty = Number(lineDraft.qty)
        if (!Number.isFinite(qty) || qty <= 0) continue
        for (const serial of parseSerialInput(lineDraft.serialNumbers)) {
          serials.add(serial)
        }
      }
    }
    return Array.from(serials).sort()
  }, [actionableItems, drafts])

  const serialUsageQuery = useQuery({
    queryKey: ['planning', 'dispatch-queue', 'serial-usage', selectedSerials.join('|')],
    enabled: selectedSerials.length > 0,
    queryFn: async () => {
      const response = await api.post<{ data: { serials: SerialUsageRow[] } }>('/dispatches/serials/usage', {
        serialNumbers: selectedSerials,
      })
      return response.data.data.serials
    },
  })

  const usedSerialSet = useMemo(() => {
    const set = new Set<string>()
    for (const row of serialUsageQuery.data ?? []) {
      if (row.used) set.add(row.serialNumber.toUpperCase())
    }
    return set
  }, [serialUsageQuery.data])

  const usedSelectedSerialCount = useMemo(
    () => (serialUsageQuery.data ?? []).filter((row) => row.used).length,
    [serialUsageQuery.data],
  )

  const refreshQueueMutation = useMutation({
    mutationFn: async () => {
      if (!warehouseId) throw new Error('Warehouse is required')
      await api.post(`/planning/dispatch/${warehouseId}/queue/refresh`, { recalculateScores: true })
    },
    onSuccess: async () => {
      setDrafts({})
      await queryClient.invalidateQueries({ queryKey: ['planning', 'dispatch-queue', warehouseId] })
      await queryClient.invalidateQueries({ queryKey: ['planning', 'overview'] })
    },
  })

  const executeSelectedMutation = useMutation({
    mutationFn: async () => {
      if (!warehouseId) throw new Error('Warehouse is required')
      const selections: Array<{
        orderId: string
        lrNumber?: string
        items: Array<{ orderLineId: string; qty: number; serialNumbers: string[] }>
      }> = []

      if (!tripTransporter.trim()) {
        throw new Error('Transporter is required')
      }
      if (!tripVehicle.trim()) {
        throw new Error('Vehicle number is required')
      }

      for (const item of actionableItems) {
        const draft = drafts[item.orderId]
        if (!draft || !draft.selected) continue

        const items: Array<{ orderLineId: string; qty: number; serialNumbers: string[] }> = []
        for (const line of item.lines) {
          const lineDraft = draft.lines[line.orderLineId]
          if (!lineDraft) continue
          const qty = Number(lineDraft.qty)
          if (!Number.isFinite(qty) || qty <= 0) continue
          if (qty > line.qtyDispatchable) {
            throw new Error(
              `${item.orderNumber ?? item.orderId.slice(0, 8)} · ${line.productName}: qty ${qty} exceeds dispatchable ${line.qtyDispatchable}`,
            )
          }
          const serialNumbers = parseSerialInput(lineDraft.serialNumbers)
          if (serialNumbers.length !== qty) {
            throw new Error(
              `${item.orderNumber ?? item.orderId.slice(0, 8)} · ${line.productName}: ${serialNumbers.length} serials provided but qty is ${qty}`,
            )
          }
          items.push({ orderLineId: line.orderLineId, qty, serialNumbers })
        }

        if (items.length === 0) {
          throw new Error(`${item.orderNumber ?? item.orderId.slice(0, 8)}: at least one line must have qty > 0`)
        }

        selections.push({
          orderId: item.orderId,
          lrNumber: draft.lrNumber.trim() || undefined,
          items,
        })
      }

      if (selections.length === 0) {
        throw new Error('Select at least one order to dispatch')
      }

      const allSerials = Array.from(
        new Set(
          selections.flatMap((selection) =>
            selection.items.flatMap((item) =>
              item.serialNumbers.map((serial) => serial.trim().toUpperCase()).filter((serial) => serial.length > 0),
            ),
          ),
        ),
      )
      if (allSerials.length > 0) {
        const usageResponse = await api.post<{ data: { serials: SerialUsageRow[] } }>('/dispatches/serials/usage', {
          serialNumbers: allSerials,
        })
        const usedSerials = usageResponse.data.data.serials
          .filter((row) => row.used)
          .map((row) => row.serialNumber)
        if (usedSerials.length > 0) {
          throw new Error(`Serial(s) already used: ${usedSerials.slice(0, 8).join(', ')}`)
        }
      }

      await api.post(`/planning/dispatch/${warehouseId}/queue/execute-selected`, {
        transporterName: tripTransporter.trim() || undefined,
        vehicleNumber: tripVehicle.trim() || undefined,
        selections,
      })
    },
    onSuccess: async () => {
      setDrafts({})
      await queryClient.invalidateQueries({ queryKey: ['planning', 'dispatch-queue', warehouseId] })
    },
    onError: async () => {
      // Queue is live; refresh immediately so operator sees latest dispatchable quantities.
      await queryClient.invalidateQueries({ queryKey: ['planning', 'dispatch-queue', warehouseId] })
    },
  })

  const [executeConfirmOpen, setExecuteConfirmOpen] = useState(false)

  const dispatchError = executeSelectedMutation.isError
    ? apiErrorMessage(
        executeSelectedMutation.error,
        'Dispatch validation failed. Refresh queue and retry with current dispatchable qty/serials.',
      )
    : null

  const refreshError = refreshQueueMutation.isError
    ? apiErrorMessage(refreshQueueMutation.error, 'Could not refresh dispatch queue')
    : null

  function updateDraft(orderId: string, patch: Partial<ItemDraft>) {
    setDrafts((current) => ({
      ...current,
      [orderId]: { ...(current[orderId] ?? { selected: false, lrNumber: '', lines: {} }), ...patch },
    }))
  }

  function updateLineDraft(orderId: string, orderLineId: string, patch: Partial<LineDraft>) {
    setDrafts((current) => {
      const draft = current[orderId] ?? { selected: false, lrNumber: '', lines: {} }
      return {
        ...current,
        [orderId]: {
          ...draft,
          lines: {
            ...draft.lines,
            [orderLineId]: {
              ...(draft.lines[orderLineId] ?? { qty: '0', serialNumbers: '' }),
              ...patch,
            },
          },
        },
      }
    })
  }

  function selectAll() {
    setDrafts((current) => {
      const next = { ...current }
      for (const item of actionableItems) {
        next[item.orderId] = { ...(next[item.orderId] ?? makeItemDraft(item)), selected: true }
      }
      return next
    })
  }

  function clearSelection() {
    setDrafts((current) => {
      const next: Record<string, ItemDraft> = {}
      for (const [id, draft] of Object.entries(current)) next[id] = { ...draft, selected: false }
      return next
    })
  }

  return (
    <div className="space-y-4">
      {!warehouseId ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Select Warehouse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(warehousesQuery.data ?? []).map((warehouse) => (
              <Link
                key={warehouse.id}
                to={`/dashboard/dispatch/queue/${warehouse.id}`}
                className="block rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
              >
                {warehouse.name} ({warehouse.location})
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate('/dashboard/dispatch/queue')}>
            Change Warehouse
          </Button>
        </div>
      )}

      {queueQuery.isLoading ? <p className="text-sm text-slate-500">Loading dispatch queue...</p> : null}
      {queueQuery.isError ? (
        <p className="text-sm text-red-600">{apiErrorMessage(queueQuery.error, 'Unable to load dispatch queue')}</p>
      ) : null}
      {queueQuery.data ? (
        <>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>
                  Dispatch Queue · {queueQuery.data.warehouse.name} ({queueQuery.data.warehouse.location})
                </CardTitle>
                <p className="text-sm text-slate-500">Generated {new Date(queueQuery.data.generatedAt).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => refreshQueueMutation.mutate()} disabled={refreshQueueMutation.isPending}>
                  {refreshQueueMutation.isPending ? 'Refreshing...' : 'Refresh Queue'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-5">
              <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Orders</p><p className="mt-1 text-xl font-semibold text-slate-900">{queueQuery.data.totals.orders}</p></div>
              <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Full</p><p className="mt-1 text-xl font-semibold text-emerald-700">{queueQuery.data.totals.full}</p></div>
              <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Partial</p><p className="mt-1 text-xl font-semibold text-amber-700">{queueQuery.data.totals.partial}</p></div>
              <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Blocked</p><p className="mt-1 text-xl font-semibold text-red-700">{queueQuery.data.totals.blocked}</p></div>
              <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Dispatchable Qty</p><p className="mt-1 text-xl font-semibold text-slate-900">{queueQuery.data.totals.dispatchableQty}</p></div>
            </CardContent>
            {refreshError ? <CardContent className="pt-0"><p className="text-sm text-red-600">{refreshError}</p></CardContent> : null}
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Trip Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">Transporter *</label>
                <Input value={tripTransporter} onChange={(event) => setTripTransporter(event.target.value)} placeholder="Required" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">Vehicle Number *</label>
                <Input value={tripVehicle} onChange={(event) => setTripVehicle(event.target.value)} placeholder="Required" />
              </div>
              {!isTripDetailsValid ? (
                <p className="text-xs text-red-600 md:col-span-2">Transporter and vehicle number are required to dispatch.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Queue Orders</CardTitle>
                <p className="text-xs text-slate-500">Priority ranked with fill-rate weighting. Execute from queue selections.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'full', 'partial', 'blocked'] as QueueFilter[]).map((value) => (
                  <Button key={value} variant={queueFilter === value ? 'default' : 'outline'} size="sm" onClick={() => setQueueFilter(value)}>
                    {titleCase(value)}
                  </Button>
                ))}
                <Button variant="outline" onClick={selectAll} disabled={actionableItems.length === 0}>Select All</Button>
                <Button variant="outline" onClick={clearSelection} disabled={selectedCount === 0}>Clear</Button>
                <Button
                  onClick={() => setExecuteConfirmOpen(true)}
                  disabled={
                    executeSelectedMutation.isPending ||
                    selectedCount === 0 ||
                    serialUsageQuery.isFetching ||
                    usedSelectedSerialCount > 0 ||
                    !isTripDetailsValid
                  }
                >
                  {executeSelectedMutation.isPending ? 'Dispatching...' : `Dispatch Selected (${selectedCount})`}
                </Button>
                <ConfirmDialog
                  open={executeConfirmOpen}
                  onOpenChange={setExecuteConfirmOpen}
                  title="Confirm Dispatch"
                  description={`You are about to dispatch ${selectedCount} order${selectedCount !== 1 ? 's' : ''}. Dispatches cannot be reversed. Make sure all quantities and serial numbers are correct.`}
                  confirmLabel={`Dispatch ${selectedCount} Order${selectedCount !== 1 ? 's' : ''}`}
                  onConfirm={() => { setExecuteConfirmOpen(false); executeSelectedMutation.mutate() }}
                  loading={executeSelectedMutation.isPending}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {serialUsageQuery.isFetching ? (
                <p className="text-xs text-slate-500">Checking serial usage for selected orders...</p>
              ) : null}
              {serialUsageQuery.isError ? (
                <p className="text-xs text-red-600">Unable to verify serial usage. Retry after a moment.</p>
              ) : null}
              {usedSelectedSerialCount > 0 ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-700">
                    {usedSelectedSerialCount} serial(s) in selected orders are already used in previous dispatches.
                  </p>
                </div>
              ) : null}
              {dispatchError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-700">{dispatchError}</p>
                  <p className="mt-1 text-xs text-red-600">
                    Common causes: qty exceeds current dispatchable, line not in live queue anymore, serial mismatch,
                    duplicate serial, or stock changed.
                  </p>
                </div>
              ) : null}
              {visibleItems.length === 0 ? (
                <p className="text-sm text-slate-500">No orders in this queue filter.</p>
              ) : (
                visibleItems.map((item, rank) => {
                  const draft = drafts[item.orderId] ?? makeItemDraft(item)
                  const isBlocked = item.classification === 'blocked' || item.dispatchableQty <= 0
                  const cardClass = isBlocked
                    ? 'border-red-200 bg-red-50/30'
                    : draft.selected
                      ? 'border-blue-300 bg-blue-50/30'
                      : 'border-slate-200'

                  return (
                    <div key={item.orderId} className={`rounded-lg border p-3 ${cardClass}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={!isBlocked && draft.selected} disabled={isBlocked} onChange={(event) => updateDraft(item.orderId, { selected: event.target.checked })} />
                          <span className="text-xs font-mono text-slate-500">#{rank + 1}</span>
                          <span className="font-medium text-slate-900">{item.orderNumber ?? item.orderId.slice(0, 12)}</span>
                          <Badge className={item.classification === 'full' ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : item.classification === 'partial' ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-red-300 bg-red-100 text-red-800'}>{titleCase(item.classification)}</Badge>
                        </label>
                        <div className="flex items-center gap-2">
                          <Badge className={priorityBadgeClass(item.priority)}>{titleCase(item.priority)}</Badge>
                          <span className="text-sm text-slate-700">Final {item.finalScore.toFixed(1)}</span>
                          <span className="text-sm text-slate-500">Fill {(item.fillRate * 100).toFixed(1)}%</span>
                          <span className="text-sm font-semibold text-slate-900">
                            {formatCurrencyINR(Number(item.totalValue ?? 0))}
                          </span>
                        </div>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>Outlet: {item.outlet?.name ?? '-'}</span>
                        <span>· Payment {Number(item.outlet?.outletPaymentScore ?? 50).toFixed(1)}</span>
                        <span>· Base {item.baseScore.toFixed(1)}</span>
                        <span>· Weight {item.fillRateWeight.toFixed(3)}</span>
                        <span>· Pending {item.pendingQty}</span>
                        <span>· Dispatchable {item.dispatchableQty}</span>
                        <span>· Short {item.shortageQty}</span>
                        <span>· Wait From {formatDate(item.waitFrom)}</span>
                      </div>

                      <div className="mt-3 space-y-2">
                        {item.lines.map((line) => {
                          const lineDraft = draft.lines[line.orderLineId] ?? makeLineDraft(line)
                          const qtyValue = Number(lineDraft.qty)
                          const parsedSerials = parseSerialInput(lineDraft.serialNumbers)
                          const serialCount = parsedSerials.length
                          const serialMismatch = Number.isFinite(qtyValue) && qtyValue > 0 && serialCount !== qtyValue
                          const usedSerials = parsedSerials.filter((serial) => usedSerialSet.has(serial.toUpperCase()))
                          return (
                            <div key={line.orderLineId} className="grid gap-2 rounded-md border border-slate-100 bg-slate-50/40 p-2 md:grid-cols-[minmax(0,2fr)_120px_minmax(0,2fr)]">
                              <div className="text-sm">
                                <div className="font-medium text-slate-900">{line.productName} <span className="text-slate-500">({line.sku})</span></div>
                                <div className="text-xs text-slate-500">Remaining {line.qtyRemaining} · Dispatchable {line.qtyDispatchable}{line.shortage > 0 ? <span className="text-amber-700"> · Short {line.shortage}</span> : null}</div>
                              </div>
                              <Input type="number" min={0} max={line.qtyDispatchable} disabled={isBlocked} value={lineDraft.qty} onChange={(event) => updateLineDraft(item.orderId, line.orderLineId, { qty: event.target.value })} />
                              <div>
                                <Input value={lineDraft.serialNumbers} disabled={isBlocked} onChange={(event) => updateLineDraft(item.orderId, line.orderLineId, { serialNumbers: event.target.value })} placeholder="Serials (comma/space/newline)" />
                                {serialMismatch ? <p className="mt-1 text-xs text-red-600">{serialCount} serials provided · need {qtyValue}</p> : null}
                                {usedSerials.length > 0 ? (
                                  <p className="mt-1 text-xs text-red-600">
                                    Used serials: {usedSerials.slice(0, 4).join(', ')}
                                    {usedSerials.length > 4 ? ` +${usedSerials.length - 4} more` : ''}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="mt-2">
                        <label className="text-xs uppercase tracking-wide text-slate-500">LR Number (per order)</label>
                        <Input value={draft.lrNumber} disabled={isBlocked} onChange={(event) => updateDraft(item.orderId, { lrNumber: event.target.value })} placeholder="Optional" />
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
