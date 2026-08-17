import type { ComplaintDetail, FormSubmission } from './types'

export type ServiceActorRole = 'asi' | 'service_engineer' | 'rsm' | 'back_office'
export type ServiceStage =
  | 'raised'
  | 'dispatch'
  | 'visit'
  | 'diagnostic'
  | 'test'
  | 'decision'
  | 'fulfillment'
  | 'closed'

export type WorkspaceTask =
  | 'appoint_asi'
  | 'assign_se'
  | 'log_visit'
  | 'diagnostic'
  | 'submit_test'
  | 'close_tested_ok'
  | 'request_retest'
  | 'warranty_decision'
  | 'handle_failed'
  | 'fulfillment'
  | 'waiting'
  | 'final'

export type AdminAction = 'reassign' | 'telephonic_close' | 'cancel' | 'reopen'

export type ServiceWorkspace = {
  currentStage: ServiceStage
  completedStages?: ServiceStage[]
  task: WorkspaceTask
  title: string
  instruction: string
  blockers: string[]
  adminActions: AdminAction[]
}

export type ServiceWorkspaceInput = {
  complaint: ComplaintDetail
  submissions: FormSubmission[]
  actorRole: ServiceActorRole
  permissions: string[]
  isActorCurrentAsi: boolean
  isActorCurrentSe: boolean
}

const FINAL_STATUSES = new Set(['resolved', 'telephonic_closure', 'cancelled'])

function hasPermission(permissions: string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission)
}

function waiting(currentStage: ServiceStage, title: string, instruction: string, adminActions: AdminAction[]): ServiceWorkspace {
  return { currentStage, task: 'waiting', title, instruction, blockers: [], adminActions }
}

export function resolveServiceActorRole(roleName: string | null | undefined): ServiceActorRole {
  const normalized = String(roleName ?? '').trim().toLowerCase()
  if (normalized === 'asi' || normalized === 'area service inspector') return 'asi'
  if (normalized === 'service engineer' || normalized === 'se') return 'service_engineer'
  if (normalized === 'rsm' || normalized === 'regional service manager') return 'rsm'
  return 'back_office'
}

