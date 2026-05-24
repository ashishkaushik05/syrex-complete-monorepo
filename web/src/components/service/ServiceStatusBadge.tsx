import { Badge } from '@/components/ui/badge'

export type ComplaintStatus =
  | 'raised'
  | 'assigned'
  | 'visit'
  | 'test_result_submitted'
  | 'retest_requested'
  | 'resolved'
  | 'telephonic_closure'
  | 'cancelled'

export type WarrantyStatus = 'pending' | 'approved' | 'rejected'

export const STATUS_CONFIG: Record<
  ComplaintStatus,
  { label: string; bg: string; text: string; dot: string; order: number; isFinal: boolean }
> = {
  raised:               { label: 'Raised',             bg: 'bg-slate-100',   text: 'text-slate-700',   dot: 'bg-slate-400',   order: 0, isFinal: false },
  assigned:             { label: 'Assigned',            bg: 'bg-orange-100',  text: 'text-orange-700',  dot: 'bg-orange-500',  order: 1, isFinal: false },
  visit:                { label: 'Site Visit',          bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500',    order: 2, isFinal: false },
  test_result_submitted:{ label: 'Test Submitted',      bg: 'bg-indigo-100',  text: 'text-indigo-700',  dot: 'bg-indigo-500',  order: 3, isFinal: false },
  retest_requested:     { label: 'Retest Requested',    bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500',   order: 3, isFinal: false },
  resolved:             { label: 'Resolved',            bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', order: 4, isFinal: true  },
  telephonic_closure:   { label: 'Telephonic Closure',  bg: 'bg-cyan-100',    text: 'text-cyan-700',    dot: 'bg-cyan-500',    order: 4, isFinal: true  },
  cancelled:            { label: 'Cancelled',           bg: 'bg-rose-100',    text: 'text-rose-700',    dot: 'bg-rose-500',    order: 4, isFinal: true  },
}

export const WARRANTY_CONFIG: Record<
  WarrantyStatus,
  { label: string; bg: string; text: string }
> = {
  pending:  { label: 'Pending',  bg: 'bg-amber-100',   text: 'text-amber-700'   },
  approved: { label: 'Approved', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  rejected: { label: 'Rejected', bg: 'bg-rose-100',    text: 'text-rose-700'    },
}

export const PIPELINE_STAGES: Array<{ statuses: ComplaintStatus[]; label: string }> = [
  { statuses: ['raised'],                        label: 'Raised'       },
  { statuses: ['assigned'],                      label: 'Assigned'     },
  { statuses: ['visit'],                         label: 'Site Visit'   },
  { statuses: ['test_result_submitted'],         label: 'Test Report'  },
  { statuses: ['retest_requested'],              label: 'Retest'       },
  { statuses: ['resolved','telephonic_closure','cancelled'], label: 'Closed' },
]

export const FINAL_STATUSES = new Set<ComplaintStatus>(['resolved', 'telephonic_closure', 'cancelled'])

interface ServiceStatusBadgeProps {
  status: ComplaintStatus
  size?: 'sm' | 'md'
}

export function ServiceStatusBadge({ status, size = 'md' }: ServiceStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status as ComplaintStatus] ?? {
    label: status,
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    dot: 'bg-gray-400',
  }
  return (
    <Badge className={`${cfg.bg} ${cfg.text} font-medium border-0 ${size === 'sm' ? 'text-xs px-2 py-0.5' : ''}`}>
      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </Badge>
  )
}

interface WarrantyStatusBadgeProps {
  status: WarrantyStatus
}

export function WarrantyStatusBadge({ status }: WarrantyStatusBadgeProps) {
  const cfg = WARRANTY_CONFIG[status as WarrantyStatus] ?? {
    label: status,
    bg: 'bg-gray-100',
    text: 'text-gray-700',
  }
  return (
    <Badge className={`${cfg.bg} ${cfg.text} font-medium border-0`}>
      {cfg.label}
    </Badge>
  )
}

// Horizontal status pipeline for the detail page
interface StatusPipelineProps {
  current: ComplaintStatus
}

export function StatusPipeline({ current }: StatusPipelineProps) {
  const currentOrder = STATUS_CONFIG[current]?.order ?? 0
  const isFinal = FINAL_STATUSES.has(current)

  const mainStages: Array<{ key: string; label: string; reached: boolean; active: boolean }> = [
    { key: 'raised',                 label: 'Raised',       reached: currentOrder >= 0, active: current === 'raised'                },
    { key: 'assigned',               label: 'Assigned',     reached: currentOrder >= 1, active: current === 'assigned'              },
    { key: 'visit',                  label: 'Site Visit',   reached: currentOrder >= 2, active: current === 'visit'                 },
    { key: 'test_result_submitted',  label: 'Test Report',  reached: currentOrder >= 3, active: current === 'test_result_submitted' || current === 'retest_requested' },
    { key: 'closed',                 label: isFinal ? STATUS_CONFIG[current]?.label : 'Closed', reached: isFinal, active: isFinal   },
  ]

  return (
    <div className="flex items-center gap-0">
      {mainStages.map((stage, idx) => (
        <div key={stage.key} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={[
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all',
                stage.active
                  ? 'bg-teal-600 text-white ring-2 ring-teal-300 ring-offset-1'
                  : stage.reached
                    ? 'bg-teal-100 text-teal-700'
                    : 'bg-slate-100 text-slate-400',
              ].join(' ')}
            >
              {stage.reached && !stage.active ? '✓' : idx + 1}
            </div>
            <span
              className={`text-[10px] font-medium whitespace-nowrap ${
                stage.active ? 'text-teal-700' : stage.reached ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              {stage.label}
            </span>
          </div>
          {idx < mainStages.length - 1 ? (
            <div
              className={`mb-4 h-0.5 w-8 transition-all ${stage.reached && !stage.active ? 'bg-teal-400' : 'bg-slate-200'}`}
            />
          ) : null}
        </div>
      ))}
      {current === 'retest_requested' ? (
        <div className="ml-2 flex items-center gap-1">
          <span className="text-[10px] text-amber-600 font-medium bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
            ↺ Retest Loop
          </span>
        </div>
      ) : null}
    </div>
  )
}
