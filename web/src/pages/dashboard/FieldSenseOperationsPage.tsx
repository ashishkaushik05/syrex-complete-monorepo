import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Clock, Cpu, MapPin, Radio, WifiOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { trpcQuery } from '@/lib/api'

type HealthState = 'ACTIVE' | 'DELAYED' | 'STALE' | 'OFFLINE' | 'GPS_DISABLED' | 'SHIFT_DESYNC'

type ActiveAgent = {
  agentId: string
  agentName: string
  shiftId: string
  shiftStartedAt: string
  lastPingAt: string | null
  lat: number | null
  lng: number | null
  healthState: HealthState | null
  health: {
    deviceId: string | null
    platform: string | null
    appVersion: string | null
    pendingQueueDepth: number | null
    lastCapturedAt: string | null
    lastReceivedAt: string | null
    lastSyncAttemptAt: string | null
    lastSyncErrorCode: string | null
  } | null
}

type ActiveAgentsResponse = {
  agents: ActiveAgent[]
  hasMore: boolean
}

type SyncStatus = {
  id: string
  orgId: string
  agentId: string
  deviceId: string
  shiftId: string | null
  clientShiftId: string | null
  appVersion: string | null
  platform: string | null
  lastCapturedAt: string | null
  lastReceivedAt: string | null
  lastSyncAttemptAt: string | null
  lastSyncErrorCode: string | null
  pendingQueueDepth: number | null
  permissionsSummary: unknown
  updatedAt: string
}

