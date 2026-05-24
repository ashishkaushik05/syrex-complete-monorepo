import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { localDateToken } from '@/lib/date'
import { apiErrorMessage } from '@/lib/http'
import { usePermission } from '@/context/PermissionContext'

type DeliveryStatus = 'created' | 'in_transit' | 'delivered'

type TimelineEvent = {
  id: string
  dispatchId: string
  status: DeliveryStatus
  actorId: string | null
  actorRole: string | null
  note: string | null
  happenedAt: string
}

type DispatchLine = {
  id: string
  productId: string
  qtyDispatched: number
  serialNumbers?: string[] | null
}

type DispatchRecord = {
  id: string
  orderId: string
  deliveryStatus: DeliveryStatus
  dispatchDate: string
  estimatedDelivery?: string | null
  deliveredAt?: string | null
  lrNumber?: string | null
  transporterName?: string | null
  vehicleNumber?: string | null
  createdAt: string
  warehouse?: { id: string; name: string; location?: string | null } | null
  order?: { id: string; outlet?: { id: string; name: string; outletCode?: string | null } }
  lines: DispatchLine[]
}

type ProductOption = { id: string; name: string }

function formatDate(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : localDateToken(d)
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${localDateToken(d)} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function statusLabel(status: DeliveryStatus) {
  if (status === 'in_transit') return 'In Transit'
  if (status === 'delivered') return 'Delivered'
  return 'Created'
}

function statusBadgeClass(status: DeliveryStatus) {
  if (status === 'delivered') return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  if (status === 'in_transit') return 'border-blue-300 bg-blue-100 text-blue-800'
  return 'border-slate-300 bg-slate-100 text-slate-700'
}

function roleLabel(role: string | null) {
  if (role === 'admin') return 'Admin'
  if (role === 'warehouse') return 'Warehouse'
  if (role === 'outlet') return 'Outlet'
  return role ?? '—'
}

const TIMELINE_STEPS: DeliveryStatus[] = ['created', 'in_transit', 'delivered']

function TimelineStep({
  step,
  event,
  isLast,
}: {
  step: DeliveryStatus
  event: TimelineEvent | undefined
  isLast: boolean
}) {
  const done = Boolean(event)
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold ${
            done
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-slate-300 bg-white text-slate-400'
          }`}
        >
          {done ? '✓' : '·'}
        </div>
        {!isLast && (
          <div className={`mt-1 w-0.5 flex-1 ${done ? 'bg-emerald-300' : 'bg-slate-200'}`} style={{ minHeight: 24 }} />
        )}
      </div>
      <div className="pb-4">
        <p className={`text-sm font-semibold ${done ? 'text-slate-900' : 'text-slate-400'}`}>
          {statusLabel(step)}
        </p>
        {event ? (
          <p className="mt-0.5 text-xs text-slate-500">
            {formatDateTime(event.happenedAt)}
            {event.actorRole ? ` · ${roleLabel(event.actorRole)}` : ''}
            {event.note ? ` · "${event.note}"` : ''}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-slate-400">Pending</p>
        )}
      </div>
    </div>
  )
}

function normalizeDispatch(payload: unknown): DispatchRecord | null {
  if (!payload || typeof payload !== 'object') return null
  const row = payload as Partial<DispatchRecord>
  return {
    ...row,
    id: String(row.id ?? ''),
    orderId: String(row.orderId ?? ''),
    deliveryStatus: (row.deliveryStatus ?? 'created') as DeliveryStatus,
    dispatchDate: String(row.dispatchDate ?? ''),
    createdAt: String(row.createdAt ?? ''),
    lines: Array.isArray(row.lines) ? row.lines : [],
  } as DispatchRecord
}

export function DispatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const dispatchId = id ?? ''
  const queryClient = useQueryClient()
  const { can } = usePermission()

  const [confirmAction, setConfirmAction] = useState<'in_transit' | 'delivered' | null>(null)

  const canWrite = can('dispatches:write')
  const canDeliver = can('dispatches:deliver')

  const dispatchQuery = useQuery({
    queryKey: ['dispatch-detail', dispatchId],
    enabled: Boolean(dispatchId),
    queryFn: async () => {
      const response = await api.get<{ data: DispatchRecord }>(`/dispatches/${dispatchId}`)
      return normalizeDispatch(response.data.data)
    },
  })

  const timelineQuery = useQuery({
    queryKey: ['dispatch-timeline', dispatchId],
    enabled: Boolean(dispatchId),
    queryFn: async () => {
      const response = await api.get<{ data: TimelineEvent[] }>(`/dispatches/${dispatchId}/timeline`)
      return response.data.data ?? []
    },
  })

  const productsQuery = useQuery({
    queryKey: ['products-map'],
    queryFn: async () => {
      const response = await api.get<{ data: ProductOption[] }>('/products', {
        params: { page: 1, limit: 200 },
      })
      return response.data.data
    },
  })

  const productNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of productsQuery.data ?? []) map.set(item.id, item.name)
    return map
  }, [productsQuery.data])

  const eventByStatus = useMemo(() => {
    const map = new Map<DeliveryStatus, TimelineEvent>()
    for (const event of timelineQuery.data ?? []) map.set(event.status, event)
    return map
  }, [timelineQuery.data])

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dispatch-detail', dispatchId] }),
      queryClient.invalidateQueries({ queryKey: ['dispatch-timeline', dispatchId] }),
    ])
  }

  const markInTransitMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/dispatches/${dispatchId}/mark-in-transit`, {})
    },
    onSuccess: invalidate,
  })

  const markDeliveredMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/dispatches/${dispatchId}/mark-delivered`, {})
    },
    onSuccess: invalidate,
  })

  const dispatch = dispatchQuery.data
  const status = dispatch?.deliveryStatus ?? 'created'

  const showMarkInTransit = canWrite && status === 'created'
  const showMarkDelivered = canDeliver && (status === 'created' || status === 'in_transit')

  return (
    <div className="space-y-4">
      {dispatchQuery.isLoading ? <p className="text-sm text-slate-500">Loading dispatch...</p> : null}
      {dispatchQuery.isError ? (
        <p className="text-sm text-red-600">{apiErrorMessage(dispatchQuery.error, 'Unable to load dispatch.')}</p>
      ) : null}

      {dispatch ? (
        <>
          {/* Header */}
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle>Dispatch {dispatch.id.slice(0, 12)}</CardTitle>
                  <Badge className={statusBadgeClass(status)}>{statusLabel(status)}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Dispatched {formatDate(dispatch.dispatchDate)}
                  {dispatch.estimatedDelivery ? ` · ETA ${formatDate(dispatch.estimatedDelivery)}` : ''}
                  {dispatch.deliveredAt ? ` · Delivered ${formatDate(dispatch.deliveredAt)}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                {showMarkInTransit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmAction('in_transit')}
                    disabled={markInTransitMutation.isPending}
                  >
                    Mark In Transit
                  </Button>
                )}
                {showMarkDelivered && (
                  <Button
                    size="sm"
                    onClick={() => setConfirmAction('delivered')}
                    disabled={markDeliveredMutation.isPending}
                  >
                    Confirm Delivery
                  </Button>
                )}
              </div>
            </CardHeader>

            {markInTransitMutation.isError ? (
              <CardContent className="pt-0">
                <p className="text-sm text-red-600">
                  {apiErrorMessage(markInTransitMutation.error, 'Could not mark in transit')}
                </p>
              </CardContent>
            ) : null}
            {markDeliveredMutation.isError ? (
              <CardContent className="pt-0">
                <p className="text-sm text-red-600">
                  {apiErrorMessage(markDeliveredMutation.error, 'Could not confirm delivery')}
                </p>
              </CardContent>
            ) : null}

            <CardContent className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <p>
                <span className="font-medium text-slate-900">Outlet:</span>{' '}
                {dispatch.order?.outlet?.name ?? '—'}{' '}
                {dispatch.order?.outlet?.outletCode ? `(${dispatch.order.outlet.outletCode})` : ''}
              </p>
              <p>
                <span className="font-medium text-slate-900">Warehouse:</span>{' '}
                {dispatch.warehouse?.name ?? '—'}{' '}
                {dispatch.warehouse?.location ? `(${dispatch.warehouse.location})` : ''}
              </p>
              <p>
                <span className="font-medium text-slate-900">LR Number:</span> {dispatch.lrNumber ?? '—'}
              </p>
              <p>
                <span className="font-medium text-slate-900">Transporter:</span> {dispatch.transporterName ?? '—'}
              </p>
              <p>
                <span className="font-medium text-slate-900">Vehicle:</span> {dispatch.vehicleNumber ?? '—'}
              </p>
              <p>
                <span className="font-medium text-slate-900">Dispatch Date:</span>{' '}
                {formatDate(dispatch.dispatchDate)}
              </p>
            </CardContent>
          </Card>

          {/* Delivery Timeline */}
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Delivery Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {timelineQuery.isLoading ? (
                <p className="text-sm text-slate-500">Loading timeline...</p>
              ) : (
                <div className="pl-1">
                  {TIMELINE_STEPS.map((step, i) => (
                    <TimelineStep
                      key={step}
                      step={step}
                      event={eventByStatus.get(step)}
                      isLast={i === TIMELINE_STEPS.length - 1}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Items Dispatched</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Serial Numbers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispatch.lines.map((line) => {
                      const serialList =
                        line.serialNumbers && line.serialNumbers.length > 0
                          ? line.serialNumbers.join(', ')
                          : '—'
                      return (
                        <TableRow key={line.id}>
                          <TableCell>
                            {productNameById.get(line.productId) ?? line.productId}
                          </TableCell>
                          <TableCell>{line.qtyDispatched}</TableCell>
                          <TableCell className="font-mono text-xs">{serialList}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3">
                <Link
                  to={`/dashboard/sales/orders/${dispatch.orderId}`}
                  className="text-sm text-cyan-700 hover:underline"
                >
                  View source order
                </Link>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* Confirm: Mark In Transit */}
      <ConfirmDialog
        open={confirmAction === 'in_transit'}
        onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
        title="Mark as In Transit"
        description="Confirm that this dispatch has been handed to the transporter and is now in transit."
        confirmLabel="Mark In Transit"
        onConfirm={() => {
          setConfirmAction(null)
          markInTransitMutation.mutate()
        }}
        loading={markInTransitMutation.isPending}
      />

      {/* Confirm: Delivered */}
      <ConfirmDialog
        open={confirmAction === 'delivered'}
        onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
        title="Confirm Delivery"
        description="Confirm that the goods have been received at the outlet. This action cannot be reversed."
        confirmLabel="Confirm Delivery"
        onConfirm={() => {
          setConfirmAction(null)
          markDeliveredMutation.mutate()
        }}
        loading={markDeliveredMutation.isPending}
      />
    </div>
  )
}
