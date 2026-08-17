import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SectionCard } from './shared'
import type { ComplaintDetail, LineDraft, SkuOption } from './types'

interface Props {
  detail: ComplaintDetail
  isFinal: boolean
  isPending: boolean
  lineDrafts: Record<string, LineDraft>
  skus: SkuOption[]
  skusLoading: boolean
  canEdit: boolean
  onDraftChange: (lineId: string, draft: LineDraft) => void
  onSaveLine: (lineId: string) => void
  savingLineId: string | null
}

export function LinesPanel({
  detail, isFinal, isPending, lineDrafts, skus, skusLoading, canEdit,
  onDraftChange, onSaveLine, savingLineId,
}: Props) {
  const serialsReady = detail.lines.every((line) => Boolean(line.serialNumber?.trim()))

  return (
    <SectionCard title="Battery Lines">
      <div className="space-y-3">
        {!serialsReady ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Serial ID is optional at creation, but every line needs one before test report submission.
          </div>
        ) : null}
        {detail.lines.map((line, index) => {
          const draft = lineDrafts[line.id] ?? {
            productId: line.productId ?? '',
            serialNumber: line.serialNumber ?? '',
            notes: line.notes ?? '',
          }
          const canEditLine = !isFinal && canEdit
          const hasChanges =
            draft.productId !== (line.productId ?? '') ||
            draft.serialNumber !== (line.serialNumber ?? '') ||
            draft.notes !== (line.notes ?? '')

          return (
            <div key={line.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Line {index + 1}</span>
                {!line.serialNumber ? <Badge className="border-0 bg-amber-100 text-amber-700 text-xs">Serial Pending</Badge> : null}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Battery SKU</Label>
                <select
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 disabled:opacity-50"
                  value={draft.productId}
                  onChange={(e) => onDraftChange(line.id, { ...draft, productId: e.target.value })}
                  disabled={!canEditLine || isPending}
                >
                  <option value="">{skusLoading ? 'Loading SKUs…' : 'Select catalog SKU'}</option>
                  {skus.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {(sku.displayName || sku.name)} ({sku.skuCode || sku.sku || 'SKU'})
                    </option>
                  ))}
                </select>
                {line.sku ? <p className="text-xs text-slate-500">Current SKU: {line.sku}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Serial ID</Label>
                <Input
                  value={draft.serialNumber}
                  onChange={(e) => onDraftChange(line.id, { ...draft, serialNumber: e.target.value })}
                  placeholder="Required before test report"
                  className="bg-white font-mono text-sm"
                  disabled={!canEditLine || isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Input
                  value={draft.notes}
                  onChange={(e) => onDraftChange(line.id, { ...draft, notes: e.target.value })}
                  placeholder="Line notes"
                  className="bg-white text-sm"
                  disabled={!canEditLine || isPending}
                />
              </div>
              {canEditLine ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onSaveLine(line.id)}
                  disabled={isPending || !hasChanges || !draft.productId}
                >
                  {savingLineId === line.id ? 'Saving…' : 'Save Line'}
                </Button>
              ) : null}
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
