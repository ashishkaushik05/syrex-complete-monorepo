import type { ReactNode } from 'react'
import { CircleAlert, Clock3 } from 'lucide-react'

import { SectionCard } from './shared'
import type { ServiceWorkspace } from './deriveServiceWorkspace'

export function CurrentServiceTask({
  workspace,
  children,
}: {
  workspace: ServiceWorkspace
  children?: ReactNode
}) {
  const waiting = workspace.task === 'waiting'
  const final = workspace.task === 'final'
  const hasControls = !waiting && !final

  return (
    <SectionCard title="Current Step" className={waiting || final ? 'border-slate-200' : 'border-teal-200 ring-1 ring-teal-100'}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${waiting || final ? 'bg-slate-100 text-slate-500' : 'bg-teal-100 text-teal-700'}`}>
          {waiting || final ? <Clock3 className="h-4 w-4" /> : <span className="text-sm font-bold">→</span>}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-slate-900">{workspace.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{workspace.instruction}</p>
        </div>
      </div>
      {workspace.blockers.length > 0 ? (
        <div className="mt-4 space-y-2">
          {workspace.blockers.map((blocker) => (
            <div key={blocker} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{blocker}</span>
            </div>
          ))}
        </div>
      ) : null}
      {hasControls && children ? <div className="mt-5 border-t border-slate-200 pt-4">{children}</div> : null}
    </SectionCard>
  )
}