export function deriveServiceWorkspace(input: ServiceWorkspaceInput): ServiceWorkspace {
  const { complaint, submissions, actorRole, permissions, isActorCurrentAsi, isActorCurrentSe } = input
  const can = (permission: string) => hasPermission(permissions, permission)
  const isBackOffice = actorRole === 'back_office' || actorRole === 'rsm'
  const latestAssignment = complaint.assignments[0] ?? null
  const hasAsi = Boolean(latestAssignment?.asiUserId)
  const hasSe = Boolean(latestAssignment?.seUserId)
  const isFinal = FINAL_STATUSES.has(complaint.status)
  const activeValidForm = submissions.some(
    (submission) => !submission.isDisabled && submission.values.every((value) => value.isValid),
  )
  const serialsReady = complaint.lines.length > 0 &&
    complaint.lines.every((line) => Boolean(line.serialNumber?.trim()))
  const latestTest = complaint.tests[0] ?? null

  const adminActions: AdminAction[] = []
  if (!isFinal && hasAsi && can('service:assign')) adminActions.push('reassign')
  if (
    (complaint.status === 'raised' || (complaint.status === 'assigned' && !hasSe)) &&
    can('service:telephonic')
  ) {
    adminActions.push('telephonic_close')
  }
  if (!isFinal && can('service:cancel')) adminActions.push('cancel')
  if (
    (complaint.status === 'resolved' || complaint.status === 'telephonic_closure') &&
    can('service:write')
  ) {
    adminActions.push('reopen')
  }

  if (isFinal) {
    const completedStages: ServiceStage[] = ['raised']
    if (complaint.assignments.length > 0) completedStages.push('dispatch')
    if (
      complaint.activities.some((activity) => activity.action === 'visit_logged') ||
      submissions.length > 0 ||
      complaint.tests.length > 0
    ) {
      completedStages.push('visit')
    }
    if (submissions.length > 0) completedStages.push('diagnostic')
    if (complaint.tests.length > 0) completedStages.push('test', 'decision')
    if (
      complaint.warrantyDecision?.replacementOrderId ||
      complaint.warrantyDecision?.replacementInvoiceId
    ) {
      completedStages.push('fulfillment')
    }
    return {
      currentStage: 'closed',
      completedStages,
      task: 'final',
      title: complaint.status === 'cancelled' ? 'Complaint Cancelled' : 'Service Complete',
      instruction: 'This complaint is read-only. The complete service record is shown below.',
      blockers: [],
      adminActions,
    }
  }

  if (complaint.status === 'raised') {
    if (isBackOffice && can('service:assign')) {
      return {
        currentStage: 'raised',
        task: 'appoint_asi',
        title: 'Appoint Area Service Inspector',
        instruction: 'Choose the ASI who will own dispatch for this complaint.',
        blockers: [],
        adminActions,
      }
    }
    return waiting('raised', 'Waiting for ASI Appointment', 'Back office must appoint an ASI before dispatch can begin.', adminActions)
  }

  if (complaint.status === 'assigned' && !hasSe) {
    if (can('service:assign') && (isBackOffice || isActorCurrentAsi)) {
      return {
        currentStage: 'dispatch',
        task: 'assign_se',
        title: 'Assign Service Engineer',
        instruction: 'Choose the engineer who will visit the customer.',
        blockers: [],
        adminActions,
      }
    }
    return waiting('dispatch', 'Waiting for Engineer Assignment', 'The assigned ASI must select a Service Engineer.', adminActions)
  }

  if (complaint.status === 'assigned') {
    if (isActorCurrentSe && can('service:workflow')) {
      return {
        currentStage: 'visit',
        task: 'log_visit',
        title: 'Log Site Visit',
        instruction: 'Confirm arrival at the customer site before starting diagnostics.',
        blockers: [],
        adminActions,
      }
    }
    return waiting(
      'visit',
      'Waiting for Site Visit',
      `${latestAssignment?.seUserName ?? 'The assigned engineer'} must log the visit.`,
      adminActions,
    )
  }

  if (complaint.status === 'retest_requested') {
    if (isActorCurrentSe && can('service:workflow')) {
      return {
        currentStage: 'visit',
        task: 'log_visit',
        title: 'Log Retest Visit',
        instruction: complaint.activities.find((activity) => activity.action === 'retest_requested')?.note
          ?? 'A retest was requested. Log the new visit before repeating diagnostics.',
        blockers: [],
        adminActions,
      }
    }
    return waiting('visit', 'Waiting for Retest Visit', 'The assigned engineer must log the retest visit.', adminActions)
  }

  if (complaint.status === 'visit' && !activeValidForm) {
    if (isActorCurrentSe && can('service:form')) {
      return {
        currentStage: 'diagnostic',
        task: 'diagnostic',
        title: 'Complete Diagnostic',
        instruction: 'Complete the active diagnostic template and submit 1 to 5 confirmed evidence images.',
        blockers: serialsReady ? [] : ['Add the serial number on every battery line before testing.'],
        adminActions,
      }
    }
    return waiting('diagnostic', 'Diagnostic in Progress', 'The assigned engineer must submit the diagnostic form and evidence.', adminActions)
  }

  if (complaint.status === 'visit') {
    if (isActorCurrentSe && can('service:workflow')) {
      return {
        currentStage: 'test',
        task: 'submit_test',
        title: 'Submit Test Result',
        instruction: 'Record the verdict for the completed diagnostic.',
        blockers: serialsReady ? [] : ['Add the serial number on every battery line before submitting the test.'],
        adminActions,
      }
    }
    return waiting('test', 'Waiting for Test Result', 'The assigned engineer must submit the test result.', adminActions)
  }

  if (complaint.status === 'test_result_submitted') {
    if (complaint.warrantyDecision?.status === 'approved') {
      if (can('service:approve')) {
        return {
          currentStage: 'fulfillment',
          task: 'fulfillment',
          title: 'Create Warranty Replacement',
          instruction: 'Assign replacement serials and create the zero-value fulfillment order. Fulfillment closes the complaint automatically.',
          blockers: complaint.lines.some((line) => !line.productId)
            ? ['Set a product on every replacement line before fulfillment.']
            : [],
          adminActions,
        }
      }
      return waiting('fulfillment', 'Waiting for Warranty Fulfillment', 'Warranty is approved and awaiting replacement fulfillment.', adminActions)
    }

    if (latestTest?.verdict === 'tested_ok') {
      if (can('service:workflow') && (isBackOffice || isActorCurrentSe)) {
        return {
          currentStage: 'decision',
          task: 'close_tested_ok',
          title: 'Close Tested OK',
          instruction: 'The latest test passed. Confirm closure to complete the complaint.',
          blockers: [],
          adminActions,
        }
      }
      return waiting('decision', 'Test Passed', 'Waiting for the assigned engineer or back office to close the complaint.', adminActions)
    }

    if (latestTest?.verdict === 'warranty_candidate') {
      if (isBackOffice && can('service:approve')) {
        return {
          currentStage: 'decision',
          task: 'warranty_decision',
          title: 'Make Warranty Decision',
          instruction: 'Approve replacement fulfillment or reject warranty and close the complaint.',
          blockers: [],
          adminActions,
        }
      }
      if (can('service:retest') && (actorRole === 'asi' || isBackOffice)) {
        return {
          currentStage: 'decision',
          task: 'request_retest',
          title: 'Review Warranty Candidate',
          instruction: 'Request a retest if the submitted evidence is inconclusive.',
          blockers: [],
          adminActions,
        }
      }
      return waiting('decision', 'Waiting for Warranty Decision', 'An authorized back-office user must review the warranty candidate.', adminActions)
    }

    if (latestTest?.verdict === 'needs_retest') {
      if (can('service:retest') && (actorRole === 'asi' || isBackOffice)) {
        return {
          currentStage: 'decision',
          task: 'request_retest',
          title: 'Request Retest',
          instruction: 'Record why another visit and diagnostic attempt are required.',
          blockers: [],
          adminActions,
        }
      }
      return waiting('decision', 'Retest Recommended', 'Waiting for ASI or back office to request the retest.', adminActions)
    }

    if (latestTest?.verdict === 'failed') {
      if (isBackOffice && (can('service:approve') || can('service:retest'))) {
        return {
          currentStage: 'decision',
          task: 'handle_failed',
          title: 'Handle Failed Test',
          instruction: 'Reject warranty to close the complaint, or request a retest.',
          blockers: [],
          adminActions,
        }
      }
      return waiting('decision', 'Failed Test Under Review', 'Back office must decide whether to reject warranty or request a retest.', adminActions)
    }

    return waiting('decision', 'Test Result Under Review', 'The latest test result requires back-office review.', adminActions)
  }

  return waiting('raised', 'Workflow State Unavailable', 'Refresh the complaint or contact an administrator.', adminActions)
}
