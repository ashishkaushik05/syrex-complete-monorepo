import { Badge } from '@/components/ui/badge'
import { WarrantyStatusBadge } from '@/components/service/ServiceStatusBadge'
import { SectionCard, VerdictBadge } from './shared'
import type { ComplaintDetail, FormSubmission, WarehouseOption } from './types'

interface Props {
  detail: ComplaintDetail
  submissions: FormSubmission[]
  warehouses: WarehouseOption[]
  onViewReplacementOrder: (orderId: string) => void
  showResolution?: boolean
}

function formatDate(value: string | null) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function readableValue(rawValue: string) {
  if (rawValue === 'true') return 'Yes'
  if (rawValue === 'false') return 'No'
  try {
    const parsed = JSON.parse(rawValue)
    if (Array.isArray(parsed)) return parsed.join(', ')
  } catch {
    // Most form values are plain text and should be displayed unchanged.
  }
  return rawValue || 'Not provided'
}

function fallbackLabel(fieldKey: string) {
  return fieldKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function hasStructuredData(value: unknown) {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

export function ServiceHistoryPanel({
  detail,
  submissions,
  warehouses,
  onViewReplacementOrder,
  showResolution = true,
}: Props) {
  const completedAt = detail.closedAt ?? detail.cancelledAt
  const completionLabel = detail.status === 'cancelled' ? 'Cancelled at' : 'Closed at'
  const resolution = detail.resolutionNote ?? detail.telephonicReason
  const warranty = detail.warrantyDecision
  const sourceWarehouse = warehouses.find((warehouse) => warehouse.id === warranty?.sourceWarehouseId)

  return (
    <div className="space-y-4">
      {showResolution ? <SectionCard title="Resolution Summary">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Final status</p>
            <p className="mt-1 text-sm font-medium capitalize text-slate-800">
              {detail.status.replace(/_/g, ' ')}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{completionLabel}</p>
            <p className="mt-1 text-sm text-slate-800">{formatDate(completedAt)}</p>
          </div>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Resolution details</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {resolution || 'No resolution note was recorded.'}
          </p>
        </div>
      </SectionCard> : null}

      <SectionCard title="Assignment History">
        {detail.assignments.length === 0 ? (
          <p className="text-sm italic text-slate-400">No assignment records.</p>
        ) : (
          <div className="space-y-3">
            {detail.assignments.map((assignment) => (
              <div key={assignment.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium capitalize text-slate-800">
                      {assignment.action.replace(/_/g, ' ')}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      ASI: {assignment.asiUserName ?? 'Not assigned'}
                      {' | '}
                      SE: {assignment.seUserName ?? 'Not assigned'}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">{formatDate(assignment.createdAt)}</span>
                </div>
                {assignment.note ? (
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{assignment.note}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Diagnostic Form History">
        {submissions.length === 0 ? (
          <p className="text-sm italic text-slate-400">No diagnostic forms were submitted.</p>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission) => {
              const allValid = submission.values.every((value) => value.isValid)
              return (
                <div key={submission.id} className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="flex flex-wrap items-start justify-between gap-3 bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{submission.templateName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatDate(submission.submittedAt)}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Badge className={`border-0 text-xs ${submission.isDisabled ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>
                        {submission.isDisabled ? 'Disabled' : 'Active'}
                      </Badge>
                      <Badge className={`border-0 text-xs ${allValid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {allValid ? 'Valid' : 'Has errors'}
                      </Badge>
                    </div>
                  </div>
                  {submission.disabledReason ? (
                    <p className="border-t border-slate-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                      Disabled reason: {submission.disabledReason}
                    </p>
                  ) : null}
                  <dl className="grid gap-x-6 gap-y-3 border-t border-slate-200 px-4 py-4 sm:grid-cols-2">
                    {submission.values.map((value) => (
                      <div key={value.id}>
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {value.fieldLabel || fallbackLabel(value.fieldKey)}
                        </dt>
                        <dd className={`mt-0.5 whitespace-pre-wrap break-words text-sm ${value.isValid ? 'text-slate-800' : 'text-rose-700'}`}>
                          {readableValue(value.rawValue)}
                        </dd>
                        {value.validationError ? (
                          <p className="mt-0.5 text-xs text-rose-600">{value.validationError}</p>
                        ) : null}
                      </div>
                    ))}
                  </dl>
                  {submission.attachments.length > 0 ? (
                    <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                      {submission.attachments.length} evidence image{submission.attachments.length === 1 ? '' : 's'} attached
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Test History">
        {detail.tests.length === 0 ? (
          <p className="text-sm italic text-slate-400">No test reports were submitted.</p>
        ) : (
          <div className="space-y-3">
            {detail.tests.map((test) => (
              <div key={test.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <VerdictBadge verdict={test.verdict} />
                  <span className="text-xs text-slate-400">{formatDate(test.createdAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {test.summary || 'No test summary was recorded.'}
                </p>
                {hasStructuredData(test.structuredData) ? (
                  <pre className="mt-2 overflow-x-auto rounded-md bg-slate-100 p-2 text-xs text-slate-700">
                    {JSON.stringify(test.structuredData, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {warranty ? (
        <SectionCard title="Warranty Outcome">
          <div className="flex flex-wrap items-center gap-3">
            <WarrantyStatusBadge status={warranty.status} />
            <span className="text-xs text-slate-500">{formatDate(warranty.decidedAt ?? warranty.updatedAt)}</span>
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Fulfilment route</dt>
              <dd className="mt-0.5 text-sm capitalize text-slate-800">{warranty.fulfillmentRoute ?? 'Not recorded'}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Source</dt>
              <dd className="mt-0.5 text-sm text-slate-800">
                {sourceWarehouse?.name ?? warranty.sourceOutletId ?? warranty.sourceWarehouseId ?? 'Not recorded'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Replacement serial</dt>
              <dd className="mt-0.5 font-mono text-sm text-slate-800">{warranty.approvedReplacementSerial ?? 'Not recorded'}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Replacement invoice</dt>
              <dd className="mt-0.5 font-mono text-sm text-slate-800">{warranty.replacementInvoiceId ?? 'Not recorded'}</dd>
            </div>
          </dl>
          {warranty.rejectionReason ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Rejection reason</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{warranty.rejectionReason}</p>
            </div>
          ) : null}
          {warranty.replacementOrderId ? (
            <button
              type="button"
              className="mt-4 text-sm font-medium text-teal-700 underline hover:text-teal-900"
              onClick={() => onViewReplacementOrder(warranty.replacementOrderId!)}
            >
              View replacement order
            </button>
          ) : null}
        </SectionCard>
      ) : null}
    </div>
  )
}
