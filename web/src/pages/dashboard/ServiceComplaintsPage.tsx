import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
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
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type ComplaintStatus =
  | 'raised'
  | 'assigned'
  | 'visit'
  | 'test_result_submitted'
  | 'retest_requested'
  | 'resolved'
  | 'telephonic_closure'
  | 'cancelled'

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

type OutletOption = {
  id: string
  name: string
  outletCode: string | null
}

const STATUS_TABS: Array<{ key: 'all' | ComplaintStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'raised', label: 'Raised' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'visit', label: 'Visit' },
  { key: 'test_result_submitted', label: 'Test Submitted' },
  { key: 'retest_requested', label: 'Retest' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'telephonic_closure', label: 'Telephonic' },
  { key: 'cancelled', label: 'Cancelled' },
]

function normalizeRows(payload: unknown): { rows: ComplaintRow[]; tabCounts: Record<string, number> } {
  const data = payload as TicketListPayload | undefined
  const rows = Array.isArray(data?.data) ? data.data : []
  const counts = data?.tabCounts ?? {}
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
    },
  }
}

function statusTone(status: ComplaintStatus) {
  if (status === 'resolved') return 'bg-emerald-100 text-emerald-700'
  if (status === 'telephonic_closure') return 'bg-cyan-100 text-cyan-700'
  if (status === 'cancelled') return 'bg-rose-100 text-rose-700'
  if (status === 'assigned') return 'bg-orange-100 text-orange-700'
  if (status === 'retest_requested') return 'bg-amber-100 text-amber-700'
  if (status === 'test_result_submitted') return 'bg-indigo-100 text-indigo-700'
  if (status === 'visit') return 'bg-blue-100 text-blue-700'
  return 'bg-slate-100 text-slate-700'
}

type SerialLine = { serialNumber: string; notes: string }

export function ServiceComplaintsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<'all' | ComplaintStatus>('all')
  const [q, setQ] = useState('')

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createOutletId, setCreateOutletId] = useState('')
  const [serialLines, setSerialLines] = useState<SerialLine[]>([{ serialNumber: '', notes: '' }])
  const [createError, setCreateError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['service', 'complaints', statusFilter, q],
    queryFn: async () => {
      const response = await api.get<{ data: TicketListPayload }>('/tickets', {
        params: {
          page: 1,
          limit: 100,
          status: statusFilter === 'all' ? undefined : statusFilter,
          q: q.trim() ? q.trim() : undefined,
        },
      })
      return normalizeRows(response.data)
    },
  })

  const outletsQuery = useQuery<OutletOption[]>({
    queryKey: ['outlets-list-for-create-complaint'],
    enabled: createOpen,
    queryFn: async () => {
      const response = await api.get<{ data: { data: OutletOption[] } }>('/outlets', {
        params: { page: 1, limit: 200 },
      })
      const payload = response.data as any
      if (Array.isArray(payload?.data?.data)) return payload.data.data
      if (Array.isArray(payload?.data)) return payload.data
      return []
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const validLines = serialLines.filter((line) => line.serialNumber.trim())
      if (validLines.length === 0) throw new Error('At least one serial number is required')
      const response = await api.post<{ data: { data: ComplaintRow } }>('/tickets', {
        title: createTitle.trim() || undefined,
        description: createDescription.trim() || undefined,
        outletId: createOutletId || undefined,
        lines: validLines.map((line) => ({
          serialNumber: line.serialNumber.trim(),
          notes: line.notes.trim() || undefined,
        })),
      })
      const payload = response.data as any
      return payload?.data?.data ?? payload?.data ?? payload
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['service', 'complaints'] })
      setCreateOpen(false)
      resetCreateForm()
      if (created?.id) {
        navigate(`/dashboard/service/complaints/${created.id}`)
      }
    },
    onError: (error) => {
      setCreateError(apiErrorMessage(error, 'Failed to create complaint'))
    },
  })

  function resetCreateForm() {
    setCreateTitle('')
    setCreateDescription('')
    setCreateOutletId('')
    setSerialLines([{ serialNumber: '', notes: '' }])
    setCreateError(null)
  }

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open)
    if (!open) resetCreateForm()
  }

  function updateSerialLine(index: number, field: keyof SerialLine, value: string) {
    setSerialLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)))
  }

  function addSerialLine() {
    setSerialLines((prev) => [...prev, { serialNumber: '', notes: '' }])
  }

  function removeSerialLine(index: number) {
    setSerialLines((prev) => prev.filter((_, i) => i !== index))
  }

  const loadError = query.isError ? apiErrorMessage(query.error, 'Unable to load complaints.') : null
  const rows = query.data?.rows ?? []
  const counts = query.data?.tabCounts ?? { all: 0 }

  const visibleRows = useMemo(() => rows, [rows])

  return (
    <>
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Service Complaints</CardTitle>
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            New Complaint
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((tab) => (
              <Button
                key={tab.key}
                type="button"
                variant={statusFilter === tab.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(tab.key)}
              >
                {tab.label} ({counts[tab.key as keyof typeof counts] ?? 0})
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search complaint number, serial, title"
            />
            <Button type="button" variant="outline" onClick={() => setQ('')}>
              Clear
            </Button>
          </div>

          {query.isLoading ? <p className="text-sm text-slate-500">Loading complaints...</p> : null}
          {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}

          {!query.isLoading && !query.isError ? (
            visibleRows.length === 0 ? (
              <p className="text-sm text-slate-500">No service complaints found.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Complaint</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Outlet</TableHead>
                      <TableHead>Serials</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/dashboard/service/complaints/${row.id}`)}
                      >
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-900">{row.complaintNumber}</span>
                            <span className="text-xs text-slate-500">{row.title ?? 'Untitled complaint'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusTone(row.status)}>{row.status}</Badge>
                        </TableCell>
                        <TableCell>{row.outletName ?? '-'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(row.serials ?? []).slice(0, 2).map((serial) => (
                              <Badge key={serial} variant="secondary" className="bg-slate-100 text-slate-700">
                                {serial}
                              </Badge>
                            ))}
                            {(row.serials ?? []).length > 2 ? (
                              <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                                +{(row.serials ?? []).length - 2}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{timeAgo(row.updatedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Service Complaint</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Outlet</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={createOutletId}
                onChange={(event) => setCreateOutletId(event.target.value)}
              >
                <option value="">No outlet (walk-in)</option>
                {outletsQuery.isLoading ? (
                  <option disabled>Loading outlets...</option>
                ) : (
                  (outletsQuery.data ?? []).map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.name}{outlet.outletCode ? ` (${outlet.outletCode})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Title (optional)</Label>
              <Input
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder="Brief description of the complaint"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <textarea
                className="min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                placeholder="Detailed description of the issue"
                maxLength={4000}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Serial Numbers</Label>
                <Button type="button" variant="outline" size="sm" onClick={addSerialLine}>
                  + Add Serial
                </Button>
              </div>
              {serialLines.map((line, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={line.serialNumber}
                      onChange={(event) => updateSerialLine(index, 'serialNumber', event.target.value)}
                      placeholder={`Serial number ${index + 1}`}
                      className="flex-1"
                    />
                    {serialLines.length > 1 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeSerialLine(index)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <Input
                    value={line.notes}
                    onChange={(event) => updateSerialLine(index, 'notes', event.target.value)}
                    placeholder="Notes for this serial (optional)"
                  />
                </div>
              ))}
            </div>

            {createError ? <p className="text-sm text-red-600">{createError}</p> : null}
          </div>

          <DialogFooter>
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
            >
              {createMutation.isPending ? 'Creating...' : 'Create Complaint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
