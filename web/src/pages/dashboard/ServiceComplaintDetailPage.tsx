import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ServiceStatusBadge,
  WarrantyStatusBadge,
  FINAL_STATUSES,
} from '@/components/service/ServiceStatusBadge'
import { DynamicServiceForm } from '@/components/service/DynamicServiceForm'
import type { FormTemplate, FieldValue } from '@/components/service/DynamicServiceForm'
import { usePermission } from '@/context/PermissionContext'
import { useAuth } from '@/hooks/useAuth'
import { api, trpcMutation } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'
import { InfoPanel } from './service-complaint/InfoPanel'
import { EvidencePanel } from './service-complaint/EvidencePanel'
import type { AttachmentSummary } from './service-complaint/EvidencePanel'
import { LinesPanel } from './service-complaint/LinesPanel'
import { SerialIntelPanel } from './service-complaint/SerialIntelPanel'
import { TimelinePanel } from './service-complaint/TimelinePanel'
import { ServiceHistoryPanel } from './service-complaint/ServiceHistoryPanel'
import { CurrentServiceTask } from './service-complaint/CurrentServiceTask'
import { ServiceProgressHeader } from './service-complaint/ServiceProgressHeader'
import {
  deriveServiceWorkspace,
  resolveServiceActorRole,
} from './service-complaint/deriveServiceWorkspace'
import { SectionCard, VerdictBadge } from './service-complaint/shared'
import type {
  ComplaintDetail, FormSubmission, ServiceAssignmentCandidates,
  SkuOption, LineDraft, WarehouseOption,
} from './service-complaint/types'

function unwrapData<T>(payload: unknown): T {
  let current = payload
  while (current && typeof current === 'object' && 'data' in current) {
    current = (current as { data: unknown }).data
  }
  return current as T
}

