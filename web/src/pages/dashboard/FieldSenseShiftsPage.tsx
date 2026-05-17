import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Clock, Search, Timer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { trpcQuery } from '@/lib/api'

type ShiftStatus = 'active' | 'completed'

type Shift = {
  id: string
  agentId: string
  orgId: string
  startedAt: string
  endedAt: string | null
  startType: 'auto' | 'manual'
  endType: 'auto' | 'manual' | 'extended' | null
  status: ShiftStatus
}

type User = {
  id: string
  name: string
  email: string
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function calcDuration(startedAt: string, endedAt: string | null): string {
  const end = endedAt ? new Date(endedAt) : new Date()
  const secs = Math.floor((end.getTime() - new Date(startedAt).getTime()) / 1000)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return `${h}h ${m}m`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function FieldSenseShiftsPage() {
  const [date, setDate] = useState(todayISO())
  const [statusFilter, setStatusFilter] = useState<ShiftStatus | ''>('')
  const [search, setSearch] = useState('')

  const shiftsQuery = useQuery({
    queryKey: ['field-shifts', date, statusFilter],
    queryFn: () =>
      trpcQuery<Shift[]>('fieldShifts.list', {
        date,
        status: statusFilter || undefined,
        limit: 200,
      }),
  })

  const usersQuery = useQuery({
    queryKey: ['users-list-for-shifts'],
    queryFn: () => trpcQuery<User[]>('users.list', { limit: 200 }),
  })

  const agentMap = new Map<string, string>(
    (usersQuery.data ?? []).map((u) => [u.id, u.name]),
  )

  const shifts = shiftsQuery.data ?? []

  const filtered = shifts.filter((s) => {
    if (!search) return true
    const name = agentMap.get(s.agentId) ?? ''
    return name.toLowerCase().includes(search.toLowerCase())
  })

  const stats = {
    total: shifts.length,
    active: shifts.filter((s) => s.status === 'active').length,
    completed: shifts.filter((s) => s.status === 'completed').length,
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Shifts</h1>
        <p className="text-sm text-slate-500">Supervisor view of all field agent shifts.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs text-slate-500">Total</span>
              </div>
              <span className="text-sm font-semibold text-slate-800">{stats.total}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs text-slate-500">Active</span>
              </div>
              <span className="text-sm font-semibold text-emerald-600">{stats.active}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs text-slate-500">Completed</span>
              </div>
              <span className="text-sm font-semibold text-slate-700">{stats.completed}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 w-36 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ShiftStatus | '')}
                className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="relative flex-1" style={{ minWidth: '160px' }}>
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search agent…"
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
              <Clock className="h-4 w-4 text-cyan-500" />
              Shifts ({filtered.length})
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {shiftsQuery.isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : shiftsQuery.isError ? (
            <div className="px-6 py-8 text-center text-sm text-red-500">
              Failed to load shifts.
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              No shifts found for the selected filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Shift Start</TableHead>
                  <TableHead>Shift End</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Start Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((shift) => {
                  const agentName = agentMap.get(shift.agentId) ?? shift.agentId
                  return (
                    <TableRow key={shift.id}>
                      <TableCell>
                        <span className="font-medium text-slate-800">{agentName}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">
                          {formatTime(shift.startedAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-500">
                          {shift.endedAt ? formatTime(shift.endedAt) : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm tabular-nums text-slate-600">
                          {calcDuration(shift.startedAt, shift.endedAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {shift.startType === 'auto' ? (
                          <Badge className="bg-cyan-100 text-cyan-700 hover:bg-cyan-100">
                            Auto
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">
                            Manual
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {shift.status === 'active' ? (
                          <Badge className="gap-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">
                            Completed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Coming soon"
                          className="h-7 text-xs text-slate-400 hover:text-slate-600"
                        >
                          View
                        </Button>
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
