import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type ComplaintStatus =
  | 'raised'
  | 'assigned'
  | 'visit'
  | 'test_result_submitted'
  | 'retest_requested'
  | 'resolved'
  | 'telephonic_closure'
  | 'cancelled'

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

type ComplaintLine = {
  id: string
  serialNumber: string
  normalizedSerial: string
  replacementSerialNumber: string | null
  productId: string | null
  notes: string | null
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

const FINAL_STATUSES: ComplaintStatus[] = ['resolved', 'telephonic_closure', 'cancelled']

function statusTone(status: ComplaintStatus) {
  if (status === 'resolved') return 'bg-emerald-100 text-emerald-700'
  if (status === 'telephonic_closure') return 'bg-cyan-100 text-cyan-700'
  if (status === 'cancelled') return 'bg-rose-100 text-rose-700'
  if (status === 'retest_requested') return 'bg-amber-100 text-amber-700'
  if (status === 'test_result_submitted') return 'bg-indigo-100 text-indigo-700'
  if (status === 'assigned') return 'bg-orange-100 text-orange-700'
  if (status === 'visit') return 'bg-blue-100 text-blue-700'
  return 'bg-slate-100 text-slate-700'
}

function warrantyTone(status: 'pending' | 'approved' | 'rejected') {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-700'
  if (status === 'rejected') return 'bg-rose-100 text-rose-700'
  return 'bg-amber-100 text-amber-700'
}

function getActions(status: ComplaintStatus): string[] {
  if (FINAL_STATUSES.includes(status)) return []
  const actions: string[] = []
  if (status === 'assigned' || status === 'retest_requested') actions.push('visit_logged')
  if (status === 'visit' || status === 'retest_requested') actions.push('tested_ok_close')
  if (status === 'test_result_submitted') actions.push('retest_requested', 'tested_ok_close')
  actions.push('telephonic_close', 'cancel')
  return actions
}

const ACTION_LABELS: Record<string, string> = {
  visit_logged: 'Log Visit',
  tested_ok_close: 'Mark Tested OK',
  retest_requested: 'Request Retest',
  telephonic_close: 'Telephonic Close',
  cancel: 'Cancel Complaint',
}

export function ServiceComplaintDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Assignment state
  const [asiUserId, setAsiUserId] = useState('')
  const [seUserId, setSeUserId] = useState('')
  const [assignNote, setAssignNote] = useState('')

  // Test state
  const [testVerdict, setTestVerdict] = useState<string>('warranty_candidate')
  const [testSummary, setTestSummary] = useState('')

  // Warranty state
  const [warrantyWarehouseId, setWarrantyWarehouseId] = useState('')
  const [warrantyNote, setWarrantyNote] = useState('')
  const [warrantyRejectReason, setWarrantyRejectReason] = useState('')

  // Replacement state
  const [replacementLineId, setReplacementLineId] = useState('')
  const [replacementSerial, setReplacementSerial] = useState('')

  // Form evidence state
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [formFieldValues, setFormFieldValues] = useState<Record<string, string>>({})

  // Action state (transition buttons)
  const [actionNote, setActionNote] = useState('')

  // Error state
  const [mutationError, setMutationError] = useState<string | null>(null)

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['service', 'complaints', id] }),
      queryClient.invalidateQueries({ queryKey: ['service', 'complaints'] }),
    ])
    setMutationError(null)
  }

  const detailQuery = useQuery<ComplaintDetail>({
    queryKey: ['service', 'complaints', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const response = await api.get<{ data: ComplaintDetail }>(`/tickets/${id}`)
      const payload = response.data as any
      return payload?.data ?? payload
    },
  })

  const usersQuery = useQuery<UserOption[]>({
    queryKey: ['service-internal-users'],
    queryFn: async () => {
      const response = await api.get<{ data: UserOption[] }>('/users', {
        params: { limit: 200, isActive: true },
      })
      const payload = response.data as any
      const list: UserOption[] = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
      return list.filter((u) => u.userType === 'internal')
    },
  })

  const warehousesQuery = useQuery<WarehouseOption[]>({
    queryKey: ['warehouses-active-list'],
    queryFn: async () => {
      const response = await api.get<{ data: { data: WarehouseOption[] } }>('/warehouses', {
        params: { limit: 100, isActive: true },
      })
      const payload = response.data as any
      if (Array.isArray(payload?.data?.data)) return payload.data.data
      if (Array.isArray(payload?.data)) return payload.data
      return []
    },
  })

  const templatesQuery = useQuery<any[]>({
    queryKey: ['service-form-templates'],
    queryFn: async () => {
      const response = await api.get('/service/forms/templates', { params: { withFields: true } })
      const payload = response.data as any
      return Array.isArray(payload?.data) ? payload.data : []
    },
  })

  const submissionsQuery = useQuery<any[]>({
    queryKey: ['service-complaint-submissions', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const response = await api.get(`/tickets/${id}/submissions`)
      const payload = response.data as any
      return Array.isArray(payload?.data) ? payload.data : []
    },
  })

  function onMutationError(error: unknown) {
    setMutationError(apiErrorMessage(error, 'Action failed'))
  }

  const transitionMutation = useMutation({
    mutationFn: async (payload: { action: string; note?: string }) =>
      api.post(`/tickets/${id}/transition`, payload),
    onSuccess: invalidate,
    onError: onMutationError,
  })

  const assignMutation = useMutation({
    mutationFn: async () =>
      api.post(`/tickets/${id}/assign`, {
        reassign: (detailQuery.data?.assignments?.length ?? 0) > 0,
        asiUserId: asiUserId || null,
        seUserId: seUserId || null,
        note: assignNote.trim() || null,
      }),
    onSuccess: () => {
      invalidate()
      setAssignNote('')
    },
    onError: onMutationError,
  })

  const testMutation = useMutation({
    mutationFn: async () =>
      api.post(`/tickets/${id}/test-submit`, {
        verdict: testVerdict,
        summary: testSummary.trim() || undefined,
      }),
    onSuccess: () => {
      invalidate()
      setTestSummary('')
    },
    onError: onMutationError,
  })

  const formSubmitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId) throw new Error('Select a form template')
      const values = Object.entries(formFieldValues)
        .filter(([, v]) => v !== '')
        .map(([fieldKey, rawValue]) => ({ fieldKey, rawValue }))
      return api.post(`/tickets/${id}/forms`, {
        templateId: selectedTemplateId,
        values,
      })
    },
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['service-complaint-submissions', id] })
      setSelectedTemplateId('')
      setFormFieldValues({})
    },
    onError: onMutationError,
  })

  const warrantyApproveMutation = useMutation({
    mutationFn: async () =>
      api.post(`/tickets/${id}/warranty/approve`, {
        sourceWarehouseId: warrantyWarehouseId,
        note: warrantyNote.trim() || undefined,
      }),
    onSuccess: () => {
      invalidate()
      setWarrantyNote('')
    },
    onError: onMutationError,
  })

  const warrantyRejectMutation = useMutation({
    mutationFn: async () =>
      api.post(`/tickets/${id}/warranty/reject`, {
        reason: warrantyRejectReason.trim() || 'Warranty rejected',
      }),
    onSuccess: () => {
      invalidate()
      setWarrantyRejectReason('')
    },
    onError: onMutationError,
  })

  const replacementAssignMutation = useMutation({
    mutationFn: async () =>
      api.post(`/tickets/${id}/replacement`, {
        complaintLineId: replacementLineId,
        replacementSerial: replacementSerial.trim(),
      }),
    onSuccess: () => {
      invalidate()
      setReplacementSerial('')
    },
    onError: onMutationError,
  })

  const fulfillmentMutation = useMutation({
    mutationFn: async () => {
      const detail = detailQuery.data
      if (!detail) throw new Error('Complaint data not loaded')
      const line = detail.lines[0]
      if (!line) throw new Error('No complaint lines')
      if (!line.productId) throw new Error('Complaint line has no product ID — assign product before creating fulfillment order')
      return api.post(`/tickets/${id}/fulfillment-order`, {
        sourceWarehouseId: warrantyWarehouseId || detail.warrantyDecision?.sourceWarehouseId,
        deliveryAddress: detail.outletName ? `${detail.outletName} service delivery` : 'Service delivery',
        lines: detail.lines
          .filter((l) => Boolean(l.productId))
          .map((l) => ({
            complaintLineId: l.id,
            productId: l.productId,
            qtyOrdered: 1,
          })),
      })
    },
    onSuccess: invalidate,
    onError: onMutationError,
  })

  const detail = detailQuery.data
  const isFinal = detail ? FINAL_STATUSES.includes(detail.status) : false
  const allowedActions = detail ? getActions(detail.status) : []
  const internalUsers = usersQuery.data ?? []
  const warehouses = warehousesQuery.data ?? []
  const lastAssignment = detail?.assignments?.[0] ?? null

  const isPending =
    transitionMutation.isPending ||
    assignMutation.isPending ||
    testMutation.isPending ||
    formSubmitMutation.isPending ||
    warrantyApproveMutation.isPending ||
    warrantyRejectMutation.isPending ||
    replacementAssignMutation.isPending ||
    fulfillmentMutation.isPending

  // Find serialInsight for a given line
  const insightFor = useMemo(() => {
    if (!detail) return () => null
    return (lineId: string) =>
      detail.serialInsights?.find((s) => s.lineId === lineId && s.role === 'old') ?? null
  }, [detail])

  if (!id) return <p className="text-sm text-red-600">Missing complaint id.</p>

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={() => navigate('/dashboard/service/complaints')}>
        ← Back to Complaints
      </Button>

      {/* ─── A. Header ─── */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="pt-6">
          {detailQuery.isLoading ? <p className="text-sm text-slate-500">Loading complaint...</p> : null}
          {detailQuery.isError ? (
            <p className="text-sm text-red-600">{apiErrorMessage(detailQuery.error, 'Unable to load complaint.')}</p>
          ) : null}
          {mutationError ? <p className="text-sm text-red-600">{mutationError}</p> : null}

          {detail ? (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Complaint</p>
                <p className="text-2xl font-bold text-slate-900">{detail.complaintNumber}</p>
                <p className="text-sm text-slate-600">{detail.title ?? 'Untitled complaint'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
                <Badge className={statusTone(detail.status)}>{detail.status.replace(/_/g, ' ')}</Badge>
                <p className="text-sm text-slate-600">Outlet: {detail.outletName ?? '—'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Timeline</p>
                <p className="text-sm text-slate-600">Created {timeAgo(detail.createdAt)}</p>
                <p className="text-sm text-slate-600">Updated {timeAgo(detail.updatedAt)}</p>
                {detail.closedAt ? <p className="text-sm text-slate-600">Closed {timeAgo(detail.closedAt)}</p> : null}
              </div>
              {detail.description ? (
                <div className="md:col-span-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</p>
                  <p className="mt-1 text-sm text-slate-700">{detail.description}</p>
                </div>
              ) : null}
              {detail.resolutionNote ? (
                <div className="md:col-span-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Resolution Note</p>
                  <p className="mt-1 text-sm text-slate-700">{detail.resolutionNote}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {detail ? (
        <>
          {/* ─── B. Lines & Serial Intelligence ─── */}
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Lines &amp; Serial Intelligence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {detail.lines.map((line) => {
                const insight = insightFor(line.id)
                return (
                  <div key={line.id} className="rounded-lg border border-slate-200 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Serial</p>
                        <code className="text-sm font-mono font-semibold text-slate-900">{line.serialNumber}</code>
                        {insight?.resolved?.product ? (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {insight.resolved.product.name} · {insight.resolved.product.sku}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Sold To</p>
                        <p className="text-sm text-slate-700">
                          {insight?.resolved?.soldToOutlet?.name ?? '—'}
                          {insight?.resolved?.soldToOutlet?.outletCode
                            ? ` (${insight.resolved.soldToOutlet.outletCode})`
                            : ''}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Replacement</p>
                        {line.replacementSerialNumber ? (
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-slate-700">{line.replacementSerialNumber}</code>
                            {detail.serialInsights?.find(
                              (s) => s.lineId === line.id && s.role === 'replacement',
                            )?.resolved?.replacementConflict?.hasConflict ? (
                              <Badge className="bg-rose-100 text-rose-700">Conflict</Badge>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-400">Not assigned</p>
                        )}
                      </div>
                    </div>
                    {insight?.resolved?.salesChain?.length ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Order</TableHead>
                              <TableHead className="text-xs">Dispatch Date</TableHead>
                              <TableHead className="text-xs">Delivery</TableHead>
                              <TableHead className="text-xs">Invoice</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {insight.resolved.salesChain.map((chain) => (
                              <TableRow key={chain.dispatchId}>
                                <TableCell className="text-xs font-mono">{chain.orderNumber}</TableCell>
                                <TableCell className="text-xs">
                                  {new Date(chain.dispatchDate).toLocaleDateString()}
                                </TableCell>
                                <TableCell className="text-xs">{chain.deliveryStatus}</TableCell>
                                <TableCell className="text-xs">{chain.invoiceNumber ?? '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* ─── C. Assign ASI/SE (hidden when final) ─── */}
          {!isFinal ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Assign Service Engineer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {lastAssignment ? (
                  <p className="text-xs text-slate-500">
                    Last assigned {timeAgo(lastAssignment.createdAt)} —
                    {lastAssignment.asiUserId ? ` ASI: ${lastAssignment.asiUserId}` : ''}
                    {lastAssignment.seUserId ? ` SE: ${lastAssignment.seUserId}` : ''}
                  </p>
                ) : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>ASI User</Label>
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={asiUserId}
                      onChange={(e) => setAsiUserId(e.target.value)}
                    >
                      <option value="">— None —</option>
                      {internalUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>SE User</Label>
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={seUserId}
                      onChange={(e) => setSeUserId(e.target.value)}
                    >
                      <option value="">— None —</option>
                      {internalUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Assignment Note</Label>
                  <Input
                    value={assignNote}
                    onChange={(e) => setAssignNote(e.target.value)}
                    placeholder="Reason or context for assignment (optional)"
                  />
                </div>
                {status === 'raised' && !asiUserId ? (
                  <p className="text-xs text-amber-600">ASI selection required for initial assignment (transitions status to Assigned)</p>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => assignMutation.mutate()}
                  disabled={isPending || (!asiUserId && !seUserId) || (status === 'raised' && !asiUserId)}
                >
                  {assignMutation.isPending
                    ? 'Assigning...'
                    : (detailQuery.data?.assignments?.length ?? 0) > 0
                      ? 'Reassign'
                      : 'Assign'}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* ─── D. Form Evidence ─── */}
          {!isFinal ? (() => {
            const templates: any[] = templatesQuery.data ?? []
            const submissions: any[] = submissionsQuery.data ?? []
            const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null
            const allValid = submissions.length > 0 && submissions.every((s) => !s.isDisabled && s.values?.every((v: any) => v.isValid))
            const hasInvalid = submissions.length > 0 && !allValid
            return (
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Form Evidence</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Evidence readiness status */}
                  {submissions.length === 0 ? (
                    <p className="text-sm text-amber-600">No form submission yet — required before test report</p>
                  ) : allValid ? (
                    <p className="text-sm text-emerald-600">Form evidence ready</p>
                  ) : hasInvalid ? (
                    <p className="text-sm text-rose-600">Form evidence has validation errors</p>
                  ) : null}

                  {/* Existing submissions list */}
                  {submissions.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Submissions</p>
                      {submissions.map((sub: any) => (
                        <div key={sub.id} className="rounded-md border border-slate-200 p-3 text-sm space-y-1">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-medium text-slate-800">{sub.templateName ?? sub.templateId}</span>
                            <div className="flex gap-1">
                              <Badge className={sub.isDisabled ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'}>
                                {sub.isDisabled ? 'disabled' : 'active'}
                              </Badge>
                              <Badge className={sub.values?.every((v: any) => v.isValid) ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}>
                                {sub.values?.every((v: any) => v.isValid) ? 'valid' : 'invalid'}
                              </Badge>
                            </div>
                            <span className="text-xs text-slate-400">{timeAgo(sub.submittedAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* Submit new form section */}
                  <div className="border-t border-slate-200 pt-4 space-y-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Submit New Form</p>
                    <div className="space-y-2">
                      <Label>Form Template</Label>
                      <select
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                        value={selectedTemplateId}
                        onChange={(e) => {
                          setSelectedTemplateId(e.target.value)
                          setFormFieldValues({})
                        }}
                      >
                        <option value="">— Select template —</option>
                        {templates.filter((t) => t.isActive !== false).map((t: any) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>

                    {selectedTemplate && Array.isArray(selectedTemplate.fields) && selectedTemplate.fields.length > 0 ? (
                      <div className="space-y-3">
                        {selectedTemplate.fields.map((field: any) => (
                          <div key={field.fieldKey} className="space-y-1">
                            <Label>{field.label ?? field.fieldKey}</Label>
                            {field.fieldType === 'textarea' ? (
                              <textarea
                                className="min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                                value={formFieldValues[field.fieldKey] ?? ''}
                                onChange={(e) => setFormFieldValues((prev) => ({ ...prev, [field.fieldKey]: e.target.value }))}
                                placeholder={field.placeholder ?? ''}
                              />
                            ) : field.fieldType === 'select' && Array.isArray((field.validationRules as any)?.options) ? (
                              <select
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                                value={formFieldValues[field.fieldKey] ?? ''}
                                onChange={(e) => setFormFieldValues((prev) => ({ ...prev, [field.fieldKey]: e.target.value }))}
                              >
                                <option value="">— Select —</option>
                                {((field.validationRules as any).options as string[]).map((opt: string) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <Input
                                value={formFieldValues[field.fieldKey] ?? ''}
                                onChange={(e) => setFormFieldValues((prev) => ({ ...prev, [field.fieldKey]: e.target.value }))}
                                placeholder={field.placeholder ?? ''}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => formSubmitMutation.mutate()}
                      disabled={isPending || !selectedTemplateId}
                    >
                      {formSubmitMutation.isPending ? 'Submitting Form...' : 'Submit Form'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })() : null}

          {/* ─── E. Test Report (visit / retest_requested) ─── */}
          {(detail.status === 'visit' || detail.status === 'retest_requested') ? (() => {
            const submissions: any[] = submissionsQuery.data ?? []
            const formReady = submissions.some((s) => !s.isDisabled && s.values?.every((v: any) => v.isValid))
            return (
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Submit Test Report</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!formReady ? (
                    <p className="text-sm text-amber-600">Complete a form submission first</p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label>Verdict</Label>
                        <select
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                          value={testVerdict}
                          onChange={(e) => setTestVerdict(e.target.value)}
                        >
                          <option value="tested_ok">Tested OK — No fault found</option>
                          <option value="warranty_candidate">Warranty Candidate — Replacement needed</option>
                          <option value="failed">Failed — Out-of-warranty fault</option>
                          <option value="needs_retest">Needs Retest — Inconclusive</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Summary (optional)</Label>
                        <textarea
                          className="min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                          value={testSummary}
                          onChange={(e) => setTestSummary(e.target.value)}
                          placeholder="Technical findings..."
                          maxLength={2000}
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => testMutation.mutate()}
                        disabled={isPending}
                      >
                        {testMutation.isPending ? 'Submitting...' : 'Submit Test Report'}
                      </Button>
                    </>
                  )}
                  {detail.tests.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Previous Tests</p>
                      {detail.tests.map((test) => (
                        <div key={test.id} className="rounded-md border border-slate-200 p-3 text-sm">
                          <div className="flex items-center justify-between">
                            <Badge className="bg-indigo-100 text-indigo-700">{test.verdict}</Badge>
                            <span className="text-xs text-slate-500">{timeAgo(test.createdAt)}</span>
                          </div>
                          {test.summary ? <p className="mt-1 text-slate-600">{test.summary}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )
          })() : null}

          {/* ─── E. Warranty Decision (test_result_submitted) ─── */}
          {detail.status === 'test_result_submitted' ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Warranty Decision</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {detail.warrantyDecision ? (
                  <div className="flex items-center gap-3">
                    <Badge className={warrantyTone(detail.warrantyDecision.status)}>
                      {detail.warrantyDecision.status}
                    </Badge>
                    {detail.warrantyDecision.decidedAt ? (
                      <span className="text-xs text-slate-500">{timeAgo(detail.warrantyDecision.decidedAt)}</span>
                    ) : null}
                    {detail.warrantyDecision.rejectionReason ? (
                      <span className="text-sm text-slate-600">{detail.warrantyDecision.rejectionReason}</span>
                    ) : null}
                  </div>
                ) : null}

                {(!detail.warrantyDecision || detail.warrantyDecision.status === 'pending') ? (
                  <>
                    <div className="space-y-2">
                      <Label>Source Warehouse</Label>
                      <select
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                        value={warrantyWarehouseId}
                        onChange={(e) => setWarrantyWarehouseId(e.target.value)}
                      >
                        <option value="">Select warehouse...</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} — {w.location}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Approval Note</Label>
                      <Input
                        value={warrantyNote}
                        onChange={(e) => setWarrantyNote(e.target.value)}
                        placeholder="Note for approval (optional)"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => warrantyApproveMutation.mutate()}
                        disabled={isPending || !warrantyWarehouseId}
                      >
                        {warrantyApproveMutation.isPending ? 'Approving...' : 'Approve Warranty'}
                      </Button>
                    </div>
                    <div className="space-y-2 border-t border-slate-200 pt-4">
                      <Label>Rejection Reason</Label>
                      <Input
                        value={warrantyRejectReason}
                        onChange={(e) => setWarrantyRejectReason(e.target.value)}
                        placeholder="Reason for rejection (required)"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => warrantyRejectMutation.mutate()}
                        disabled={isPending || !warrantyRejectReason.trim()}
                      >
                        {warrantyRejectMutation.isPending ? 'Rejecting...' : 'Reject Warranty'}
                      </Button>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* ─── F. Replacement Fulfillment (warranty approved) ─── */}
          {detail.warrantyDecision?.status === 'approved' ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Replacement Fulfillment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {detail.warrantyDecision.replacementOrderId ? (
                  <p className="text-sm text-emerald-700">
                    Replacement order created.{' '}
                    <button
                      type="button"
                      className="underline"
                      onClick={() =>
                        navigate(`/dashboard/sales/orders/${detail.warrantyDecision!.replacementOrderId}`)
                      }
                    >
                      View Order
                    </button>
                  </p>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Complaint Line</Label>
                        <select
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                          value={replacementLineId}
                          onChange={(e) => setReplacementLineId(e.target.value)}
                        >
                          <option value="">Select line...</option>
                          {detail.lines.map((line) => (
                            <option key={line.id} value={line.id}>
                              {line.serialNumber}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Replacement Serial</Label>
                        <Input
                          value={replacementSerial}
                          onChange={(e) => setReplacementSerial(e.target.value)}
                          placeholder="New serial number"
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
                      {replacementAssignMutation.isPending ? 'Assigning...' : 'Assign Replacement Serial'}
                    </Button>

                    <div className="border-t border-slate-200 pt-4">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => fulfillmentMutation.mutate()}
                        disabled={isPending}
                      >
                        {fulfillmentMutation.isPending ? 'Creating Order...' : 'Create Fulfillment Order'}
                      </Button>
                      <p className="mt-1 text-xs text-slate-500">
                        Requires product ID on complaint lines. Lines without a product ID are skipped.
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          {/* ─── G. Actions ─── */}
          {allowedActions.length > 0 ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Lifecycle Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Action Note / Reason</Label>
                  <Input
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    placeholder="Required for telephonic close and cancel"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {allowedActions.map((action) => (
                    <Button
                      key={action}
                      type="button"
                      variant={action === 'cancel' ? 'outline' : 'default'}
                      size="sm"
                      disabled={
                        isPending ||
                        ((action === 'telephonic_close' || action === 'cancel') && !actionNote.trim())
                      }
                      onClick={() =>
                        transitionMutation.mutate({ action, note: actionNote.trim() || undefined })
                      }
                    >
                      {transitionMutation.isPending ? '...' : ACTION_LABELS[action] ?? action}
                    </Button>
                  ))}
                </div>
                {(allowedActions.includes('telephonic_close') || allowedActions.includes('cancel')) ? (
                  <p className="text-xs text-slate-500">Note is required for telephonic close and cancel.</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* ─── H. Activity Timeline ─── */}
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.activities.length === 0 ? (
                <p className="text-sm text-slate-500">No activities yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.activities.map((activity) => (
                    <div key={activity.id} className="flex gap-3 rounded-lg border border-slate-100 p-3 text-sm">
                      <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-teal-400" />
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-900">{activity.action.replace(/_/g, ' ')}</span>
                          <span className="text-xs text-slate-400">{timeAgo(activity.createdAt)}</span>
                        </div>
                        {activity.fromStatus || activity.toStatus ? (
                          <p className="text-xs text-slate-500">
                            {activity.fromStatus ?? '—'} → {activity.toStatus ?? '—'}
                          </p>
                        ) : null}
                        {activity.note ? <p className="text-slate-600">{activity.note}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