export function ServiceComplaintDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { can } = usePermission()
  const { user, permissions, authQuery } = useAuth()

  const [asiUserId, setAsiUserId] = useState('')
  const [seUserId, setSeUserId] = useState('')
  const [assignNote, setAssignNote] = useState('')
  const [testVerdict, setTestVerdict] = useState('warranty_candidate')
  const [testSummary, setTestSummary] = useState('')
  const [warrantyWarehouseId, setWarrantyWarehouseId] = useState('')
  const [warrantyNote, setWarrantyNote] = useState('')
  const [warrantyRejectReason, setWarrantyRejectReason] = useState('')
  const [replacementLineId, setReplacementLineId] = useState('')
  const [replacementSerial, setReplacementSerial] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [actionNote, setActionNote] = useState('')
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>({})
  const [savingLineId, setSavingLineId] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [stagedEvidence, setStagedEvidence] = useState<AttachmentSummary[]>([])
  const [showAdminActions, setShowAdminActions] = useState(false)
  const [inlineEvidenceError, setInlineEvidenceError] = useState<string | null>(null)

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['service', 'complaint', id] }),
      queryClient.invalidateQueries({ queryKey: ['service', 'submissions', id] }),
      queryClient.invalidateQueries({ queryKey: ['service', 'complaints'] }),
    ])
    setMutationError(null)
  }

  function onMutErr(err: unknown) {
    setMutationError(apiErrorMessage(err, 'Action failed'))
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  const detailQuery = useQuery<ComplaintDetail>({
    queryKey: ['service', 'complaint', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const r = await api.get(`/tickets/${id}`)
      return unwrapData<ComplaintDetail>(r.data)
    },
  })

  const assignmentCandidatesQuery = useQuery<ServiceAssignmentCandidates>({
    queryKey: ['service-assignment-candidates'],
    enabled: can('service:assign'),
    queryFn: async () => {
      const r = await api.get('/service/assignments/candidates')
      return unwrapData<ServiceAssignmentCandidates>(r.data)
    },
  })

  const warehousesQuery = useQuery<WarehouseOption[]>({
    queryKey: ['warehouses-active'],
    queryFn: async () => {
      const r = await api.get('/warehouses', { params: { limit: 100, isActive: true } })
      const rows = unwrapData<unknown>(r.data)
      return Array.isArray(rows) ? rows as WarehouseOption[] : []
    },
  })

  const templatesQuery = useQuery<FormTemplate[]>({
    queryKey: ['service-form-templates-with-fields'],
    queryFn: async () => {
      const r = await api.get('/service/forms/templates', { params: { withFields: true } })
      const rows = unwrapData<unknown>(r.data)
      return Array.isArray(rows) ? rows as FormTemplate[] : []
    },
  })

  const skusQuery = useQuery<SkuOption[]>({
    queryKey: ['service-complaint-detail-sku-options'],
    queryFn: async () => {
      const r = await api.get('/catalog/skus', { params: { limit: 500 } })
      const payload = unwrapData<unknown>(r.data)
      const rows = Array.isArray(payload) ? payload as SkuOption[] : []
      return rows.filter((row: SkuOption) => row.isActive !== false)
    },
  })

  const submissionsQuery = useQuery<FormSubmission[]>({
    queryKey: ['service', 'submissions', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const r = await api.get(`/tickets/${id}/submissions`)
      const rows = unwrapData<unknown>(r.data)
      return Array.isArray(rows) ? rows as FormSubmission[] : []
    },
  })

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const transitionMutation = useMutation({
    mutationFn: async (payload: { action: string; note?: string }) =>
      api.post(`/tickets/${id}/transition`, payload),
    onSuccess: invalidate,
    onError: onMutErr,
  })

  const assignMutation = useMutation({
    mutationFn: async () => {
      const hasAssignedAsi = Boolean(detail?.assignments?.[0]?.asiUserId)
      return api.post(`/tickets/${id}/assign`, {
        reassign: hasAssignedAsi,
        asiUserId: asiUserId || currentAsiUserId || null,
        seUserId: seUserId || currentSeUserId || null,
        note: assignNote.trim() || null,
      })
    },
    onSuccess: () => { invalidate(); setAssignNote('') },
    onError: onMutErr,
  })

  const lineUpdateMutation = useMutation({
    mutationFn: async (lineId: string) => {
      const draft = lineDrafts[lineId]
      if (!draft) throw new Error('No line changes found')
      setSavingLineId(lineId)
      return api.post(`/tickets/${id}/lines/${lineId}`, {
        productId: draft.productId,
        serialNumber: draft.serialNumber.trim() || undefined,
        notes: draft.notes.trim() || null,
      })
    },
    onSuccess: () => { setSavingLineId(null); invalidate() },
    onError: (err) => { setSavingLineId(null); onMutErr(err) },
  })

  const testMutation = useMutation({
    mutationFn: async () =>
      api.post(`/tickets/${id}/test-submit`, { verdict: testVerdict, summary: testSummary.trim() || undefined }),
    onSuccess: () => { invalidate(); setTestSummary('') },
    onError: onMutErr,
  })

  const retestMutation = useMutation({
    mutationFn: async () =>
      api.post(`/tickets/${id}/retest`, { note: actionNote.trim() }),
    onSuccess: () => { invalidate(); setActionNote('') },
    onError: onMutErr,
  })

  const formSubmitMutation = useMutation({
    mutationFn: async (values: FieldValue[]) => {
      if (!selectedTemplateId) throw new Error('Select a form template')
      const attachmentIds = stagedEvidence
        .filter((attachment) =>
          attachment.uploadedById === user?.id &&
          attachment.isConfirmed &&
          attachment.mimeType.startsWith('image/'),
        )
        .slice(0, 5)
        .map((attachment) => attachment.id)
      if (actorRole === 'service_engineer' && attachmentIds.length === 0) {
        throw new Error('Add at least one confirmed image before submitting the diagnostic.')
      }
      return api.post(`/tickets/${id}/forms`, { templateId: selectedTemplateId, values, attachmentIds })
    },
    onSuccess: () => { invalidate(); setSelectedTemplateId('') },
    onError: onMutErr,
  })

  const warrantyApproveMutation = useMutation({
    mutationFn: async () =>
      api.post(`/tickets/${id}/warranty/approve`, {
        sourceWarehouseId: warrantyWarehouseId,
        note: warrantyNote.trim() || undefined,
      }),
    onSuccess: () => { invalidate(); setWarrantyNote('') },
    onError: onMutErr,
  })

  const warrantyRejectMutation = useMutation({
    mutationFn: async () =>
      api.post(`/tickets/${id}/warranty/reject`, { reason: warrantyRejectReason.trim() || 'Warranty rejected' }),
    onSuccess: () => { invalidate(); setWarrantyRejectReason('') },
    onError: onMutErr,
  })

  const replacementAssignMutation = useMutation({
    mutationFn: async () =>
      api.post(`/tickets/${id}/replacement`, {
        complaintLineId: replacementLineId,
        replacementSerial: replacementSerial.trim(),
      }),
    onSuccess: () => { invalidate(); setReplacementSerial('') },
    onError: onMutErr,
  })

  const fulfillmentMutation = useMutation({
    mutationFn: async () => {
      if (!detail) throw new Error('No complaint data')
      const line = detail.lines[0]
      if (!line?.productId) throw new Error('Set product ID on complaint lines before creating fulfillment')
      return api.post(`/tickets/${id}/fulfillment-order`, {
        sourceWarehouseId: warrantyWarehouseId || detail.warrantyDecision?.sourceWarehouseId,
        deliveryAddress: detail.outletName ? `${detail.outletName} service delivery` : 'Service delivery',
        lines: detail.lines
          .filter((l) => Boolean(l.productId))
          .map((l) => ({ complaintLineId: l.id, productId: l.productId, qtyOrdered: 1 })),
      })
    },
    onSuccess: invalidate,
    onError: onMutErr,
  })

  const reopenMutation = useMutation({
    mutationFn: async () =>
      api.post(`/tickets/${id}/reopen`, { reason: actionNote.trim() }),
    onSuccess: () => { invalidate(); setActionNote('') },
    onError: onMutErr,
  })

  const evidenceQueryKey = ['service', 'evidence', id]

  const inlineEvidenceUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (file.size <= 0) throw new Error('Choose a non-empty file.')
      if (file.size > 25 * 1024 * 1024) throw new Error('File must be 25 MiB or smaller.')
      if (!file.type.startsWith('image/')) throw new Error('Only image files are accepted.')
      const pending = await trpcMutation<{ attachment: { id: string }; upload: { uploadUrl: string } }>(
        'attachments.createPending',
        { entityType: 'service_complaint', entityId: id!, fileName: file.name, mimeType: file.type, fileSize: file.size, expiresInMinutes: 15 },
      )
      const res = await fetch(pending.upload.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file })
      if (!res.ok) throw new Error(`${file.name} could not be uploaded. Please retry.`)
      await trpcMutation('attachments.confirm', { attachmentId: pending.attachment.id })
    },
    onMutate: () => setInlineEvidenceError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: evidenceQueryKey }),
    onError: (err) => setInlineEvidenceError(apiErrorMessage(err, 'Upload failed. Please retry.')),
  })

  const inlineEvidenceRemoveMutation = useMutation({
    mutationFn: (attachmentId: string) => trpcMutation('attachments.remove', { id: attachmentId }),
    onMutate: () => setInlineEvidenceError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: evidenceQueryKey }),
    onError: (err) => setInlineEvidenceError(apiErrorMessage(err, 'Could not remove image.')),
  })

  // ── Derived ───────────────────────────────────────────────────────────────────

  const detail = detailQuery.data
  const isFinal = detail ? FINAL_STATUSES.has(detail.status) : false
  const assignmentCandidates = assignmentCandidatesQuery.data
  const latestAssignment = detail?.assignments?.[0] ?? null
  const currentAsiUserId = latestAssignment?.asiUserId ?? null
  const currentSeUserId = latestAssignment?.seUserId ?? null
  const actorIsCurrentAsi = Boolean(
    user?.id && currentAsiUserId === user.id,
  )
  const actorIsCurrentSe = Boolean(user?.id && currentSeUserId === user.id)
  const asiUsers = assignmentCandidates?.asiUsers ?? []
  const seUsers = assignmentCandidates?.serviceEngineers ?? []
  const warehouses = warehousesQuery.data ?? []
  const templates = templatesQuery.data ?? []
  const submissions = submissionsQuery.data ?? []
  const activeSubmissions = submissions.filter((s) => !s.isDisabled)
  const serialsReady = detail?.lines.every((line) => Boolean(line.serialNumber?.trim())) ?? false
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null
  const actorRole = resolveServiceActorRole(
    assignmentCandidates?.actor.roleName ?? authQuery.data?.role,
  )
  const workspace = detail
    ? deriveServiceWorkspace({
        complaint: detail,
        submissions,
        actorRole,
        permissions,
        isActorCurrentAsi: actorIsCurrentAsi,
        isActorCurrentSe: actorIsCurrentSe,
      })
    : null

  const isPending =
    transitionMutation.isPending || assignMutation.isPending || lineUpdateMutation.isPending ||
    testMutation.isPending || retestMutation.isPending || formSubmitMutation.isPending || warrantyApproveMutation.isPending ||
    warrantyRejectMutation.isPending || replacementAssignMutation.isPending || fulfillmentMutation.isPending
    || reopenMutation.isPending

  const handleStagedEvidenceChange = useCallback((attachments: AttachmentSummary[]) => {
    setStagedEvidence(attachments)
  }, [])

  if (!id) return <p className="text-sm text-rose-600">Missing complaint ID.</p>

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-3 h-64 rounded-xl bg-slate-100 animate-pulse" />
          <div className="col-span-2 h-64 rounded-xl bg-slate-100 animate-pulse" />
        </div>
      </div>
    )
  }

  if (detailQuery.isError || !detail) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        <p className="font-semibold">Complaint unavailable</p>
        <p className="mt-1">{apiErrorMessage(detailQuery.error, 'Unable to load complaint.')}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => detailQuery.refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-6 py-4 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard/service/complaints')}
              className="text-slate-400 hover:text-slate-700 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold font-mono text-slate-900">{detail.complaintNumber}</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {detail.title?.trim() || detail.issueCategory}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ServiceStatusBadge status={detail.status} />
            {detail.warrantyDecision ? <WarrantyStatusBadge status={detail.warrantyDecision.status} /> : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          {workspace ? <ServiceProgressHeader workspace={workspace} /> : null}
        </div>
        {latestAssignment ? (
          <p className="text-xs text-slate-500">
            Current owner: ASI {latestAssignment.asiUserName ?? 'not assigned'}
            {' · '}
            SE {latestAssignment.seUserName ?? 'not assigned'}
          </p>
        ) : null}
        {mutationError ? (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700 flex items-center gap-2">
            <span>!</span> {mutationError}
            <button type="button" onClick={() => setMutationError(null)} className="ml-auto text-rose-400 hover:text-rose-700">Close</button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {workspace ? (
            <CurrentServiceTask workspace={workspace}>
              {workspace.task === 'appoint_asi' ? (
                <div className="space-y-3">
                  {assignmentCandidatesQuery.isError ? (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {apiErrorMessage(assignmentCandidatesQuery.error, 'Unable to load service staff.')}
                    </p>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Area Service Inspector</Label>
                    <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={asiUserId} onChange={(event) => setAsiUserId(event.target.value)}>
                      <option value="">Select ASI...</option>
                      {asiUsers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.email})</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Assignment note (optional)</Label>
                    <Input value={assignNote} onChange={(event) => setAssignNote(event.target.value)} />
                  </div>
                  <Button type="button" onClick={() => assignMutation.mutate()} disabled={isPending || !asiUserId} className="bg-teal-600 text-white hover:bg-teal-700">
                    {assignMutation.isPending ? 'Appointing...' : 'Appoint ASI'}
                  </Button>
                </div>
              ) : null}

              {workspace.task === 'assign_se' ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    ASI: <span className="font-medium text-slate-800">{latestAssignment?.asiUserName ?? 'Assigned ASI'}</span>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Service Engineer</Label>
                    <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={seUserId} onChange={(event) => setSeUserId(event.target.value)}>
                      <option value="">Select engineer...</option>
                      {seUsers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.email})</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Dispatch note (optional)</Label>
                    <Input value={assignNote} onChange={(event) => setAssignNote(event.target.value)} />
                  </div>
                  <Button type="button" onClick={() => assignMutation.mutate()} disabled={isPending || !seUserId} className="bg-teal-600 text-white hover:bg-teal-700">
                    {assignMutation.isPending ? 'Assigning...' : 'Assign Engineer'}
                  </Button>
                </div>
              ) : null}

              {workspace.task === 'log_visit' ? (
                <div className="space-y-3">
                  <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2">
                    <p><span className="text-slate-400">Customer:</span> {detail.customerName ?? 'Not recorded'}</p>
                    <p><span className="text-slate-400">Phone:</span> {detail.customerPhone ?? 'Not recorded'}</p>
                    <p><span className="text-slate-400">Product:</span> {detail.lines[0]?.sku ?? 'Not set'}</p>
                    <p><span className="text-slate-400">Serial:</span> {detail.lines[0]?.serialNumber ?? 'Not set'}</p>
                  </div>
                  <Button type="button" onClick={() => transitionMutation.mutate({ action: 'visit_logged' })} disabled={isPending} className="bg-blue-600 text-white hover:bg-blue-700">
                    {transitionMutation.isPending ? 'Logging...' : workspace.title}
                  </Button>
                </div>
              ) : null}

              {workspace.task === 'diagnostic' ? (
                <div className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-5">
                    {['Confirm serial', 'Select template', 'Complete fields', 'Add evidence', 'Submit'].map((step, index) => (
                      <div key={step} className="rounded-lg bg-slate-50 px-2 py-2 text-center text-xs text-slate-600">
                        <span className="font-semibold text-teal-700">{index + 1}.</span> {step}
                      </div>
                    ))}
                  </div>
                  {/* Inline evidence upload — step 4 in the diagnostic flow */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs">
                        Evidence photos
                        <span className="ml-1 font-normal text-slate-400">(1–5 images required)</span>
                      </Label>
                      {can('attachments:write') ? (
                        <label className={[
                          'inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors',
                          inlineEvidenceUploadMutation.isPending
                            ? 'bg-slate-400 cursor-not-allowed'
                            : 'bg-teal-600 hover:bg-teal-700',
                        ].join(' ')}>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {inlineEvidenceUploadMutation.isPending ? 'Uploading…' : 'Add photo'}
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            disabled={inlineEvidenceUploadMutation.isPending}
                            onChange={(e) => {
                              const file = e.currentTarget.files?.[0]
                              if (file) inlineEvidenceUploadMutation.mutate(file)
                              e.currentTarget.value = ''
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                    {inlineEvidenceError ? (
                      <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-2 py-1.5">{inlineEvidenceError}</p>
                    ) : null}
                    {(() => {
                      const myImages = stagedEvidence.filter(
                        (a) => a.uploadedById === user?.id && a.mimeType.startsWith('image/'),
                      )
                      return myImages.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs text-slate-400">
                          No photos yet — tap <strong>Add photo</strong> to attach battery images before submitting.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {myImages.map((img) => (
                            <div key={img.id} className="relative">
                              <div className="h-16 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400 text-center px-1">{img.fileName}</div>
                              </div>
                              {can('attachments:write') ? (
                                <button
                                  type="button"
                                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700"
                                  disabled={inlineEvidenceRemoveMutation.isPending}
                                  onClick={() => inlineEvidenceRemoveMutation.mutate(img.id)}
                                  aria-label={`Remove ${img.fileName}`}
                                >
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Diagnostic template</Label>
                    <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                      <option value="">Select template...</option>
                      {templates.filter((template) => template.isActive).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </select>
                  </div>
                  {selectedTemplate ? (
                    <DynamicServiceForm
                      template={selectedTemplate}
                      onSubmit={(values) => formSubmitMutation.mutate(values)}
                      isPending={formSubmitMutation.isPending}
                      submitLabel="Submit Diagnostic"
                      disabled={isPending}
                    />
                  ) : null}
                </div>
              ) : null}

              {workspace.task === 'submit_test' ? (
                <div className="space-y-3">
                  {activeSubmissions[0] ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      Diagnostic ready: {activeSubmissions[0].templateName} · {activeSubmissions[0].attachments.length} evidence image{activeSubmissions[0].attachments.length === 1 ? '' : 's'}
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Verdict</Label>
                    <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={testVerdict} onChange={(event) => setTestVerdict(event.target.value)} disabled={!serialsReady || isPending}>
                      <option value="tested_ok">Tested OK - no fault found</option>
                      <option value="warranty_candidate">Warranty candidate - replacement needed</option>
                      <option value="failed">Failed - out-of-warranty fault</option>
                      <option value="needs_retest">Needs retest - inconclusive</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Technical summary (optional)</Label>
                    <textarea className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={testSummary} onChange={(event) => setTestSummary(event.target.value)} maxLength={2000} disabled={!serialsReady || isPending} />
                  </div>
                  <Button type="button" onClick={() => testMutation.mutate()} disabled={!serialsReady || isPending} className="bg-indigo-600 text-white hover:bg-indigo-700">
                    {testMutation.isPending ? 'Submitting...' : 'Submit Test Result'}
                  </Button>
                </div>
              ) : null}

              {workspace.task === 'close_tested_ok' ? (
                <div className="space-y-3">
                  {detail.tests[0] ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <VerdictBadge verdict={detail.tests[0].verdict} />
                      <p className="mt-2 text-sm text-slate-700">{detail.tests[0].summary || 'No test summary recorded.'}</p>
                    </div>
                  ) : null}
                  <Button type="button" onClick={() => transitionMutation.mutate({ action: 'tested_ok_close', note: 'Closed after tested-ok result' })} disabled={isPending} className="bg-emerald-600 text-white hover:bg-emerald-700">
                    {transitionMutation.isPending ? 'Closing...' : 'Close Complaint'}
                  </Button>
                </div>
              ) : null}

              {workspace.task === 'request_retest' ? (
                <div className="space-y-3">
                  {detail.tests[0] ? <VerdictBadge verdict={detail.tests[0].verdict} /> : null}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Retest reason</Label>
                    <textarea className="min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={actionNote} onChange={(event) => setActionNote(event.target.value)} />
                  </div>
                  <Button type="button" onClick={() => retestMutation.mutate()} disabled={isPending || actionNote.trim().length < 2} className="bg-amber-500 text-white hover:bg-amber-600">
                    {retestMutation.isPending ? 'Requesting...' : 'Request Retest'}
                  </Button>
                </div>
              ) : null}

              {workspace.task === 'warranty_decision' || workspace.task === 'handle_failed' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {can('service:approve') && workspace.task === 'warranty_decision' ? (
                    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="font-semibold text-emerald-800">Approve replacement</p>
                      <select className="h-9 w-full rounded-md border border-emerald-300 bg-white px-3 text-sm" value={warrantyWarehouseId} onChange={(event) => setWarrantyWarehouseId(event.target.value)}>
                        <option value="">Select warehouse...</option>
                        {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} - {warehouse.location}</option>)}
                      </select>
                      <Input value={warrantyNote} onChange={(event) => setWarrantyNote(event.target.value)} placeholder="Approval note (optional)" />
                      <Button type="button" onClick={() => warrantyApproveMutation.mutate()} disabled={isPending || !warrantyWarehouseId} className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                        {warrantyApproveMutation.isPending ? 'Approving...' : 'Approve Warranty'}
                      </Button>
                    </div>
                  ) : null}
                  {can('service:approve') ? (
                    <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                      <p className="font-semibold text-rose-800">Reject warranty and close</p>
                      <textarea className="min-h-20 w-full rounded-md border border-rose-300 bg-white px-3 py-2 text-sm" value={warrantyRejectReason} onChange={(event) => setWarrantyRejectReason(event.target.value)} placeholder="Rejection reason" />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (window.confirm('Rejecting warranty will close this complaint. Continue?')) warrantyRejectMutation.mutate()
                        }}
                        disabled={isPending || warrantyRejectReason.trim().length < 2}
                        className="w-full border-rose-400 text-rose-700 hover:bg-rose-100"
                      >
                        {warrantyRejectMutation.isPending ? 'Rejecting...' : 'Reject and Close'}
                      </Button>
                    </div>
                  ) : null}
                  {can('service:retest') && workspace.task === 'handle_failed' ? (
                    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="font-semibold text-amber-800">Request another test</p>
                      <textarea className="min-h-20 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm" value={actionNote} onChange={(event) => setActionNote(event.target.value)} placeholder="Retest reason" />
                      <Button type="button" onClick={() => retestMutation.mutate()} disabled={isPending || actionNote.trim().length < 2} className="w-full bg-amber-500 text-white hover:bg-amber-600">
                        {retestMutation.isPending ? 'Requesting...' : 'Request Retest'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {workspace.task === 'fulfillment' ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Complaint line</Label>
                      <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={replacementLineId} onChange={(event) => setReplacementLineId(event.target.value)}>
                        <option value="">Select line...</option>
                        {detail.lines.map((line) => <option key={line.id} value={line.id}>{line.serialNumber ?? line.sku}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Replacement serial</Label>
                      <Input value={replacementSerial} onChange={(event) => setReplacementSerial(event.target.value)} />
                    </div>
                  </div>
                  <Button type="button" variant="outline" onClick={() => replacementAssignMutation.mutate()} disabled={isPending || !replacementLineId || !replacementSerial.trim()}>
                    {replacementAssignMutation.isPending ? 'Assigning...' : 'Assign Replacement Serial'}
                  </Button>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Source warehouse</Label>
                    <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={warrantyWarehouseId || detail.warrantyDecision?.sourceWarehouseId || ''} onChange={(event) => setWarrantyWarehouseId(event.target.value)}>
                      <option value="">Select warehouse...</option>
                      {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} - {warehouse.location}</option>)}
                    </select>
                  </div>
                  <Button type="button" onClick={() => fulfillmentMutation.mutate()} disabled={isPending || workspace.blockers.length > 0 || !(warrantyWarehouseId || detail.warrantyDecision?.sourceWarehouseId)} className="bg-teal-600 text-white hover:bg-teal-700">
                    {fulfillmentMutation.isPending ? 'Creating...' : 'Create Replacement and Close'}
                  </Button>
                </div>
              ) : null}
            </CurrentServiceTask>
          ) : null}

          {workspace && workspace.adminActions.length > 0 ? (
            <SectionCard title="More Actions">
              <button type="button" className="text-sm font-medium text-slate-600 underline" onClick={() => setShowAdminActions((value) => !value)}>
                {showAdminActions ? 'Hide administrative actions' : 'Show administrative actions'}
              </button>
              {showAdminActions ? (
                <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
                  {workspace.adminActions.includes('reassign') ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" value={asiUserId || currentAsiUserId || ''} onChange={(event) => setAsiUserId(event.target.value)}>
                        <option value="">Select ASI...</option>
                        {asiUsers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                      </select>
                      <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" value={seUserId || currentSeUserId || ''} onChange={(event) => setSeUserId(event.target.value)}>
                        <option value="">Select engineer...</option>
                        {seUsers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                      </select>
                      <Input value={assignNote} onChange={(event) => setAssignNote(event.target.value)} placeholder="Reassignment reason" className="sm:col-span-2" />
                      <Button type="button" variant="outline" onClick={() => assignMutation.mutate()} disabled={isPending || !(asiUserId || currentAsiUserId)}>Update Assignment</Button>
                    </div>
                  ) : null}
                  {workspace.adminActions.some((action) => action !== 'reassign') ? (
                    <div className="space-y-3">
                      <Label className="text-xs">Reason</Label>
                      <Input value={actionNote} onChange={(event) => setActionNote(event.target.value)} placeholder="Required for closure, cancellation, or reopen" />
                      <div className="flex flex-wrap gap-2">
                        {workspace.adminActions.includes('telephonic_close') ? (
                          <Button type="button" variant="outline" disabled={isPending || actionNote.trim().length < 2} onClick={() => {
                            if (window.confirm('Close this complaint telephonically?')) transitionMutation.mutate({ action: 'telephonic_close', note: actionNote.trim() })
                          }}>Telephonic Close</Button>
                        ) : null}
                        {workspace.adminActions.includes('cancel') ? (
                          <Button type="button" variant="outline" className="border-rose-300 text-rose-700" disabled={isPending || actionNote.trim().length < 2} onClick={() => {
                            if (window.confirm('Cancel this complaint?')) transitionMutation.mutate({ action: 'cancel', note: actionNote.trim() })
                          }}>Cancel Complaint</Button>
                        ) : null}
                        {workspace.adminActions.includes('reopen') ? (
                          <Button type="button" variant="outline" disabled={isPending || actionNote.trim().length < 2} onClick={() => {
                            if (window.confirm('Reopen this complaint at the Raised stage?')) reopenMutation.mutate()
                          }}>Reopen Complaint</Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </SectionCard>
          ) : null}

          {(isFinal || detail.assignments.length > 0 || submissions.length > 0 || detail.tests.length > 0) ? (
            <ServiceHistoryPanel
              detail={detail}
              submissions={submissions}
              warehouses={warehouses}
              showResolution={isFinal}
              onViewReplacementOrder={(orderId) => navigate(`/dashboard/sales/orders/${orderId}`)}
            />
          ) : null}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <InfoPanel detail={detail} />
          {can('attachments:read') ? (
            <EvidencePanel
              complaintId={detail.id}
              canWrite={workspace?.task === 'diagnostic' && can('attachments:write')}
              committedEvidence={submissions.flatMap((submission) =>
                (submission.attachments ?? []).map((attachment) => ({
                  ...attachment,
                  formName: submission.templateName,
                })),
              )}
              onStagedEvidenceChange={handleStagedEvidenceChange}
            />
          ) : null}
          <LinesPanel
            detail={detail}
            isFinal={isFinal}
            isPending={isPending}
            lineDrafts={lineDrafts}
            skus={skusQuery.data ?? []}
            skusLoading={skusQuery.isLoading}
            canEdit={can('service:write') || can('service:workflow')}
            onDraftChange={(lineId, draft) => setLineDrafts((prev) => ({ ...prev, [lineId]: draft }))}
            onSaveLine={(lineId) => lineUpdateMutation.mutate(lineId)}
            savingLineId={savingLineId}
          />
          <SerialIntelPanel detail={detail} />
          <TimelinePanel detail={detail} />
        </div>
      </div>
    </div>
  )
}
