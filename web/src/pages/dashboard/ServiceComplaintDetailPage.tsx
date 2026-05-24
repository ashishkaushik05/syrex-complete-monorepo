import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ServiceStatusBadge,
  StatusPipeline,
  WarrantyStatusBadge,
  FINAL_STATUSES,
} from '@/components/service/ServiceStatusBadge'
import type { ComplaintStatus } from '@/components/service/ServiceStatusBadge'
import { DynamicServiceForm } from '@/components/service/DynamicServiceForm'
import type { FormTemplate, FieldValue } from '@/components/service/DynamicServiceForm'
import { usePermission } from '@/context/PermissionContext'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

// ── Types ─────────────────────────────────────────────────────────────────────

type ComplaintLine = {
  id: string
  serialNumber: string
  normalizedSerial: string
  replacementSerialNumber: string | null
  productId: string | null
  notes: string | null
}

type SerialInsight = {
  lineId: string
  role: 'old' | 'replacement'
  serial: string
  resolved: {
    product: { id: string; name: string; sku: string } | null
    soldToOutlet: { id: string; name: string; outletCode: string | null } | null
    salesChain: Array<{
      orderId: string
      orderNumber: string
      dispatchId: string
      dispatchDate: string
      deliveryStatus: string
      invoiceNumber: string | null
      outletName: string | null
    }>
    replacementConflict: { hasConflict: boolean; usedInComplaintIds: string[] }
  }
}

type ComplaintDetail = {
  id: string
  complaintNumber: string
  status: ComplaintStatus
  title: string | null
  description: string | null
  outletId: string | null
  outletName: string | null
  raisedById: string
  resolutionNote: string | null
  telephonicReason: string | null
  closedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
  lines: ComplaintLine[]
  assignments: Array<{
    id: string
    action: string
    asiUserId: string | null
    seUserId: string | null
    assignedById: string
    note: string | null
    createdAt: string
  }>
  tests: Array<{
    id: string
    verdict: string
    summary: string | null
    createdAt: string
  }>
  activities: Array<{
    id: string
    action: string
    note: string | null
    createdAt: string
    fromStatus: string | null
    toStatus: string | null
    meta?: unknown
  }>
  warrantyDecision: {
    id: string
    status: 'pending' | 'approved' | 'rejected'
    sourceWarehouseId: string | null
    approvedReplacementSerial: string | null
    replacementOrderId: string | null
    rejectionReason: string | null
    decidedAt: string | null
  } | null
  serialInsights: SerialInsight[]
}

type UserOption = { id: string; name: string; email: string; userType: string }
type WarehouseOption = { id: string; name: string; location: string }
type FormSubmission = {
  id: string
  templateId: string
  templateName: string
  submittedAt: string
  isDisabled: boolean
  values: Array<{ id: string; fieldKey: string; rawValue: string; isValid: boolean; validationError: string | null }>
}

// ── Action config ─────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  visit_logged:     'Log Site Visit',
  tested_ok_close:  'Mark Tested OK',
  retest_requested: 'Request Retest',
  telephonic_close: 'Telephonic Close',
  cancel:           'Cancel Complaint',
}

