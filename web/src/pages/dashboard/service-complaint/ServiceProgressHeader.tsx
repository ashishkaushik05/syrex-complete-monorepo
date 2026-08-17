import type { ServiceStage, ServiceWorkspace } from './deriveServiceWorkspace'

const STAGES: Array<{ key: ServiceStage; label: string }> = [
  { key: 'raised', label: 'Raised' },
  { key: 'dispatch', label: 'Dispatch' },
  { key: 'visit', label: 'Visit' },
  { key: 'diagnostic', label: 'Diagnostic' },
  { key: 'test', label: 'Test' },
  { key: 'decision', label: 'Decision' },
  { key: 'fulfillment', label: 'Fulfillment' },
  { key: 'closed', label: 'Closed' },
]

export function ServiceProgressHeader({ workspace }: { workspace: ServiceWorkspace }) {
  const { currentStage } = workspace
  const currentIndex = STAGES.findIndex((stage) => stage.key === currentStage)

  return (
    <ol className="flex min-w-max items-center" aria-label="Service progress">
      {STAGES.map((stage, index) => {
        const completed = workspace.completedStages
          ? workspace.completedStages.includes(stage.key)
          : index < currentIndex
        const current = index === currentIndex
        return (
          <li key={stage.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <span
                aria-current={current ? 'step' : undefined}
                className={[
                  'grid h-7 w-7 place-items-center rounded-full text-xs font-semibold',
                  current ? 'bg-teal-600 text-white ring-2 ring-teal-200 ring-offset-1'
                    : completed ? 'bg-teal-100 text-teal-700'
                    : 'bg-slate-100 text-slate-400',
                ].join(' ')}
              >
                {completed ? '✓' : index + 1}
              </span>
              <span className={`text-[10px] font-medium ${current ? 'text-teal-700' : completed ? 'text-slate-600' : 'text-slate-400'}`}>
                {stage.label}
              </span>
            </div>
            {index < STAGES.length - 1 ? (
              <span className={`mb-4 h-0.5 w-6 ${completed ? 'bg-teal-300' : 'bg-slate-200'}`} />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
