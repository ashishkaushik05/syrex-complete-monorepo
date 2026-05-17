import type { ReactNode } from 'react'
import { AlertCircle, Inbox, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function PageLoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-600">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {label}
    </div>
  )
}

export function PageErrorState({
  title = 'Unable to load data',
  description,
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/60 p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-red-100 p-1.5 text-red-700">
          <AlertCircle className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-900">{title}</p>
          <p className="mt-1 text-sm text-red-800">{description ?? 'Please try again.'}</p>
          {onRetry ? (
            <Button variant="outline" className="mt-3 border-red-300 bg-white" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function PageEmptyState({
  title = 'No records found',
  description,
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
        <Inbox className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{description ?? 'Try adjusting filters or create a new record.'}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
