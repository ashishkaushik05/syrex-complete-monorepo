import { describe, expect, it } from 'bun:test'

import {
  deriveServiceWorkspace,
  resolveServiceActorRole,
  type ServiceActorRole,
} from './deriveServiceWorkspace'
import type { ComplaintDetail, FormSubmission } from './types'

function complaint(
  status: ComplaintDetail['status'],
  options: {
    hasAsi?: boolean
    hasSe?: boolean
    verdict?: string
    warranty?: ComplaintDetail['warrantyDecision']
  } = {},
): ComplaintDetail {
  const hasAsi = options.hasAsi ?? status !== 'raised'
  const hasSe = options.hasSe ?? !['raised'].includes(status)
  return {
    id: 'complaint-1',
    complaintNumber: 'CMP-1',
    status,
    issueCategory: 'Not working',
    title: null,
    description: null,
    customerName: 'Customer',
    customerPhone: '9999999999',
    outletId: null,
    outletName: null,
    raisedById: 'user-1',
    resolutionNote: null,
    telephonicReason: null,
    closedAt: null,
    cancelledAt: null,
    reopenedAt: null,
    createdAt: '2026-06-13T00:00:00.000Z',
    updatedAt: '2026-06-13T00:00:00.000Z',
    lines: [{
      id: 'line-1',
      sku: 'SKU-1',
      serialNumber: 'SERIAL-1',
      normalizedSerial: 'SERIAL1',
      replacementSerialNumber: null,
      productId: 'product-1',
      notes: null,
    }],
    assignments: hasAsi ? [{
      id: 'assignment-1',
      action: 'assign',
      asiUserId: 'asi-1',
      seUserId: hasSe ? 'se-1' : null,
      asiUserName: 'ASI One',
      seUserName: hasSe ? 'Engineer One' : null,
      assignedById: 'admin-1',
      note: null,
      createdAt: '2026-06-13T00:00:00.000Z',
    }] : [],
    tests: options.verdict ? [{
      id: 'test-1',
      complaintLineId: 'line-1',
      submittedById: 'se-1',
      verdict: options.verdict,
      summary: null,
      structuredData: null,
      createdAt: '2026-06-13T00:00:00.000Z',
    }] : [],
    activities: [],
    warrantyDecision: options.warranty ?? null,
    serialInsights: [],
  }
}

function validSubmission(): FormSubmission {
  return {
    id: 'submission-1',
    templateId: 'template-1',
    templateName: 'Battery Warranty Check',
    submittedById: 'se-1',
    testReportId: null,
    submittedAt: '2026-06-13T00:00:00.000Z',
    isDisabled: false,
    disabledReason: null,
    attachments: [],
    values: [{
      id: 'value-1',
      fieldKey: 'voltage',
      fieldLabel: 'Voltage',
      rawValue: '12.6',
      isValid: true,
      validationError: null,
    }],
  }
}

function task(
  detail: ComplaintDetail,
  actorRole: ServiceActorRole,
  permissions: string[],
  submissions: FormSubmission[] = [],
  assignment: { asi?: boolean; se?: boolean } = {},
) {
  return deriveServiceWorkspace({
    complaint: detail,
    submissions,
    actorRole,
    permissions,
    isActorCurrentAsi: assignment.asi ?? false,
    isActorCurrentSe: assignment.se ?? false,
  })
}

describe('deriveServiceWorkspace', () => {
  it('resolves staff role names', () => {
    expect(resolveServiceActorRole('ASI')).toBe('asi')
    expect(resolveServiceActorRole('Service Engineer')).toBe('service_engineer')
    expect(resolveServiceActorRole('Admin')).toBe('back_office')
  })

  it('shows only ASI appointment for a raised complaint', () => {
    expect(task(complaint('raised'), 'back_office', ['service:assign']).task).toBe('appoint_asi')
    expect(task(complaint('raised'), 'asi', ['service:read']).task).toBe('waiting')
  })

  it('moves from engineer assignment to visit without exposing later work', () => {
    expect(task(
      complaint('assigned', { hasSe: false }),
      'asi',
      ['service:assign'],
      [],
      { asi: true },
    ).task).toBe('assign_se')
    expect(task(
      complaint('assigned', { hasSe: true }),
      'service_engineer',
      ['service:workflow'],
      [],
      { se: true },
    ).task).toBe('log_visit')
  })

  it('selects diagnostic or test from form readiness', () => {
    const visit = complaint('visit')
    expect(task(visit, 'service_engineer', ['service:form'], [], { se: true }).task).toBe('diagnostic')
    expect(task(visit, 'service_engineer', ['service:workflow'], [validSubmission()], { se: true }).task).toBe('submit_test')
  })

  it('selects the decision task from the latest verdict and role', () => {
    expect(task(
      complaint('test_result_submitted', { verdict: 'tested_ok' }),
      'service_engineer',
      ['service:workflow'],
      [],
      { se: true },
    ).task).toBe('close_tested_ok')
    expect(task(
      complaint('test_result_submitted', { verdict: 'warranty_candidate' }),
      'back_office',
      ['service:approve'],
    ).task).toBe('warranty_decision')
    expect(task(
      complaint('test_result_submitted', { verdict: 'needs_retest' }),
      'asi',
      ['service:retest'],
      [],
      { asi: true },
    ).task).toBe('request_retest')
    expect(task(
      complaint('test_result_submitted', { verdict: 'failed' }),
      'back_office',
      ['service:approve', 'service:retest'],
    ).task).toBe('handle_failed')
  })

  it('shows fulfillment only after warranty approval', () => {
    const warranty = {
      id: 'warranty-1',
      status: 'approved' as const,
      decidedById: 'admin-1',
      fulfillmentRoute: 'warehouse' as const,
      sourceWarehouseId: 'warehouse-1',
      sourceOutletId: null,
      approvedReplacementSerial: null,
      replacementOrderId: null,
      replacementInvoiceId: null,
      rejectionReason: null,
      decidedAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }
    expect(task(
      complaint('test_result_submitted', { verdict: 'warranty_candidate', warranty }),
      'back_office',
      ['service:approve'],
    ).task).toBe('fulfillment')
  })

  it('returns only a retest visit task after retest is requested', () => {
    expect(task(
      complaint('retest_requested'),
      'service_engineer',
      ['service:workflow'],
      [],
      { se: true },
    ).task).toBe('log_visit')
  })

  it('returns no workflow task for final states and never reopens cancelled work', () => {
    const resolved = task(complaint('resolved'), 'back_office', ['service:write'])
    expect(resolved.task).toBe('final')
    expect(resolved.adminActions).toContain('reopen')
    expect(resolved.completedStages).not.toContain('fulfillment')

    const cancelled = task(complaint('cancelled'), 'back_office', ['service:write'])
    expect(cancelled.task).toBe('final')
    expect(cancelled.adminActions).not.toContain('reopen')
  })
})
