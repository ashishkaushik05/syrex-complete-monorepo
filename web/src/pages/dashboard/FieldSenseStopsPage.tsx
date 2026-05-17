import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PauseCircle, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { trpcQuery } from '@/lib/api'

type Stop = {
  id: string
  agentId: string
  shiftId: string
  orgId: string
  lat: number
  lng: number
  reason: string | null
  notes: string | null
  startedAt: string
  endedAt: string | null
  createdAt: string
}

type User = { id: string; name: string; email: string }

type StatusFilter = 'all' | 'open' | 'closed'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function calcDuration(startedAt: string, endedAt: string | null): string {
  const end = endedAt ? new Date(endedAt) : new Date()
  const secs = Math.floor((end.getTime() - new Date(startedAt).getTime()) / 1000)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function FieldSenseStopsPage() {
  const [fromDate, setFromDate] = useState(todayISO())
  const [toDate, setToDate] = useState(todayISO())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const stopsQuery = useQuery({
    queryKey: ['field-stops', fromDate, toDate],
    queryFn: () =>
      trpcQuery<Stop[]>('fieldStops.list', {
        from: `${fromDate}T00:00:00.000Z`,
        to: `${toDate}T23:59:59.999Z`,
        openOnly: statusFilter === 'open' ? true : undefined,
        limit: 200,
      }),
  })

  const usersQuery = useQuery({
    queryKey: ['users-list-for-stops'],
    queryFn: () => trpcQuery<User[]>('users.list', { limit: 200 }),
  })

  const agentMap = new Map<string, string>(
    (usersQuery.data ?? []).map((u) => [u.id, u.name]),
  )

  const allStops = stopsQuery.data ?? []

  const filtered = allStops.filter((s) => {
    const agentName = agentMap.get(s.agentId) ?? s.agentId
    const matchesSearch =
      !search ||
      agentName.toLowerCase().includes(search.toLowerCase()) ||
      (s.reason ?? '').toLowerCase().includes(search.toLowerCase())
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'open' && s.endedAt === null) ||
      (statusFilter === 'closed' && s.endedAt !== null)
    return matchesSearch && matchesStatus
  })

  const closedStops = allStops.filter((s) => s.endedAt !== null)
  const openStops = allStops.filter((s) => s.endedAt === null)

  const avgDuration = (() => {
    if (closedStops.length === 0) return '—'
    const totalSecs = closedStops.reduce((acc, s) => {
      return acc + Math.floor(
        (new Date(s.endedAt!).getTime() - new Date(s.startedAt).getTime()) / 1000,
      )
    }, 0)
    const avgSecs = Math.floor(totalSecs / closedStops.length)
    const h = Math.floor(avgSecs / 3600)
    const m = Math.floor((avgSecs % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  })()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Stops</h1>
        <p className="text-sm text-slate-500">Agent pause and stop log.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Total Stops</span>
              <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                {allStops.length}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Open Now</span>
              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                {openStops.length}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Avg Duration</span>
              <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                {avgDuration}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 w-36 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 w-36 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="relative flex-1" style={{ minWidth: '160px' }}>
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search agent or reason…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">
            <div className="flex items-center gap-2">
              <PauseCircle className="h-4 w-4 text-amber-500" />
              Stops ({filtered.length})
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {stopsQuery.isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : stopsQuery.isError ? (
            <div className="px-6 py-8 text-center text-sm text-red-500">
              Failed to load stops.
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              No stops found for the selected filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((stop) => {
                  const isOpen = stop.endedAt === null
                  return (
                    <TableRow key={stop.id}>
                      <TableCell>
                        <span className="font-medium text-slate-800">
                          {agentMap.get(stop.agentId) ?? stop.agentId}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">
                          {stop.reason ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-500">
                          {stop.notes
                            ? stop.notes.length > 30
                              ? `${stop.notes.slice(0, 30)}…`
                              : stop.notes
                            : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-slate-500">
                          {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-400">
                          {new Date(stop.startedAt).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        {isOpen ? (
                          <span className="text-xs italic text-amber-600">
                            {calcDuration(stop.startedAt, null)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">
                            {calcDuration(stop.startedAt, stop.endedAt)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isOpen ? (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                            Open
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">
                            Closed
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
