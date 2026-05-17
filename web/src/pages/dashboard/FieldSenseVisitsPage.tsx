import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { trpcQuery } from '@/lib/api'

type Visit = {
  id: string
  agentId: string
  shiftId: string
  orgId: string
  lat: number
  lng: number
  description: string | null
  audioUrl: string | null
  outletId: string | null
  customerId: string | null
  recordedAt: string
  createdAt: string
}

type User = { id: string; name: string; email: string }

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function FieldSenseVisitsPage() {
  const [fromDate, setFromDate] = useState(todayISO())
  const [toDate, setToDate] = useState(todayISO())
  const [search, setSearch] = useState('')

  const visitsQuery = useQuery({
    queryKey: ['field-visits', fromDate, toDate],
    queryFn: () =>
      trpcQuery<Visit[]>('fieldVisits.list', {
        from: `${fromDate}T00:00:00.000Z`,
        to: `${toDate}T23:59:59.999Z`,
        limit: 200,
      }),
  })

  const usersQuery = useQuery({
    queryKey: ['users-list-for-visits'],
    queryFn: () => trpcQuery<User[]>('users.list', { limit: 200 }),
  })

  const usersMap = new Map<string, string>(
    (usersQuery.data ?? []).map((u) => [u.id, u.name]),
  )

  const visits = visitsQuery.data ?? []

  const filtered = visits.filter((v) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (v.description ?? '').toLowerCase().includes(q) ||
      (v.outletId ?? '').toLowerCase().includes(q)
    )
  })

  const todayStr = todayISO()
  const visitsToday = visits.filter((v) => v.recordedAt.slice(0, 10) === todayStr).length
  const uniqueAgents = new Set(visits.map((v) => v.agentId)).size

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Visits</h1>
        <p className="text-sm text-slate-500">Field agent visit log.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Total visits</span>
              <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{visits.length}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Visits today</span>
              <Badge className="bg-cyan-100 text-cyan-700 hover:bg-cyan-100">{visitsToday}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Unique agents</span>
              <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100">{uniqueAgents}</Badge>
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
            <div className="relative flex-1" style={{ minWidth: '160px' }}>
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search outlet or description…"
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
              <MapPin className="h-4 w-4 text-cyan-500" />
              Visits ({filtered.length})
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {visitsQuery.isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : visitsQuery.isError ? (
            <div className="px-6 py-8 text-center text-sm text-red-500">
              Failed to load visit records.
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              No visits found for the selected filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Outlet ID</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>GPS</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Shift</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((visit) => (
                  <TableRow key={visit.id}>
                    <TableCell>
                      <span className="font-medium text-slate-800">
                        {usersMap.get(visit.agentId) ?? visit.agentId}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="max-w-[120px] truncate text-sm text-slate-600">
                        {visit.outletId ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-500">
                        {visit.description
                          ? visit.description.slice(0, 40) +
                            (visit.description.length > 40 ? '…' : '')
                          : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-500">
                        {visit.lat.toFixed(4)}, {visit.lng.toFixed(4)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-400">
                        {new Date(visit.recordedAt).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-slate-500">
                        {visit.shiftId.slice(0, 8)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
