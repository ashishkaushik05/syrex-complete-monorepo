import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePermission } from '@/context/PermissionContext'
import { DynamicServiceForm } from '@/components/service/DynamicServiceForm'
import type { FormTemplate, FieldType } from '@/components/service/DynamicServiceForm'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'

const FIELD_TYPES: { value: FieldType; label: string; desc: string }[] = [
  { value: 'text',        label: 'Text',        desc: 'Short single-line text' },
  { value: 'textarea',    label: 'Paragraph',   desc: 'Multi-line text block' },
  { value: 'number',      label: 'Number',      desc: 'Numeric value with optional min/max' },
  { value: 'boolean',     label: 'Yes / No',    desc: 'Boolean toggle' },
  { value: 'select',      label: 'Dropdown',    desc: 'Single-choice from list' },
  { value: 'multiselect', label: 'Multi-select', desc: 'Multiple choices from list' },
  { value: 'date',        label: 'Date',        desc: 'Calendar date picker' },
]

type NewField = {
  fieldKey: string
  label: string
  fieldType: FieldType
  isRequired: boolean
  options: string
  minLength: string
  maxLength: string
  min: string
  max: string
  regex: string
  minDate: string
  maxDate: string
}

const DEFAULT_FIELD: NewField = {
  fieldKey: '', label: '', fieldType: 'text', isRequired: true,
  options: '', minLength: '', maxLength: '', min: '', max: '', regex: '', minDate: '', maxDate: '',
}

