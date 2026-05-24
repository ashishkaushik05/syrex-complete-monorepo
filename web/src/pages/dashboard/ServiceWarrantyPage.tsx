import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePermission } from '@/context/PermissionContext'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type ComplaintRow = {
  id: string
  complaintNumber: string
  status: string
  title: string | null
  outletName: string | null
  serials: string[]
  createdAt: string
  updatedAt: string
}

export function ServiceWarrantyPage() {
  const navigate = useNavigate()
  const { can } = usePermission()

  // FP-047: query is always called (hooks must not be called conditionally)
  const query = useQuery<ComplaintRow[]>({
    queryKey: ['service', 'warranty-queue'],
    enabled: can('service:approve'),
    queryFn: async () => {
      const response = await api.get('/tickets', {
        params: { status: 'test_result_submitted', limit: 100 },
      })
      const payload = response.data as any
      return Array.isArray(payload?.data?.data) ? payload.data.data : []
    },
  })

  // FP-047: permission guard — rendered after all hooks
  if (!can('service:approve')) {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">You don&apos;t have permission to access this page.</div>
  }

  const rows = query.data ?? []

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Pending Review</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {query.isLoading ? '—' : rows.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-indigo-100 bg-indigo-50 shadow-sm">
          <CardContent className="px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">Oldest Waiting</p>
            <p className="mt-1 text-xl font-bold text-indigo-900">
              {(() => {
                if (query.isLoading || rows.length === 0) return '—'
                const oldest = rows.reduce((a, b) => (a.createdAt < b.createdAt ? a : b))
                return oldest ? timeAgo(oldest.createdAt) : '—'
              })()}
            </p>
          </CardContent>
        </Card>
        <Card className="border-amber-100 bg-amber-50 shadow-sm">
          <CardContent className="px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">Action Required</p>
            <p className="mt-1 text-sm font-semibold text-amber-800">
              Approve or reject each warranty claim
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Queue card */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3 pt-5 px-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Warranty Decision Queue</CardTitle>
              <p className="text-sm text-slate-500 mt-0.5">
                Complaints with a submitted test result awaiting warranty approval or rejection.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="shrink-0"
            >
              {query.isFetching ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Refreshing
                </span>
              ) : 'Refresh'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {query.isLoading ? (
            <div className="flex items-center gap-3 py-8 text-slate-400 justify-center">
              <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-sm">Loading warranty queue…</span>
            </div>
          ) : query.isError ? (
            <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-sm">{apiErrorMessage(query.error, 'Unable to load warranty queue.')}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <svg className="h-6 w-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-700">All clear</p>
              <p className="text-xs text-slate-400">No complaints awaiting warranty decision.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-xs">Complaint</TableHead>
                    <TableHead className="text-xs">Outlet</TableHead>
                    <TableHead className="text-xs">Serials</TableHead>
                    <TableHead className="text-xs">Submitted</TableHead>
                    <TableHead className="text-xs">Waiting</TableHead>
                    <TableHead className="text-xs" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const now = new Date()
                    const waitDays = Math.floor(
                      (now.getTime() - new Date(row.updatedAt).getTime()) / 86_400_000
                    )
                    const isUrgent = waitDays >= 2
                    return (
                      <TableRow key={row.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/dashboard/service/complaints/${row.id}`)}>
                        <TableCell>
                          <div>
                            <code className="text-sm font-mono font-semibold text-slate-800">
                              {row.complaintNumber}
                            </code>
                            {row.title ? (
                              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[180px]">{row.title}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">{row.outletName ?? '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(row.serials ?? []).slice(0, 2).map((serial) => (
                              <code key={serial} className="text-[10px] font-mono bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
                                {serial}
                              </code>
                            ))}
                            {(row.serials ?? []).length > 2 ? (
                              <span className="text-[10px] text-slate-400">+{(row.serials ?? []).length - 2}</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{timeAgo(row.createdAt)}</TableCell>
                        <TableCell>
                          <Badge className={`border-0 text-xs ${isUrgent ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                            {waitDays === 0 ? 'Today' : `${waitDays}d`}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/service/complaints/${row.id}`) }}
                            className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
                          >
                            Review →
                          </Button>
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

      {/* Info card */}
      <Card className="border-slate-200 bg-slate-50 shadow-sm">
        <CardContent className="px-5 py-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">How Warranty Decisions Work</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { step: '1', label: 'Test Submitted', desc: 'ASI/SE submits test report with verdict and supporting form data.' },
              { step: '2', label: 'Warranty Review', desc: 'Approver reviews findings and decides to approve or reject the warranty claim.' },
              { step: '3', label: 'Resolution', desc: 'On approval, replacement is dispatched. On rejection, complaint is closed.' },
            ].map(({ step, label, desc }) => (
              <div key={step} className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
                  {step}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">{label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
