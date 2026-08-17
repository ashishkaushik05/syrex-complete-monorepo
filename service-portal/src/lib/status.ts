import type { ComplaintStatus } from '../types'

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  raised: 'Submitted',
  assigned: 'Assigned',
  visit: 'Inspection scheduled',
  test_result_submitted: 'Under review',
  retest_requested: 'Under review',
  resolved: 'Closed',
  telephonic_closure: 'Closed',
  cancelled: 'Cancelled',
}

export function statusLabel(status: ComplaintStatus) {
  return STATUS_LABELS[status]
}

export function statusTone(status: ComplaintStatus) {
  if (status === 'resolved' || status === 'telephonic_closure') return 'success'
  if (status === 'cancelled') return 'neutral'
  if (status === 'raised') return 'new'
  return 'active'
}

export function timelineLabel(action: string) {
  const labels: Record<string, string> = {
    raised: 'Complaint submitted',
    assign: 'Engineer assigned',
    reassign: 'Engineer assignment updated',
    visit_logged: 'Inspection recorded',
    test_submitted: 'Test results submitted',
    retest_requested: 'Additional testing requested',
    warranty_approve: 'Warranty approved',
    warranty_reject: 'Warranty decision completed',
    replacement_order_created: 'Replacement order created',
    replacement_invoice_created: 'Replacement issued',
    telephonic_close: 'Complaint closed',
    tested_ok_close: 'Complaint closed after testing',
    cancel: 'Complaint cancelled',
    reopen: 'Complaint reopened',
  }
  return labels[action] || 'Complaint updated'
}