export function ServiceFormsPage() {
  const queryClient = useQueryClient()
  const { can } = usePermission()
  const canManageTemplates = can('service:templates') || can('service:manage')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [fieldOpen, setFieldOpen] = useState(false)
  const [newField, setNewField] = useState<NewField>(DEFAULT_FIELD)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  // FP-022: state-controlled confirmation for disable
  const [confirmDisableId, setConfirmDisableId] = useState<string | null>(null)
  // FP-021: error state for disable mutation
  const [disableError, setDisableError] = useState<string | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['service-form-templates-mgmt'] })

  const templatesQuery = useQuery<FormTemplate[]>({
    queryKey: ['service-form-templates-mgmt'],
    queryFn: async () => {
      const r = await api.get('/service/forms/templates', { params: { withFields: true } })
      const p = r.data as any
      return Array.isArray(p?.data) ? p.data : []
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!createName.trim()) throw new Error('Template name is required')
      const r = await api.post('/service/forms/templates', {
        name: createName.trim(),
        description: createDesc.trim() || undefined,
      })
      const p = r.data as any
      return p?.data?.data ?? p?.data ?? p
    },
    onSuccess: (created) => {
      invalidate()
      setCreateOpen(false)
      setCreateName('')
      setCreateDesc('')
      setCreateError(null)
      if (created?.id) setSelectedId(created.id)
    },
    onError: (err) => setCreateError(apiErrorMessage(err, 'Failed to create template')),
  })

  const addFieldMutation = useMutation({
    mutationFn: async (templateId: string) => {
      if (!newField.fieldKey.trim()) throw new Error('Field key is required')
      if (!/^[a-z0-9_]+$/.test(newField.fieldKey.trim())) throw new Error('Field key: lowercase letters, numbers and _ only')
      if (!newField.label.trim()) throw new Error('Label is required')

      const validationRules: Record<string, unknown> = {}
      if (['text', 'textarea'].includes(newField.fieldType)) {
        if (newField.minLength) validationRules.minLength = Number(newField.minLength)
        if (newField.maxLength) validationRules.maxLength = Number(newField.maxLength)
        if (newField.regex.trim()) validationRules.regex = newField.regex.trim()
      }
      if (newField.fieldType === 'number') {
        if (newField.min !== '') validationRules.min = Number(newField.min)
        if (newField.max !== '') validationRules.max = Number(newField.max)
      }
      if (['select', 'multiselect'].includes(newField.fieldType)) {
        const opts = newField.options.split(',').map((o) => o.trim()).filter(Boolean)
        if (opts.length === 0) throw new Error('At least one option is required')
        validationRules.options = opts
      }
      if (newField.fieldType === 'date') {
        if (newField.minDate) validationRules.minDate = newField.minDate
        if (newField.maxDate) validationRules.maxDate = newField.maxDate
      }

      return api.post(`/service/forms/templates/${templateId}/fields`, {
        fieldKey: newField.fieldKey.trim(),
        label: newField.label.trim(),
        fieldType: newField.fieldType,
        isRequired: newField.isRequired,
        validationRules: Object.keys(validationRules).length > 0 ? validationRules : undefined,
      })
    },
    onSuccess: () => {
      invalidate()
      setFieldOpen(false)
      setNewField(DEFAULT_FIELD)
      setFieldError(null)
    },
    onError: (err) => setFieldError(apiErrorMessage(err, 'Failed to add field')),
  })

  const disableMutation = useMutation({
    mutationFn: async (templateId: string) =>
      api.post(`/service/forms/templates/${templateId}/disable`, {}),
    onSuccess: () => { invalidate(); setSelectedId(null); setConfirmDisableId(null) },
    onError: (err) => {
      setConfirmDisableId(null)
      setDisableError(apiErrorMessage(err, 'Failed to disable template'))
    },
  })

  const templates = templatesQuery.data ?? []
  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null
  const needsOptions = ['select', 'multiselect'].includes(newField.fieldType)
  const needsTextRules = ['text', 'textarea'].includes(newField.fieldType)
  const needsNumberRules = newField.fieldType === 'number'
  const needsDateRules = newField.fieldType === 'date'

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Template list */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Form Templates</h2>
            {canManageTemplates && (
              <Button
                type="button"
                size="sm"
                onClick={() => setCreateOpen(true)}
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
              >
                + New Template
              </Button>
            )}
          </div>
          {disableError ? (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{disableError}</p>
          ) : null}

          {templatesQuery.isLoading ? (
            <div className="space-y-2">
              {[1,2,3].map((n) => <div key={n} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : null}

          {templates.length === 0 && !templatesQuery.isLoading ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
              No templates yet.
            </div>
          ) : null}

          <div className="space-y-2">
            {templates.map((tmpl) => {
              const activeFields = (tmpl.fields ?? []).filter((f) => f.isActive).length
              const isSelected = selectedId === tmpl.id
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : tmpl.id)}
                  className={[
                    'w-full rounded-xl border p-3 text-left transition-all',
                    isSelected
                      ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-400'
                      : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">{tmpl.name}</p>
                    <Badge className={`border-0 text-xs shrink-0 ${tmpl.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {tmpl.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                  {tmpl.description ? <p className="text-xs text-slate-500 truncate mt-0.5">{tmpl.description}</p> : null}
                  <p className="mt-1 text-xs text-slate-400">{activeFields} field{activeFields !== 1 ? 's' : ''} · v{tmpl.version}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Template detail */}
        <div className="lg:col-span-3">
          {!selectedTemplate ? (
            <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 text-slate-400">
              <div className="text-center space-y-1">
                <svg className="mx-auto h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm font-medium">Select a template to manage its fields</p>
              </div>
            </div>
          ) : (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">{selectedTemplate.name}</CardTitle>
                  {selectedTemplate.description ? <p className="text-sm text-slate-500 mt-0.5">{selectedTemplate.description}</p> : null}
                  <p className="text-xs text-slate-400 mt-1">Version {selectedTemplate.version}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {selectedTemplate.isActive ? (
                    <>
                      <Button type="button" size="sm" variant="outline" onClick={() => setPreviewOpen(true)} className="text-xs">Preview</Button>
                      {canManageTemplates && (
                        <Button
                          type="button" size="sm"
                          onClick={() => { setNewField(DEFAULT_FIELD); setFieldError(null); setFieldOpen(true) }}
                          className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
                        >
                          + Field
                        </Button>
                      )}
                      {canManageTemplates && (
                        <Button
                          type="button" size="sm" variant="outline"
                          className="border-rose-300 text-rose-600 hover:bg-rose-50 text-xs"
                          onClick={() => { setDisableError(null); setConfirmDisableId(selectedTemplate.id) }}
                          disabled={disableMutation.isPending}
                        >
                          Disable
                        </Button>
                      )}
                    </>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-500 border-0">Disabled</Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                {(selectedTemplate.fields ?? []).length === 0 ? (
                  <div className="py-10 text-center text-slate-400 space-y-2">
                    <p className="text-sm">No fields yet.</p>
                    {selectedTemplate.isActive ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => { setNewField(DEFAULT_FIELD); setFieldOpen(true) }} className="text-xs">
                        + Add First Field
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(selectedTemplate.fields ?? [])
                      .slice().sort((a, b) => a.displayOrder - b.displayOrder)
                      .map((field) => {
                        const rules = (field.validationRules ?? {}) as Record<string, unknown>
                        const ruleItems: string[] = []
                        if (field.isRequired) ruleItems.push('Required')
                        if (rules.minLength) ruleItems.push(`Min ${rules.minLength} chars`)
                        if (rules.maxLength) ruleItems.push(`Max ${rules.maxLength} chars`)
                        if (rules.min !== undefined) ruleItems.push(`Min ${rules.min}`)
                        if (rules.max !== undefined) ruleItems.push(`Max ${rules.max}`)
                        if (Array.isArray(rules.options)) ruleItems.push(`${(rules.options as string[]).length} options`)
                        if (rules.minDate) ruleItems.push(`After ${rules.minDate}`)
                        if (rules.maxDate) ruleItems.push(`Before ${rules.maxDate}`)

                        return (
                          <div key={field.id} className={`rounded-lg border p-3 ${field.isActive ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-800">{field.label}</span>
                                  {!field.isActive ? <Badge className="bg-slate-100 text-slate-500 border-0 text-[10px]">Inactive</Badge> : null}
                                </div>
                                <code className="text-[10px] font-mono text-slate-400">{field.fieldKey}</code>
                              </div>
                              <Badge className="bg-indigo-100 text-indigo-700 border-0 text-xs shrink-0">
                                {FIELD_TYPES.find((f) => f.value === field.fieldType)?.label ?? field.fieldType}
                              </Badge>
                            </div>
                            {ruleItems.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {ruleItems.map((r) => (
                                  <span key={r} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{r}</span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create template dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setCreateName(''); setCreateDesc(''); setCreateError(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Form Template</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>Template Name <span className="text-rose-500">*</span></Label>
              <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. Battery Test Report" maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
              <textarea
                className="min-h-[72px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 resize-y"
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="What this form is used for…"
                maxLength={1000}
              />
            </div>
            {createError ? <p className="text-sm text-rose-600">{createError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>Cancel</Button>
            <Button type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !createName.trim()} className="bg-teal-600 hover:bg-teal-700 text-white">
              {createMutation.isPending ? 'Creating…' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add field dialog */}
      <Dialog open={fieldOpen} onOpenChange={(o) => { setFieldOpen(o); if (!o) { setNewField(DEFAULT_FIELD); setFieldError(null) } }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>Add Field to "{selectedTemplate?.name}"</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Label <span className="text-rose-500">*</span></Label>
                <Input value={newField.label} onChange={(e) => setNewField((p) => ({ ...p, label: e.target.value }))} placeholder="e.g. Battery Voltage" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Field Key <span className="text-rose-500">*</span> <span className="text-slate-400 font-normal">lowercase, numbers, underscores</span></Label>
                <Input
                  value={newField.fieldKey}
                  onChange={(e) => setNewField((p) => ({ ...p, fieldKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                  placeholder="e.g. battery_voltage"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Field Type <span className="text-rose-500">*</span></Label>
                <select
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                  value={newField.fieldType}
                  onChange={(e) => setNewField((p) => ({ ...p, fieldType: e.target.value as FieldType }))}
                >
                  {FIELD_TYPES.map((ft) => <option key={ft.value} value={ft.value}>{ft.label} — {ft.desc}</option>)}
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newField.isRequired} onChange={(e) => setNewField((p) => ({ ...p, isRequired: e.target.checked }))} className="h-4 w-4 rounded accent-teal-600" />
                  <span className="text-sm text-slate-700">Required</span>
                </label>
              </div>
            </div>

            {needsTextRules ? (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Text Rules</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Min length</Label>
                    <Input type="number" value={newField.minLength} onChange={(e) => setNewField((p) => ({ ...p, minLength: e.target.value }))} placeholder="0" className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max length</Label>
                    <Input type="number" value={newField.maxLength} onChange={(e) => setNewField((p) => ({ ...p, maxLength: e.target.value }))} placeholder="∞" className="text-sm" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Regex pattern (optional)</Label>
                  <Input value={newField.regex} onChange={(e) => setNewField((p) => ({ ...p, regex: e.target.value }))} placeholder="e.g. ^[A-Z0-9]+$" className="font-mono text-xs" />
                </div>
              </div>
            ) : null}

            {needsNumberRules ? (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Number Rules</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Min value</Label>
                    <Input type="number" value={newField.min} onChange={(e) => setNewField((p) => ({ ...p, min: e.target.value }))} placeholder="No limit" className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max value</Label>
                    <Input type="number" value={newField.max} onChange={(e) => setNewField((p) => ({ ...p, max: e.target.value }))} placeholder="No limit" className="text-sm" />
                  </div>
                </div>
              </div>
            ) : null}

            {needsOptions ? (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Options <span className="text-rose-500">*</span></p>
                <Input value={newField.options} onChange={(e) => setNewField((p) => ({ ...p, options: e.target.value }))} placeholder="Option A, Option B, Option C" className="text-sm" />
                {newField.options ? (
                  <div className="flex flex-wrap gap-1">
                    {newField.options.split(',').map((o) => o.trim()).filter(Boolean).map((o) => (
                      <span key={o} className="rounded bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-700">{o}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {needsDateRules ? (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Date Rules</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Min date</Label>
                    <Input type="date" value={newField.minDate} onChange={(e) => setNewField((p) => ({ ...p, minDate: e.target.value }))} className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max date</Label>
                    <Input type="date" value={newField.maxDate} onChange={(e) => setNewField((p) => ({ ...p, maxDate: e.target.value }))} className="text-sm" />
                  </div>
                </div>
              </div>
            ) : null}

            {fieldError ? <p className="text-sm text-rose-600">{fieldError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFieldOpen(false)} disabled={addFieldMutation.isPending}>Cancel</Button>
            <Button
              type="button"
              onClick={() => { if (selectedId) addFieldMutation.mutate(selectedId) }}
              disabled={addFieldMutation.isPending || !newField.fieldKey.trim() || !newField.label.trim()}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {addFieldMutation.isPending ? 'Adding…' : 'Add Field'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Live preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>Form Preview — {selectedTemplate?.name}</DialogTitle></DialogHeader>
          <div className="pt-2">
            {selectedTemplate && (selectedTemplate.fields ?? []).filter((f) => f.isActive).length > 0 ? (
              <DynamicServiceForm
                template={selectedTemplate}
                onSubmit={() => {}}
                isPending={false}
                submitLabel="Submit (preview only)"
                disabled={true}
              />
            ) : (
              <p className="text-sm text-slate-400 italic">No active fields to preview.</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setPreviewOpen(false)}>Close Preview</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FP-022: React-controlled disable confirmation */}
      <ConfirmDialog
        open={Boolean(confirmDisableId)}
        onOpenChange={(open) => { if (!open) setConfirmDisableId(null) }}
        title="Disable Template"
        description={`Disable "${templates.find((t) => t.id === confirmDisableId)?.name ?? 'this template'}"? It will no longer be available for new form submissions.`}
        confirmLabel="Disable"
        variant="destructive"
        onConfirm={() => { if (confirmDisableId) disableMutation.mutate(confirmDisableId) }}
        loading={disableMutation.isPending}
      />
    </>
  )
}
