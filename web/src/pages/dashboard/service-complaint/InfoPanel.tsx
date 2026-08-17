import { timeAgo } from '@/lib/format'
import { SectionCard, InfoRow } from './shared'
import type { ComplaintDetail } from './types'

interface Props { detail: ComplaintDetail }

export function InfoPanel({ detail }: Props) {
  return (
    <SectionCard title="Complaint Details">
      <div className="space-y-3">
        <InfoRow label="Customer" value={detail.customerName ?? <span className="text-slate-400">Not captured</span>} />
        <InfoRow label="Phone" value={detail.customerPhone ?? <span className="text-slate-400">Not captured</span>} />
        <InfoRow label="Outlet" value={detail.outletName ?? <span className="text-slate-400">No outlet</span>} />
        <InfoRow label="Created" value={timeAgo(detail.createdAt)} />
        <InfoRow label="Last updated" value={timeAgo(detail.updatedAt)} />
        {detail.description ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Description</span>
            <p className="text-sm text-slate-700 leading-relaxed">{detail.description}</p>
          </div>
        ) : null}
      </div>
    </SectionCard>
  )
}