function getActions(status: ComplaintStatus): string[] {
  if (FINAL_STATUSES.has(status)) return []
  const actions: string[] = []
  if (status === 'assigned' || status === 'retest_requested') actions.push('visit_logged')
  if (status === 'visit' || status === 'retest_requested') actions.push('tested_ok_close')
  if (status === 'test_result_submitted') actions.push('retest_requested', 'tested_ok_close')
  actions.push('telephonic_close', 'cancel')
  return actions
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`border-slate-200 bg-white shadow-sm ${className}`}>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">{children}</CardContent>
    </Card>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  )
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, string> = {
    tested_ok:          'bg-emerald-100 text-emerald-700',
    warranty_candidate: 'bg-amber-100 text-amber-700',
    failed:             'bg-rose-100 text-rose-700',
    needs_retest:       'bg-indigo-100 text-indigo-700',
  }
  return (
    <Badge className={`${map[verdict] ?? 'bg-slate-100 text-slate-700'} border-0 text-xs`}>
      {verdict.replace(/_/g, ' ')}
    </Badge>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ServiceComplaintDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { can } = usePermission()

  // Local UI state
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
  const [expandedSerials, setExpandedSerials] = useState<Set<string>>(new Set())
  const [mutationError, setMutationError] = useState<string | null>(null)

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

  // ── Queries ──
  const detailQuery = useQuery<ComplaintDetail>({
    queryKey: ['service', 'complaint', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const r = await api.get(`/tickets/${id}`)
      const p = r.data as any
      return p?.data ?? p
    },
  })

  const usersQuery = useQuery<UserOption[]>({
    queryKey: ['service-users-internal'],
    queryFn: async () => {
      const r = await api.get('/users', { params: { limit: 200, isActive: true } })
      const p = r.data as any
      const list: UserOption[] = Array.isArray(p?.data?.data) ? p.data.data : Array.isArray(p?.data) ? p.data : []
      return list.filter((u) => u.userType === 'internal')
    },
  })

  const warehousesQuery = useQuery<WarehouseOption[]>({
    queryKey: ['warehouses-active'],
    queryFn: async () => {
      const r = await api.get('/warehouses', { params: { limit: 100, isActive: true } })
      const p = r.data as any
      if (Array.isArray(p?.data?.data)) return p.data.data
      if (Array.isArray(p?.data)) return p.data
      return []
    },
  })

  const templatesQuery = useQuery<FormTemplate[]>({
    queryKey: ['service-form-templates-with-fields'],
    queryFn: async () => {
      const r = await api.get('/service/forms/templates', { params: { withFields: true } })
      const p = r.data as any
      return Array.isArray(p?.data) ? p.data : []
    },
  })

  const submissionsQuery = useQuery<FormSubmission[]>({
    queryKey: ['service', 'submissions', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const r = await api.get(`/tickets/${id}/submissions`)
      const p = r.data as any
      return Array.isArray(p?.data) ? p.data : []
    },
  })

  // ── Mutations ──
  const transitionMutation = useMutation({
    mutationFn: async (payload: { action: string; note?: string }) =>
      api.post(`/tickets/${id}/transition`, payload),
    onSuccess: invalidate,
    onError: onMutErr,
  })

  const assignMutation = useMutation({
    mutationFn: async () =>
      api.post(`/tickets/${id}/assign`, {
        reassign: (detail?.assignments?.length ?? 0) > 0,
        asiUserId: asiUserId || null,
        seUserId: seUserId || null,
        note: assignNote.trim() || null,
      }),
    onSuccess: () => { invalidate(); setAssignNote('') },
    onError: onMutErr,
  })

  const testMutation = useMutation({
    mutationFn: async () =>
      api.post(`/tickets/${id}/test-submit`, {
        verdict: testVerdict,
        summary: testSummary.trim() || undefined,
      }),
    onSuccess: () => { invalidate(); setTestSummary('') },
    onError: onMutErr,
  })

  const formSubmitMutation = useMutation({
    mutationFn: async (values: FieldValue[]) => {
      if (!selectedTemplateId) throw new Error('Select a form template')
      return api.post(`/tickets/${id}/forms`, { templateId: selectedTemplateId, values })
    },
    onSuccess: () => {
      invalidate()
      setSelectedTemplateId('')
    },
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
      api.post(`/tickets/${id}/warranty/reject`, {
        reason: warrantyRejectReason.trim() || 'Warranty rejected',
      }),
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

  // ── Derived data ──
  const detail = detailQuery.data
  const isFinal = detail ? FINAL_STATUSES.has(detail.status) : false
  const allowedActions = detail ? getActions(detail.status) : []
  const internalUsers = usersQuery.data ?? []
  const warehouses = warehousesQuery.data ?? []
  const templates = templatesQuery.data ?? []
  const submissions = submissionsQuery.data ?? []
  const activeSubmissions = submissions.filter((s) => !s.isDisabled)
  const formReady = activeSubmissions.some((s) => s.values.every((v) => v.isValid))
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null

  const isPending =
    transitionMutation.isPending || assignMutation.isPending || testMutation.isPending ||
    formSubmitMutation.isPending || warrantyApproveMutation.isPending || warrantyRejectMutation.isPending ||
    replacementAssignMutation.isPending || fulfillmentMutation.isPending

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
        {apiErrorMessage(detailQuery.error, 'Unable to load complaint.')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Header bar ── */}
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
              <p className="text-sm text-slate-500 mt-0.5">{detail.title ?? 'Untitled complaint'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ServiceStatusBadge status={detail.status} />
            {detail.warrantyDecision ? (
              <WarrantyStatusBadge status={detail.warrantyDecision.status} />
            ) : null}
          </div>
        </div>

        {/* Status pipeline */}
        <div className="overflow-x-auto">
          <StatusPipeline current={detail.status} />
        </div>

        {/* Global mutation error */}
        {mutationError ? (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700 flex items-center gap-2">
            <span>⚠</span> {mutationError}
            <button type="button" onClick={() => setMutationError(null)} className="ml-auto text-rose-400 hover:text-rose-700">✕</button>
          </div>
        ) : null}
      </div>

      {/* ── Two-column body ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">

        {/* ── Left column: workflow panels (3/5) ── */}
        <div className="lg:col-span-3 space-y-4">

          {/* A. Assignment panel */}
          {!isFinal && can('service:assign') ? (
            <SectionCard title="Assign Service Engineer">
              {detail.assignments.length > 0 ? (
                <div className="mb-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500">
                  Last assigned {timeAgo(detail.assignments[0].createdAt)}
                  {detail.assignments[0].asiUserId ? ` · ASI: ${detail.assignments[0].asiUserId.slice(0, 8)}…` : ''}
                  {detail.assignments[0].seUserId ? ` · SE: ${detail.assignments[0].seUserId.slice(0, 8)}…` : ''}
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">ASI User</Label>
                  <select
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                    value={asiUserId}
                    onChange={(e) => setAsiUserId(e.target.value)}
                  >
                    <option value="">— None —</option>
                    {internalUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">SE User</Label>
                  <select
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                    value={seUserId}
                    onChange={(e) => setSeUserId(e.target.value)}
                  >
                    <option value="">— None —</option>
                    {internalUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <Label className="text-xs">Note (optional)</Label>
                <Input
                  value={assignNote}
                  onChange={(e) => setAssignNote(e.target.value)}
                  placeholder="Reason or context for this assignment"
                  className="text-sm"
                />
              </div>
              {detail.status === 'raised' && !asiUserId ? (
                <p className="mt-2 text-xs text-amber-600">
                  ASI user required to move complaint from Raised → Assigned.
                </p>
              ) : null}
              <div className="mt-3">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => assignMutation.mutate()}
                  disabled={isPending || (!asiUserId && !seUserId)}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  {assignMutation.isPending
                    ? 'Assigning…'
                    : detail.assignments.length > 0 ? 'Reassign' : 'Assign'}
                </Button>
              </div>
            </SectionCard>
          ) : null}

          {/* B. Form Evidence */}
          {!isFinal && can('service:form') ? (
            <SectionCard title="Form Evidence">
              {/* Evidence status summary */}
              <div className="mb-4">
                {submissions.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
                    <span>⚠</span> No form submission yet — required before test report can be submitted.
                  </div>
                ) : formReady ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
                    <span>✓</span> Form evidence ready.
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
                    <span>⚠</span> Form submissions have validation errors.
                  </div>
                )}
              </div>

              {/* Existing submissions */}
              {submissions.length > 0 ? (
                <div className="mb-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Previous Submissions</p>
                  {submissions.map((sub) => {
                    const allValid = sub.values.every((v) => v.isValid)
                    return (
                      <div key={sub.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-800">{sub.templateName}</span>
                          <div className="flex items-center gap-1.5">
                            <Badge className={`border-0 text-xs ${sub.isDisabled ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>
                              {sub.isDisabled ? 'Disabled' : 'Active'}
                            </Badge>
                            <Badge className={`border-0 text-xs ${allValid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {allValid ? 'Valid' : 'Has errors'}
                            </Badge>
                          </div>
                          <span className="text-xs text-slate-400">{timeAgo(sub.submittedAt)}</span>
                        </div>
                        {/* Show invalid fields */}
                        {!allValid ? (
                          <div className="mt-2 space-y-1">
                            {sub.values.filter((v) => !v.isValid).map((v) => (
                              <p key={v.id} className="text-xs text-rose-600">
                                <code className="font-mono">{v.fieldKey}</code>: {v.validationError}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null}

              {/* Submit new form */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Submit New Form</p>

                <div className="space-y-1.5">
                  <Label className="text-xs">Form Template</Label>
                  <select
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                    value={selectedTemplateId}
                    onChange={(e) => { setSelectedTemplateId(e.target.value) }}
                  >
                    <option value="">— Select template —</option>
                    {templates.filter((t) => t.isActive).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {selectedTemplate ? (
                  <DynamicServiceForm
                    template={selectedTemplate}
                    onSubmit={(values) => formSubmitMutation.mutate(values)}
                    isPending={formSubmitMutation.isPending}
                    submitLabel="Submit Form Evidence"
                    disabled={isPending}
                  />
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          {/* C. Test Report */}
          {(detail.status === 'visit' || detail.status === 'retest_requested') ? (
            <SectionCard title="Submit Test Report">
              {!formReady ? (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700 mb-4">
                  <span>⚠</span> Complete a valid form submission above before submitting the test report.
                </div>
              ) : null}

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Verdict</Label>
                  <select
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                    value={testVerdict}
                    onChange={(e) => setTestVerdict(e.target.value)}
                    disabled={!formReady || isPending}
                  >
                    <option value="tested_ok">Tested OK — No fault found</option>
                    <option value="warranty_candidate">Warranty Candidate — Replacement needed</option>
                    <option value="failed">Failed — Out-of-warranty fault</option>
                    <option value="needs_retest">Needs Retest — Inconclusive</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Summary <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <textarea
                    className="min-h-[72px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 resize-y disabled:opacity-50"
                    value={testSummary}
                    onChange={(e) => setTestSummary(e.target.value)}
                    placeholder="Technical findings, observations…"
                    maxLength={2000}
                    disabled={!formReady || isPending}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => testMutation.mutate()}
                  disabled={!formReady || isPending}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {testMutation.isPending ? 'Submitting…' : 'Submit Test Report'}
                </Button>
              </div>

              {/* Previous test reports */}
              {detail.tests.length > 0 ? (
                <div className="mt-4 border-t border-slate-200 pt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Test History</p>
                  {detail.tests.map((test) => (
                    <div key={test.id} className="flex items-start gap-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
                      <VerdictBadge verdict={test.verdict} />
                      <div className="flex-1 min-w-0">
                        {test.summary ? <p className="text-sm text-slate-700">{test.summary}</p> : null}
                        <p className="text-xs text-slate-400 mt-0.5">{timeAgo(test.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </SectionCard>
          ) : null}

          {/* D. Warranty Decision */}
          {detail.status === 'test_result_submitted' && can('service:approve') ? (
            <SectionCard title="Warranty Decision">
              {detail.warrantyDecision ? (
                <div className="mb-4 flex items-center gap-3">
                  <WarrantyStatusBadge status={detail.warrantyDecision.status} />
                  {detail.warrantyDecision.decidedAt ? (
                    <span className="text-xs text-slate-500">{timeAgo(detail.warrantyDecision.decidedAt)}</span>
                  ) : null}
                  {detail.warrantyDecision.rejectionReason ? (
                    <span className="text-sm text-slate-700">{detail.warrantyDecision.rejectionReason}</span>
                  ) : null}
                </div>
              ) : null}

              {!detail.warrantyDecision || detail.warrantyDecision.status === 'pending' ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Approve */}
                  <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 space-y-3">
                    <p className="text-sm font-semibold text-emerald-800">Approve Warranty</p>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Source Warehouse <span className="text-rose-500">*</span></Label>
                      <select
                        className="h-9 w-full rounded-md border border-emerald-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        value={warrantyWarehouseId}
                        onChange={(e) => setWarrantyWarehouseId(e.target.value)}
                        disabled={isPending}
                      >
                        <option value="">Select warehouse…</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>{w.name} — {w.location}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Note (optional)</Label>
                      <Input
                        value={warrantyNote}
                        onChange={(e) => setWarrantyNote(e.target.value)}
                        placeholder="Approval note…"
                        disabled={isPending}
                        className="text-sm bg-white"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => warrantyApproveMutation.mutate()}
                      disabled={isPending || !warrantyWarehouseId}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {warrantyApproveMutation.isPending ? 'Approving…' : 'Approve'}
                    </Button>
                  </div>

                  {/* Reject */}
                  <div className="rounded-xl border-2 border-rose-200 bg-rose-50 p-4 space-y-3">
                    <p className="text-sm font-semibold text-rose-800">Reject Warranty</p>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Rejection Reason <span className="text-rose-500">*</span></Label>
                      <textarea
                        className="min-h-[72px] w-full rounded-md border border-rose-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none disabled:opacity-50"
                        value={warrantyRejectReason}
                        onChange={(e) => setWarrantyRejectReason(e.target.value)}
                        placeholder="Why warranty is being rejected…"
                        disabled={isPending}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => warrantyRejectMutation.mutate()}
                      disabled={isPending || !warrantyRejectReason.trim()}
                      className="w-full border-rose-400 text-rose-700 hover:bg-rose-100"
                    >
                      {warrantyRejectMutation.isPending ? 'Rejecting…' : 'Reject'}
                    </Button>
                  </div>
                </div>
              ) : null}
            </SectionCard>
          ) : null}

          {/* E. Replacement Fulfillment */}
          {detail.warrantyDecision?.status === 'approved' ? (
            <SectionCard title="Replacement Fulfillment">
              {detail.warrantyDecision.replacementOrderId ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-700">
                    <span>✓</span> Replacement order created.
                    <button
                      type="button"
                      className="underline font-medium"
                      onClick={() => navigate(`/dashboard/sales/orders/${detail.warrantyDecision!.replacementOrderId}`)}
                    >
                      View Order →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Complaint Line</Label>
                      <select
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                        value={replacementLineId}
                        onChange={(e) => setReplacementLineId(e.target.value)}
                        disabled={isPending}
                      >
                        <option value="">Select line…</option>
                        {detail.lines.map((line) => (
                          <option key={line.id} value={line.id}>{line.serialNumber}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Replacement Serial</Label>
                      <Input
                        value={replacementSerial}
                        onChange={(e) => setReplacementSerial(e.target.value)}
                        placeholder="New serial number"
                        className="font-mono text-sm"
                        disabled={isPending}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => replacementAssignMutation.mutate()}
                    disabled={isPending || !replacementLineId || !replacementSerial.trim()}
                  >
                    {replacementAssignMutation.isPending ? 'Assigning…' : 'Assign Replacement Serial'}
                  </Button>

                  <div className="border-t border-slate-200 pt-4">
                    {!warrantyWarehouseId ? (
                      <div className="space-y-1.5 mb-3">
                        <Label className="text-xs">Source Warehouse</Label>
                        <select
                          className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                          value={warrantyWarehouseId}
                          onChange={(e) => setWarrantyWarehouseId(e.target.value)}
                          disabled={isPending}
                        >
                          <option value="">Select warehouse…</option>
                          {warehouses.map((w) => (
                            <option key={w.id} value={w.id}>{w.name} — {w.location}</option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => fulfillmentMutation.mutate()}
                      disabled={isPending}
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      {fulfillmentMutation.isPending ? 'Creating…' : 'Create Fulfillment Order'}
                    </Button>
                    <p className="mt-1.5 text-xs text-slate-500">
                      Requires product ID on complaint lines. Lines without a product ID are skipped.
                    </p>
                  </div>
                </div>
              )}
            </SectionCard>
          ) : null}

          {/* F. Lifecycle actions */}
          {allowedActions.length > 0 ? (
            <SectionCard title="Lifecycle Actions">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Action Note / Reason</Label>
                  <Input
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    placeholder="Required for telephonic close and cancel"
                    className="text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {allowedActions.map((action) => (
                    <Button
                      key={action}
                      type="button"
                      size="sm"
                      variant={action === 'cancel' ? 'outline' : action === 'telephonic_close' ? 'outline' : 'default'}
                      className={
                        action === 'cancel'
                          ? 'border-rose-300 text-rose-700 hover:bg-rose-50'
                          : action === 'telephonic_close'
                            ? 'border-cyan-300 text-cyan-700 hover:bg-cyan-50'
                            : action === 'visit_logged'
                              ? 'bg-blue-600 hover:bg-blue-700 text-white'
                              : action === 'retest_requested'
                                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                : 'bg-teal-600 hover:bg-teal-700 text-white'
                      }
                      disabled={
                        isPending ||
                        ((action === 'telephonic_close' || action === 'cancel') && !actionNote.trim())
                      }
                      onClick={() =>
                        transitionMutation.mutate({ action, note: actionNote.trim() || undefined })
                      }
                    >
                      {transitionMutation.isPending ? '…' : ACTION_LABELS[action] ?? action}
                    </Button>
                  ))}
                </div>
                {(allowedActions.includes('telephonic_close') || allowedActions.includes('cancel')) ? (
                  <p className="text-xs text-slate-400">Note is required for telephonic close and cancel actions.</p>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          {/* Closed resolution note */}
          {isFinal && (detail.resolutionNote || detail.telephonicReason) ? (
            <SectionCard title="Resolution">
              <p className="text-sm text-slate-700">{detail.resolutionNote ?? detail.telephonicReason}</p>
              {detail.closedAt ? (
                <p className="mt-1 text-xs text-slate-400">Closed {timeAgo(detail.closedAt)}</p>
              ) : null}
            </SectionCard>
          ) : null}
        </div>

        {/* ── Right column: info + serial intelligence + timeline (2/5) ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Complaint metadata */}
          <SectionCard title="Complaint Details">
            <div className="space-y-3">
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

          {/* Serial intelligence */}
          <SectionCard title="Serial Intelligence">
            <div className="space-y-3">
              {detail.lines.map((line) => {
                const insight = detail.serialInsights?.find(
                  (s) => s.lineId === line.id && s.role === 'old',
                )
                const replacementInsight = detail.serialInsights?.find(
                  (s) => s.lineId === line.id && s.role === 'replacement',
                )
                const expanded = expandedSerials.has(line.id)

                return (
                  <div key={line.id} className="rounded-lg border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-start justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                      onClick={() =>
                        setExpandedSerials((prev) => {
                          const next = new Set(prev)
                          if (next.has(line.id)) next.delete(line.id)
                          else next.add(line.id)
                          return next
                        })
                      }
                    >
                      <div className="min-w-0">
                        <code className="text-sm font-mono font-semibold text-slate-900">{line.serialNumber}</code>
                        {insight?.resolved?.product ? (
                          <p className="text-xs text-slate-500 truncate">{insight.resolved.product.name}</p>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No product match</p>
                        )}
                      </div>
                      <svg
                        className={`h-4 w-4 text-slate-400 shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {expanded ? (
                      <div className="border-t border-slate-100 px-3 py-3 space-y-3 bg-slate-50">
                        {insight?.resolved?.product ? (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-slate-400 font-medium">SKU</p>
                              <code className="font-mono text-slate-700">{insight.resolved.product.sku}</code>
                            </div>
                            {insight.resolved.soldToOutlet ? (
                              <div>
                                <p className="text-slate-400 font-medium">Sold To</p>
                                <p className="text-slate-700">{insight.resolved.soldToOutlet.name}</p>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {insight?.resolved?.salesChain?.length ? (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Sales Chain</p>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Order</TableHead>
                                    <TableHead className="text-xs">Dispatched</TableHead>
                                    <TableHead className="text-xs">Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {insight.resolved.salesChain.map((chain) => (
                                    <TableRow key={chain.dispatchId}>
                                      <TableCell className="text-xs font-mono">{chain.orderNumber}</TableCell>
                                      <TableCell className="text-xs">
                                        {new Date(chain.dispatchDate).toLocaleDateString()}
                                      </TableCell>
                                      <TableCell>
                                        <Badge className={`border-0 text-xs ${
                                          chain.deliveryStatus === 'delivered'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : chain.deliveryStatus === 'in_transit'
                                              ? 'bg-blue-100 text-blue-700'
                                              : 'bg-slate-100 text-slate-600'
                                        }`}>
                                          {chain.deliveryStatus}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        ) : null}

                        {/* Replacement serial */}
                        {line.replacementSerialNumber ? (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Replacement Serial</p>
                            <div className="flex items-center gap-2">
                              <code className="text-sm font-mono text-slate-700">{line.replacementSerialNumber}</code>
                              {replacementInsight?.resolved?.replacementConflict?.hasConflict ? (
                                <Badge className="bg-rose-100 text-rose-700 border-0 text-xs">Conflict</Badge>
                              ) : (
                                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">OK</Badge>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </SectionCard>

          {/* Activity timeline */}
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
                          {timeAgo(activity.createdAt)}
                        </span>
                      </div>
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
        </div>
      </div>
    </div>
  )
}
