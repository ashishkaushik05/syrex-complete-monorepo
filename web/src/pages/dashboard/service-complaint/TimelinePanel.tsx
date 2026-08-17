import { timeAgo } from '@/lib/format'
import { SectionCard } from './shared'
import type { ComplaintDetail } from './types'

interface Props { detail: ComplaintDetail }

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function TimelinePanel({ detail }: Props) {
  return (
    <SectionCard title="Activity Timeline">
      {detail.activities.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No activities recorded yet.</p>
      ) : (
        <div className="relative space-y-0">
          {detail.activities.map((activity, idx) => (
            <div key={activity.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="h-2.5 w-2.5 rounded-full bg-teal-500 ring-2 ring-white shrink-0 mt-1" />
                {idx < detail.activities.length - 1 ? (
                  <div className="w-px flex-1 bg-slate-200 min-h-[1.5rem]" />
                ) : null}
              </div>
              <div className="pb-4 flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-800">
                    {activity.action.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">
                    {timeAgo(activity.createdAt)} · {formatDate(activity.createdAt)}
                  </span>
                </div>
                {activity.actorName ? (
                  <p className="text-[10px] text-slate-500 mt-0.5">by {activity.actorName}</p>
                ) : activity.actorId === null ? (
                  <p className="text-[10px] text-slate-400 mt-0.5">Customer portal</p>
                ) : null}
                {activity.fromStatus !== activity.toStatus && activity.toStatus ? (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {activity.fromStatus ?? '—'} → {activity.toStatus}
                  </p>
                ) : null}
                {activity.note ? (
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{activity.note}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