type SseStats = {
  orgCount: number
  totalConnections: number
  broadcastCount: number
  lastBroadcastAt: string | null
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function shortDeviceId(deviceId: string | null | undefined): string {
  if (!deviceId) return '—'
  return deviceId.length > 8 ? '…' + deviceId.slice(-8) : deviceId
}

const healthStateMeta: Record<
  HealthState,
  { label: string; className: string }
> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
  DELAYED: { label: 'Delayed', className: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100' },
  STALE: { label: 'Stale', className: 'bg-orange-100 text-orange-700 hover:bg-orange-100' },
  OFFLINE: { label: 'Offline', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  GPS_DISABLED: { label: 'GPS Off', className: 'bg-slate-100 text-slate-600 hover:bg-slate-100' },
  SHIFT_DESYNC: { label: 'Desync', className: 'bg-purple-100 text-purple-700 hover:bg-purple-100' },
}

function HealthBadge({ state }: { state: HealthState | null }) {
  if (!state) {
    return <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100">Unknown</Badge>
  }
  const meta = healthStateMeta[state] ?? {
    label: state,
    className: 'bg-slate-100 text-slate-600 hover:bg-slate-100',
  }
  return (
    <Badge className={meta.className}>
      {state === 'ACTIVE' && (
        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
      )}
      {meta.label}
    </Badge>
  )
}

export function FieldSenseOperationsPage() {
  const [selectedAgent, setSelectedAgent] = useState<(ActiveAgent & { syncRecord?: SyncStatus }) | null>(null)

  const agentsQuery = useQuery({
    queryKey: ['field-ops-agents'],
    queryFn: () => trpcQuery<ActiveAgentsResponse>('fieldLocation.activeAgents', { limit: 200 }),
    refetchInterval: 30_000,
  })

  const syncQuery = useQuery({
    queryKey: ['field-ops-sync'],
    queryFn: () => trpcQuery<SyncStatus[]>('fieldSyncStatus.list', { limit: 100 }),
    refetchInterval: 30_000,
  })

  const sseQuery = useQuery({
    queryKey: ['field-ops-sse'],
    queryFn: () => trpcQuery<SseStats>('fieldSyncStatus.sseStats', undefined),
    refetchInterval: 30_000,
  })

  const agents = agentsQuery.data?.agents ?? []
  const hasMore = agentsQuery.data?.hasMore ?? false
  const syncList = syncQuery.data ?? []
  const sseStats = sseQuery.data

  // Build sync status map keyed by agentId
  const syncMap = new Map<string, SyncStatus>(syncList.map((s) => [s.agentId, s]))

  // Summary counts
  const total = agents.length
  const counts: Record<HealthState, number> = {
    ACTIVE: 0,
    DELAYED: 0,
    STALE: 0,
    OFFLINE: 0,
    GPS_DISABLED: 0,
    SHIFT_DESYNC: 0,
  }
  for (const agent of agents) {
    if (agent.healthState && agent.healthState in counts) {
      counts[agent.healthState]++
    }
  }

  const isLoading = agentsQuery.isLoading || syncQuery.isLoading
  const isError = agentsQuery.isError || syncQuery.isError

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Operations</h1>
        <p className="text-sm text-slate-500">
          Real-time health overview of all active field agents and their sync status.
        </p>
      </div>

      {/* Warning banner */}
      {hasMore && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          Showing first 200 agents. Some agents may not appear.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs text-slate-500">Total</span>
              </div>
              <span className="text-sm font-semibold text-slate-800">{total}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs text-slate-500">Online</span>
              </div>
              <span className="text-sm font-semibold text-emerald-600">{counts.ACTIVE}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-yellow-500" />
                <span className="text-xs text-slate-500">Delayed</span>
              </div>
              <span className="text-sm font-semibold text-yellow-600">{counts.DELAYED}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-xs text-slate-500">Stale</span>
              </div>
              <span className="text-sm font-semibold text-orange-600">{counts.STALE}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <WifiOff className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs text-slate-500">Offline</span>
              </div>
              <span className="text-sm font-semibold text-red-600">{counts.OFFLINE}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs text-slate-500">GPS Off</span>
              </div>
              <span className="text-sm font-semibold text-slate-600">{counts.GPS_DISABLED}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-sky-500" />
            <div>
              <p className="text-xs text-slate-500">SSE connections</p>
              <p className="text-sm font-semibold text-slate-800">
                {sseQuery.isLoading ? '…' : sseStats?.totalConnections ?? 0}
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500">Subscribed orgs</p>
            <p className="text-sm font-semibold text-slate-800">
              {sseQuery.isLoading ? '…' : sseStats?.orgCount ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Broadcasts since boot</p>
            <p className="text-sm font-semibold text-slate-800">
              {sseQuery.isLoading ? '…' : sseStats?.broadcastCount ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Last event</p>
            <p className="text-sm font-semibold text-slate-800">
              {formatDateTime(sseStats?.lastBroadcastAt)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Agent table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-sky-500" />
              Agent Status ({total})
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="px-6 py-8 text-center text-sm text-red-500">
              Failed to load operations data.
            </div>
          ) : agents.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              No active agents found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Last GPS Capture</TableHead>
                    <TableHead>Last Received</TableHead>
                    <TableHead>Last Sync Attempt</TableHead>
                    <TableHead>Last Error</TableHead>
                    <TableHead className="text-right">Queue</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>App Version</TableHead>
                    <TableHead>Device ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((agent) => {
                    const sync = syncMap.get(agent.agentId)
                    // Prefer health object from agent, fall back to sync record
                    const lastCapturedAt = agent.health?.lastCapturedAt ?? sync?.lastCapturedAt
                    const lastReceivedAt = agent.health?.lastReceivedAt ?? sync?.lastReceivedAt
                    const lastSyncAttemptAt = agent.health?.lastSyncAttemptAt ?? sync?.lastSyncAttemptAt
                    const lastSyncErrorCode = agent.health?.lastSyncErrorCode ?? sync?.lastSyncErrorCode
                    const pendingQueueDepth = agent.health?.pendingQueueDepth ?? sync?.pendingQueueDepth
                    const platform = agent.health?.platform ?? sync?.platform
                    const appVersion = agent.health?.appVersion ?? sync?.appVersion
                    const deviceId = agent.health?.deviceId ?? sync?.deviceId

                    return (
                      <TableRow
                        key={agent.agentId}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => setSelectedAgent({ ...agent, syncRecord: syncMap.get(agent.agentId) })}
                      >
                        <TableCell>
                          <span className="font-medium text-slate-800">{agent.agentName}</span>
                        </TableCell>
                        <TableCell>
                          <HealthBadge state={agent.healthState} />
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-500 tabular-nums">
                            {formatDateTime(lastCapturedAt)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-500 tabular-nums">
                            {formatDateTime(lastReceivedAt)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-500 tabular-nums">
                            {formatDateTime(lastSyncAttemptAt)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {lastSyncErrorCode ? (
                            <Badge className="bg-red-50 font-mono text-[10px] text-red-600 hover:bg-red-50">
                              {lastSyncErrorCode}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {pendingQueueDepth != null ? (
                            <span
                              className={
                                pendingQueueDepth > 0
                                  ? 'text-sm font-semibold text-amber-600'
                                  : 'text-sm text-slate-500'
                              }
                            >
                              {pendingQueueDepth}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-600">{platform ?? '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-600">{appVersion ?? '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-slate-400">
                            {shortDeviceId(deviceId)}
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Agent Diagnostics Modal */}
      {selectedAgent && (() => {
        const a = selectedAgent
        const s = a.syncRecord
        const lastCapturedAt = a.health?.lastCapturedAt ?? s?.lastCapturedAt
        const lastReceivedAt = a.health?.lastReceivedAt ?? s?.lastReceivedAt
        const lastSyncAttemptAt = a.health?.lastSyncAttemptAt ?? s?.lastSyncAttemptAt
        const lastSyncErrorCode = a.health?.lastSyncErrorCode ?? s?.lastSyncErrorCode
        const pendingQueueDepth = a.health?.pendingQueueDepth ?? s?.pendingQueueDepth
        const platform = a.health?.platform ?? s?.platform
        const appVersion = a.health?.appVersion ?? s?.appVersion
        const deviceId = a.health?.deviceId ?? s?.deviceId
        const permissionsSummary = s?.permissionsSummary

        const shiftIdShort = a.shiftId ? '…' + a.shiftId.slice(-8) : '—'
        const serverShiftId = s?.shiftId ? '…' + s.shiftId.slice(-8) : '—'

        return (
          <Dialog open onOpenChange={(open) => { if (!open) setSelectedAgent(null) }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{a.agentName}</DialogTitle>
              </DialogHeader>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500">Health State</dt>
                <dd className="font-medium text-slate-900">
                  <HealthBadge state={a.healthState} />
                </dd>

                <dt className="text-slate-500">Shift ID</dt>
                <dd className="font-mono font-medium text-slate-900">{shiftIdShort}</dd>

                <dt className="text-slate-500">Server Shift ID</dt>
                <dd className="font-mono font-medium text-slate-900">{serverShiftId}</dd>

                <dt className="text-slate-500">Last GPS Capture</dt>
                <dd className="font-medium text-slate-900 tabular-nums">{formatDateTime(lastCapturedAt)}</dd>

                <dt className="text-slate-500">Last Received</dt>
                <dd className="font-medium text-slate-900 tabular-nums">{formatDateTime(lastReceivedAt)}</dd>

                <dt className="text-slate-500">Last Sync Attempt</dt>
                <dd className="font-medium text-slate-900 tabular-nums">{formatDateTime(lastSyncAttemptAt)}</dd>

                <dt className="text-slate-500">Last Error Code</dt>
                <dd className="font-medium text-slate-900">
                  {lastSyncErrorCode ? (
                    <Badge className="bg-red-50 font-mono text-[10px] text-red-600 hover:bg-red-50">
                      {lastSyncErrorCode}
                    </Badge>
                  ) : '—'}
                </dd>

                <dt className="text-slate-500">Pending Queue Depth</dt>
                <dd className="font-medium text-slate-900">{pendingQueueDepth != null ? String(pendingQueueDepth) : '—'}</dd>

                <dt className="text-slate-500">Device ID</dt>
                <dd className="break-all font-mono font-medium text-slate-900">{deviceId ?? '—'}</dd>

                <dt className="text-slate-500">Platform</dt>
                <dd className="font-medium text-slate-900">{platform ?? '—'}</dd>

                <dt className="text-slate-500">App Version</dt>
                <dd className="font-medium text-slate-900">{appVersion ?? '—'}</dd>

                <dt className="text-slate-500">Permissions Summary</dt>
                <dd className="break-all font-medium text-slate-900">
                  {permissionsSummary != null
                    ? typeof permissionsSummary === 'object'
                      ? JSON.stringify(permissionsSummary)
                      : String(permissionsSummary)
                    : '—'}
                </dd>
              </dl>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="rounded-md border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </DialogContent>
          </Dialog>
        )
      })()}
    </div>
  )
}
