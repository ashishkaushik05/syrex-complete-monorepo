import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatCurrencyINR, titleCase } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'
import { usePermission } from '@/context/PermissionContext'

type Priority = 'low' | 'medium' | 'high' | 'critical'

type QueueOrder = {
  id: string
  orderNumber?: string | null
  priority: Priority
  totalValue: number | string
  createdAt: string
  outlet?: {
    id: string
    name: string
  }
}

type PaginatedResponse<T> = {
  data: T[]
  pagination: {
    total: number
    page: number
    limit: number
  }
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function priorityBadgeClass(priority: Priority) {
  if (priority === 'critical') return 'border-red-300 bg-red-100 text-red-800'
  if (priority === 'high') return 'border-amber-300 bg-amber-100 text-amber-800'
  if (priority === 'medium') return 'border-blue-300 bg-blue-100 text-blue-800'
  return 'border-slate-300 bg-slate-100 text-slate-700'
}

export function AccountsApprovalQueuePage() {
  const queryClient = useQueryClient()
  const { can } = usePermission()
  const canApprove = can('orders:approve')
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState<'all' | Priority>('all')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [approveConfirmId, setApproveConfirmId] = useState<string | null>(null)

  const queueQuery = useQuery({
    queryKey: ['accounts-approval-queue', priority, search],
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<QueueOrder>>('/orders/pending-approval', {
        params: {
          page: 1,
          limit: 100,
          outletName: search.trim() || undefined,
          priority: priority === 'all' ? undefined : priority,
        },
      })
      return response.data
    },
  })

  const approveMutation = useMutation({
    mutationFn: async (orderId: string) => {
      await api.post(`/orders/${orderId}/approve`, {})
    },
    onSuccess: async () => {
      setActionError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts-approval-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['sales-orders-list'] }),
        queryClient.invalidateQueries({ queryKey: ['sales-orders-status-counts'] }),
      ])
    },
    onError: (error) => {
      setActionError(apiErrorMessage(error, 'Could not approve order'))
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      await api.post(`/orders/${orderId}/reject`, { reason })
    },
    onSuccess: async () => {
      setRejectingId(null)
      setRejectReason('')
      setActionError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts-approval-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['sales-orders-list'] }),
        queryClient.invalidateQueries({ queryKey: ['sales-orders-status-counts'] }),
      ])
    },
    onError: (error) => {
      setActionError(apiErrorMessage(error, 'Could not reject order'))
    },
  })

  const rows = queueQuery.data?.data ?? []
  const total = queueQuery.data?.pagination.total ?? rows.length

  const byPriority = useMemo(() => {
    return {
      critical: rows.filter((row) => row.priority === 'critical').length,
      high: rows.filter((row) => row.priority === 'high').length,
      medium: rows.filter((row) => row.priority === 'medium').length,
      low: rows.filter((row) => row.priority === 'low').length,
    }
  }, [rows])

  const approveConfirmRow = rows.find((row) => row.id === approveConfirmId)

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={approveConfirmId !== null}
        onOpenChange={(open) => { if (!open) setApproveConfirmId(null) }}
        title="Approve Order"
        description={
          approveConfirmRow
            ? `Approve order ${approveConfirmRow.orderNumber ?? approveConfirmRow.id} for ${approveConfirmRow.outlet?.name ?? 'this outlet'} (${formatCurrencyINR(toNumber(approveConfirmRow.totalValue))})?`
            : 'Approve this order?'
        }
        confirmLabel="Approve"
        onConfirm={() => { const id = approveConfirmId; setApproveConfirmId(null); if (id) approveMutation.mutate(id) }}
        loading={approveMutation.isPending}
      />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Approval Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="approval-search">Search by Outlet Name</Label>
              <Input
                id="approval-search"
                placeholder="e.g. Sunrise Auto Parts..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="approval-priority">Filter by Priority</Label>
              <select
                id="approval-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as 'all' | Priority)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="all">All Priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-5">
            <StatCard label="Total Pending" value={total} />
            <StatCard label="Critical" value={byPriority.critical} />
            <StatCard label="High" value={byPriority.high} />
            <StatCard label="Medium" value={byPriority.medium} />
            <StatCard label="Low" value={byPriority.low} />
          </div>

          {actionError ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="p-0">
          {queueQuery.isLoading ? (
            <p className="p-4 text-sm text-slate-500">Loading approval queue...</p>
          ) : queueQuery.isError ? (
            <p className="p-4 text-sm text-red-600">
              {apiErrorMessage(queueQuery.error, 'Unable to load approval queue.')}
            </p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No pending approvals found.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <>
                      <TableRow key={row.id}>
                        <TableCell className="font-medium text-slate-900">
                          <Link
                            to={`/dashboard/sales/orders/${row.id}`}
                            className="hover:underline"
                          >
                            {row.orderNumber ?? row.id.slice(0, 12)}
                          </Link>
                        </TableCell>
                        <TableCell>{row.outlet?.name ?? '-'}</TableCell>
                        <TableCell>
                          <Badge className={priorityBadgeClass(row.priority)}>
                            {titleCase(row.priority)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {new Date(row.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>{formatCurrencyINR(toNumber(row.totalValue))}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canApprove && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setActionError(null)
                                  setApproveConfirmId(row.id)
                                }}
                                disabled={approveMutation.isPending || rejectMutation.isPending}
                              >
                                Approve
                              </Button>
                            )}
                            {canApprove && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActionError(null)
                                  setRejectingId(rejectingId === row.id ? null : row.id)
                                  setRejectReason('')
                                }}
                                disabled={approveMutation.isPending || rejectMutation.isPending}
                              >
                                Reject
                              </Button>
                            )}
                            <Link
                              to={`/dashboard/sales/orders/${row.id}`}
                              className="text-sm font-medium text-blue-700 hover:text-blue-800"
                            >
                              Open
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                      {rejectingId === row.id ? (
                        <TableRow key={`${row.id}-reject`}>
                          <TableCell colSpan={6} className="bg-red-50/60 py-2">
                            <div className="flex items-center gap-2">
                              <div className="max-w-sm flex-1 space-y-1">
                                <Label htmlFor={`reject-reason-${row.id}`} className="text-xs text-red-700">
                                  Rejection Reason (required)
                                </Label>
                                <Input
                                  id={`reject-reason-${row.id}`}
                                  placeholder="Explain why this order is being rejected..."
                                  value={rejectReason}
                                  onChange={(event) => setRejectReason(event.target.value)}
                                  autoFocus
                                />
                              </div>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  rejectMutation.mutate({ orderId: row.id, reason: rejectReason })
                                }
                                disabled={!rejectReason.trim() || rejectMutation.isPending}
                              >
                                {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Reject'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setRejectingId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}
