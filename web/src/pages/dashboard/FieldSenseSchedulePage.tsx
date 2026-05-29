import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlarmClock, Clock, Edit2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { trpcQuery, trpcMutation } from '@/lib/api'

type Schedule = {
  id: string
  userId: string
  orgId: string | null
  autoStartTime: string
  timezone: string
  isEnabled: boolean
  updatedAt: string
}

type User = {
  id: string
  name: string
  email: string
  isFieldEnabled?: boolean
}

type UsersListResponse = {
  items: User[]
  nextCursor: string | null
}

type EditState = {
  userId: string
  userName: string
  autoStartTime: string
  timezone: string
  isEnabled: boolean
  scheduleId: string | null
}

const TIMEZONE_GROUPS: { label: string; zones: string[] }[] = [
  {
    label: 'Asia',
    zones: [
      'Asia/Kolkata',
      'Asia/Kabul',
      'Asia/Almaty',
      'Asia/Baghdad',
      'Asia/Baku',
      'Asia/Bangkok',
      'Asia/Colombo',
      'Asia/Dhaka',
      'Asia/Dubai',
      'Asia/Jakarta',
      'Asia/Karachi',
      'Asia/Kathmandu',
      'Asia/Kuwait',
      'Asia/Muscat',
      'Asia/Riyadh',
      'Asia/Seoul',
      'Asia/Shanghai',
      'Asia/Singapore',
      'Asia/Taipei',
      'Asia/Tashkent',
      'Asia/Tbilisi',
      'Asia/Tehran',
      'Asia/Tokyo',
      'Asia/Yerevan',
    ],
  },
  {
    label: 'Europe',
    zones: [
      'Europe/Amsterdam',
      'Europe/Berlin',
      'Europe/Brussels',
      'Europe/Istanbul',
      'Europe/Kyiv',
      'Europe/London',
      'Europe/Madrid',
      'Europe/Moscow',
      'Europe/Paris',
      'Europe/Rome',
      'Europe/Stockholm',
      'Europe/Warsaw',
      'Europe/Zurich',
    ],
  },
  {
    label: 'Americas',
    zones: [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Toronto',
      'America/Vancouver',
      'America/Bogota',
      'America/Buenos_Aires',
      'America/Lima',
      'America/Mexico_City',
      'America/Santiago',
      'America/Sao_Paulo',
    ],
  },
  {
    label: 'Africa',
    zones: [
      'Africa/Cairo',
      'Africa/Casablanca',
      'Africa/Johannesburg',
      'Africa/Lagos',
      'Africa/Nairobi',
    ],
  },
  {
    label: 'Pacific / Other',
    zones: [
      'Australia/Melbourne',
      'Australia/Perth',
      'Pacific/Auckland',
      'Pacific/Sydney',
      'UTC',
    ],
  },
]

export function FieldSenseSchedulePage() {
  const queryClient = useQueryClient()
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const schedulesQuery = useQuery({
    queryKey: ['field-schedules'],
    queryFn: () => trpcQuery<Schedule[]>('fieldSchedule.list', { limit: 200 }),
  })

  const usersQuery = useQuery({
    queryKey: ['field-users'],
    queryFn: async () => {
      const page = await trpcQuery<UsersListResponse>('users.list', { limit: 100 })
      return (page.items ?? []).filter((u: User) => u.isFieldEnabled) as User[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      userId: string
      autoStartTime: string
      timezone: string
      isEnabled: boolean
    }) => {
      return trpcMutation('fieldSchedule.setForUser', payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['field-schedules'] })
      setEditState(null)
      setSaveError(null)
    },
    onError: (err: any) => {
      setSaveError(err?.response?.data?.error?.message ?? 'Failed to save schedule')
    },
  })

  const scheduleByUserId = new Map<string, Schedule>(
    (schedulesQuery.data ?? []).map((s) => [s.userId, s]),
  )

  const fieldUsers = usersQuery.data ?? []

  const openEdit = (user: User) => {
    const existing = scheduleByUserId.get(user.id)
    setEditState({
      userId: user.id,
      userName: user.name,
      autoStartTime: existing?.autoStartTime ?? '09:00',
      timezone: existing?.timezone ?? 'Asia/Kolkata',
      isEnabled: existing?.isEnabled ?? true,
      scheduleId: existing?.id ?? null,
    })
    setSaveError(null)
  }

  const handleSave = () => {
    if (!editState) return
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
    if (!timePattern.test(editState.autoStartTime)) {
      setSaveError('Time must be in HH:MM format (24-hour)')
      return
    }
    saveMutation.mutate({
      userId: editState.userId,
      autoStartTime: editState.autoStartTime,
      timezone: editState.timezone,
      isEnabled: editState.isEnabled,
    })
  }

  const isLoading = schedulesQuery.isLoading || usersQuery.isLoading
  const error = schedulesQuery.error || usersQuery.error

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Field Schedule</h1>
        <p className="text-sm text-slate-500">Configure auto-start shift schedules for field agents.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Failed to load schedules. Please refresh.
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">
            <div className="flex items-center gap-2">
              <AlarmClock className="h-4 w-4 text-cyan-500" />
              Field Agents ({fieldUsers.length})
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : fieldUsers.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              No field agents enabled yet. Enable Field Sense for users from the Users page.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Auto-Start Time</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Auto-Start</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {fieldUsers.map((user) => {
                  const schedule = scheduleByUserId.get(user.id)
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-800">{user.name}</p>
                          <p className="text-xs text-slate-400">{user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {schedule ? (
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            <span className="font-mono text-sm">{schedule.autoStartTime}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">Not set</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">{schedule?.timezone ?? '—'}</span>
                      </TableCell>
                      <TableCell>
                        {schedule ? (
                          <Badge
                            className={
                              schedule.isEnabled
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-100'
                            }
                          >
                            {schedule.isEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-400">
                          {schedule
                            ? new Date(schedule.updatedAt).toLocaleDateString()
                            : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(user)}
                          className="h-7 gap-1 text-xs text-slate-500 hover:text-slate-800"
                        >
                          <Edit2 className="h-3 w-3" />
                          {schedule ? 'Edit' : 'Set'}
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

      {/* Edit Dialog */}
      <Dialog open={editState !== null} onOpenChange={(open) => !open && setEditState(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editState?.scheduleId ? 'Edit Schedule' : 'Set Schedule'} — {editState?.userName}
            </DialogTitle>
          </DialogHeader>

          {editState && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="auto-start-time">Auto-Start Time (24-hour)</Label>
                <Input
                  id="auto-start-time"
                  type="time"
                  value={editState.autoStartTime}
                  onChange={(e) => setEditState((s) => s && { ...s, autoStartTime: e.target.value })}
                  className="font-mono"
                />
                <p className="text-xs text-slate-400">
                  Shift auto-starts within ±2 minutes of this time.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <select
                  id="timezone"
                  value={editState.timezone}
                  onChange={(e) => setEditState((s) => s && { ...s, timezone: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {TIMEZONE_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.zones.map((tz) => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="is-enabled"
                  type="checkbox"
                  checked={editState.isEnabled}
                  onChange={(e) => setEditState((s) => s && { ...s, isEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-cyan-600"
                />
                <Label htmlFor="is-enabled" className="cursor-pointer select-none">
                  Enable auto-start
                </Label>
              </div>

              {saveError && (
                <p className="text-sm text-red-600">{saveError}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditState(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
