import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import type { OutletRecord, PointsHistoryItem, PointsSummary } from './types'

interface Props {
  id: string
  outlet: OutletRecord
}

export function PointsTab({ id, outlet }: Props) {
  const pointsQuery = useQuery({
    queryKey: ['outlet-points', id],
    queryFn: async () => {
      const r = await api.get<{ data: PointsSummary }>(`/outlets/${id}/points`)
      return r.data.data
    },
  })

  const pointsHistoryQuery = useQuery({
    queryKey: ['outlet-points-history', id],
    queryFn: async () => {
      const r = await api.get<{ data: PointsHistoryItem[] }>(`/outlets/${id}/points/history`, {
        params: { page: 1, limit: 20 },
      })
      return r.data.data
    },
  })

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm font-medium text-blue-800">Current Points Balance</p>
        <p className="mt-1 text-3xl font-bold text-blue-900">
          {pointsQuery.data?.pointsBalance ?? outlet.pointsBalance}
        </p>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Points History</CardTitle>
        </CardHeader>
        <CardContent>
          {pointsHistoryQuery.isLoading ? (
            <p className="py-4 text-center text-sm text-slate-500">Loading history...</p>
          ) : (pointsHistoryQuery.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center">
              <Star className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">No points history yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(pointsHistoryQuery.data ?? []).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div>
                    <p className="text-sm font-medium capitalize text-slate-900">
                      {entry.actionType.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-slate-400">
                      {entry.note ?? 'No note'} · {timeAgo(entry.createdAt)}
                    </p>
                  </div>
                  <p className={`text-sm font-bold ${entry.points > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {entry.points > 0 ? `+${entry.points}` : entry.points}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
