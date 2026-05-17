import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, Edit2, Search, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { trpcQuery, trpcMutation } from '@/lib/api'
import { usePermission } from '@/context/PermissionContext'

type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave'

type User = {
  id: string
  name: string
  email: string
  isFieldEnabled?: boolean
}

type AttendanceRecord = {
  id: string
  userId: string
  orgId: string | null
  date: string
  status: AttendanceStatus
  markedBy: string | null
  note: string | null
  markedAt: string
  userName: string | null
}

type EditState = {
  id: string
  userId: string
  userName: string | null
  date: string
  status: AttendanceStatus
  note: string
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  absent: 'bg-red-100 text-red-700 hover:bg-red-100',
  half_day: 'bg-amber-100 text-amber-700 hover:bg-amber-100',
  leave: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half Day',
  leave: 'Leave',
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function sevenDaysAgoISO() {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  return d.toISOString().slice(0, 10)
}

export function FieldSenseAttendancePage() {
  const queryClient = useQueryClient()
  const { can, isAdmin } = usePermission()
  const canAdmin = isAdmin || can('field:admin')

  const [fromDate, setFromDate] = useState(sevenDaysAgoISO())
  const [toDate, setToDate] = useState(todayISO())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | ''>('')
  const [editState, setEditState] = useState<EditState | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const [markDialogOpen, setMarkDialogOpen] = useState(false)
  const [markUserId, setMarkUserId] = useState('')
  const [markDate, setMarkDate] = useState(todayISO())
  const [markStatus, setMarkStatus] = useState<AttendanceStatus>('present')
  const [markNote, setMarkNote] = useState('')
  const [markError, setMarkError] = useState<string | null>(null)

  const attendanceQuery = useQuery({
    queryKey: ['field-attendance', fromDate, toDate],
    queryFn: () =>
      trpcQuery<AttendanceRecord[]>('fieldAttendance.list', {
        from: fromDate ? `${fromDate}T00:00:00.000Z` : undefined,
        to: toDate ? `${toDate}T23:59:59.999Z` : undefined,
        limit: 500,
      }),
  })

  const patchMutation = useMutation({
    mutationFn: (payload: { id: string; status: AttendanceStatus; note: string | null }) =>
      trpcMutation('fieldAttendance.patch', payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['field-attendance'] })
      setEditState(null)
      setEditError(null)
    },
    onError: (err: any) => {
      setEditError(err?.response?.data?.error?.message ?? 'Failed to update attendance')
    },
  })

  const usersQuery = useQuery({
    queryKey: ['users-list-for-mark'],
    queryFn: () => trpcQuery<User[]>('users.list', { limit: 200 }),
    enabled: markDialogOpen,
  })

  const markMutation = useMutation({
    mutationFn: (payload: { userId: string; date: string; status: AttendanceStatus; note?: string; orgId?: string }) =>
      trpcMutation('fieldAttendance.mark', payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['field-attendance'] })
      setMarkDialogOpen(false)
      setMarkUserId('')
      setMarkDate(todayISO())
      setMarkStatus('present')
      setMarkNote('')
      setMarkError(null)
    },
    onError: (err: any) => {
      setMarkError(err?.response?.data?.error?.message ?? 'Failed to mark attendance')
    },
  })

  const handleMark = () => {
    if (!markUserId) {
      setMarkError('Please select an agent.')
      return
    }
    markMutation.mutate({
      userId: markUserId,
      date: markDate,
      status: markStatus,
      note: markNote.trim() || undefined,
      orgId: undefined,
    })
  }

  const records = attendanceQuery.data ?? []

  const filtered = records.filter((r) => {
    const matchesSearch =
      !search ||
      (r.userName ?? '').toLowerCase().includes(search.toLowerCase())
    const matchesStatus = !statusFilter || r.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const openEdit = (record: AttendanceRecord) => {
    setEditState({
      id: record.id,
      userId: record.userId,
      userName: record.userName,
      date: record.date,
      status: record.status,
      note: record.note ?? '',
    })
    setEditError(null)
  }

  const handleSave = () => {
    if (!editState) return
    patchMutation.mutate({
      id: editState.id,
      status: editState.status,
      note: editState.note.trim() || null,
    })
  }

  const stats = {
    present: records.filter((r) => r.status === 'present').length,
    absent: records.filter((r) => r.status === 'absent').length,
    half_day: records.filter((r) => r.status === 'half_day').length,
    leave: records.filter((r) => r.status === 'leave').length,
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Attendance</h1>
          <p className="text-sm text-slate-500">Daily attendance records for all field agents.</p>
        </div>
        {canAdmin && (
          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => {
              setMarkDate(todayISO())
              setMarkUserId('')
              setMarkStatus('present')
              setMarkNote('')
              setMarkError(null)
              setMarkDialogOpen(true)
            }}
          >
            <UserPlus className="h-4 w-4" />
            Mark Attendance
          </Button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.entries(stats) as [AttendanceStatus, number][]).map(([status, count]) => (
          <Card key={status} className="py-3">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 capitalize">{STATUS_LABELS[status]}</span>
                <Badge className={STATUS_COLORS[status]}>{count}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
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
                placeholder="Search agent…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as AttendanceStatus | '')}
                className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">All</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="half_day">Half Day</option>
                <option value="leave">Leave</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-cyan-500" />
              Records ({filtered.length})
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {attendanceQuery.isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : attendanceQuery.isError ? (
            <div className="px-6 py-8 text-center text-sm text-red-500">
              Failed to load attendance records.
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              No records found for the selected filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Marked At</TableHead>
                  {canAdmin && <TableHead className="w-16" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <span className="font-medium text-slate-800">
                        {record.userName ?? record.userId}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-600">
                        {new Date(record.date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          weekday: 'short',
                        })}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[record.status]}>
                        {STATUS_LABELS[record.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="max-w-[200px] truncate text-sm text-slate-500">
                        {record.note ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-400">
                        {new Date(record.markedAt).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </TableCell>
                    {canAdmin && (
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(record)}
                          className="h-7 gap-1 text-xs text-slate-500 hover:text-slate-800"
                        >
                          <Edit2 className="h-3 w-3" />
                          Edit
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Mark Attendance Dialog */}
      <Dialog open={markDialogOpen} onOpenChange={(open) => !open && setMarkDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark Attendance</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="mark-agent">Agent</Label>
              {usersQuery.isLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <select
                  id="mark-agent"
                  value={markUserId}
                  onChange={(e) => setMarkUserId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— Select agent —</option>
                  {(usersQuery.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mark-date">Date</Label>
              <Input
                id="mark-date"
                type="date"
                value={markDate}
                onChange={(e) => setMarkDate(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mark-status">Status</Label>
              <select
                id="mark-status"
                value={markStatus}
                onChange={(e) => setMarkStatus(e.target.value as AttendanceStatus)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="half_day">Half Day</option>
                <option value="leave">Leave</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mark-note">Note (optional)</Label>
              <Input
                id="mark-note"
                placeholder="e.g. Doctor visit, field day off…"
                value={markNote}
                onChange={(e) => setMarkNote(e.target.value)}
              />
            </div>

            {markError && <p className="text-sm text-red-600">{markError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMark} disabled={markMutation.isPending}>
              {markMutation.isPending ? 'Marking…' : 'Mark'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editState !== null} onOpenChange={(open) => !open && setEditState(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Edit Attendance — {editState?.userName ?? editState?.userId}
              {editState?.date ? ` · ${new Date(editState.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
            </DialogTitle>
          </DialogHeader>

          {editState && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-status">Status</Label>
                <select
                  id="edit-status"
                  value={editState.status}
                  onChange={(e) =>
                    setEditState((s) => s && { ...s, status: e.target.value as AttendanceStatus })
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="half_day">Half Day</option>
                  <option value="leave">Leave</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-note">Note (optional)</Label>
                <Input
                  id="edit-note"
                  placeholder="e.g. Doctor visit, field day off…"
                  value={editState.note}
                  onChange={(e) => setEditState((s) => s && { ...s, note: e.target.value })}
                />
              </div>

              {editError && <p className="text-sm text-red-600">{editError}</p>}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditState(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={patchMutation.isPending}>
              {patchMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
