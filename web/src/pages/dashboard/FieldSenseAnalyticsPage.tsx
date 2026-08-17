import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { trpcQuery } from '@/lib/api'

type HealthBreakdown = {
  ACTIVE: number
  DELAYED: number
  STALE: number
  OFFLINE: number
  GPS_DISABLED: number
  SHIFT_DESYNC: number
}

type AnalyticsSummary = {
  orgId: string
  date: string
  activeShiftsToday: number
  visitsToday: number
  stopsToday: number
  avgPendingQueueDepth: number
  healthBreakdown: HealthBreakdown
  topErrors: Array<{ errorCode: string; count: number }>
  attendanceRate: number
  attendanceRecords: number
  approximateMetrics: string[]
}

function attendanceColor(rate: number): string {
  if (rate >= 80) return 'text-emerald-600'
  if (rate >= 60) return 'text-amber-600'
  return 'text-red-600'
}

function queueColor(depth: number): string {
  if (depth < 10) return 'text-emerald-600'
  if (depth <= 50) return 'text-amber-600'
  return 'text-red-600'
}

const healthStateMeta: Record<
  keyof HealthBreakdown,
  { label: string; badgeClass: string; valueClass: string }
> = {
  ACTIVE: {
    label: 'Active',
    badgeClass: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
    valueClass: 'text-emerald-600',
  },
  DELAYED: {
    label: 'Delayed',
    badgeClass: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100',
    valueClass: 'text-yellow-600',
  },
  STALE: {
    label: 'Stale',
    badgeClass: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
    valueClass: 'text-orange-600',
  },
  OFFLINE: {
    label: 'Offline',
    badgeClass: 'bg-red-100 text-red-700 hover:bg-red-100',
    valueClass: 'text-red-600',
  },
  GPS_DISABLED: {
    label: 'GPS Off',
    badgeClass: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
    valueClass: 'text-purple-600',
  },
  SHIFT_DESYNC: {
    label: 'Shift Desync',
    badgeClass: 'bg-slate-100 text-slate-600 hover:bg-slate-100',
    valueClass: 'text-slate-600',
  },
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <Skeleton className="mb-2 h-4 w-24" />
        <Skeleton className="h-7 w-16" />
      </CardContent>
    </Card>
  )
}

export function FieldSenseAnalyticsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['fieldAnalytics.summary'],
    queryFn: () => trpcQuery<AnalyticsSummary>('fieldAnalytics.summary', {}),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-500">
          Aggregate operational trends for today's field activity.
        </p>
      </div>

      {isError && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-amber-800">Analytics unavailable</p>
              <p className="text-xs text-amber-700">
                The analytics endpoint could not be reached. Check backend permissions and org context.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 1 — Today at a glance */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          {data ? `Today at a glance (${data.date})` : 'Today at a glance'}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {isLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : !isError && data ? (
            <>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500">Active shifts</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{data.activeShiftsToday}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500">Visits logged</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{data.visitsToday}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500">Stops recorded</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{data.stopsToday}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500">Attendance rate</p>
                  <p className={`mt-1 text-2xl font-semibold ${attendanceColor(data.attendanceRate)}`}>
                    {data.attendanceRate.toFixed(1)}%
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {data.attendanceRecords} record{data.attendanceRecords !== 1 ? 's' : ''}
                  </p>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>

      {/* Section 2 — Agent health breakdown */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Agent health breakdown
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {isLoading ? (
            <>
              {[...Array(6)].map((_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </>
          ) : !isError && data ? (
            (Object.keys(healthStateMeta) as Array<keyof HealthBreakdown>).map((state) => {
              const meta = healthStateMeta[state]
              return (
                <Card key={state}>
                  <CardContent className="p-4">
                    <Badge className={`mb-2 ${meta.badgeClass}`}>{meta.label}</Badge>
                    <p className={`text-2xl font-semibold ${meta.valueClass}`}>
                      {data.healthBreakdown[state]}
                    </p>
                  </CardContent>
                </Card>
              )
            })
          ) : null}
        </div>
      </div>

      {/* Section 3 — Queue depth indicator */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Sync queue
        </p>
        {isLoading ? (
          <div className="max-w-xs">
            <StatCardSkeleton />
          </div>
        ) : !isError && data ? (
          <Card className="max-w-xs">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">Avg pending queue</p>
              <p className={`mt-1 text-2xl font-semibold ${queueColor(data.avgPendingQueueDepth)}`}>
                {data.avgPendingQueueDepth.toFixed(1)}{' '}
                <span className="text-sm font-normal text-slate-500">points</span>
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Section 4 — Top sync errors */}
      {!isLoading && !isError && data && data.topErrors.length > 0 && (
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-700">Top sync errors</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Error Code</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topErrors.slice(0, 5).map((row) => (
                    <TableRow key={row.errorCode}>
                      <TableCell>
                        <Badge className="bg-red-50 font-mono text-[11px] text-red-600 hover:bg-red-50">
                          {row.errorCode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-700">
                        {row.count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {!isLoading && !isError && data && data.approximateMetrics.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-800">
            Approximate metrics: {data.approximateMetrics.join(', ')}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
