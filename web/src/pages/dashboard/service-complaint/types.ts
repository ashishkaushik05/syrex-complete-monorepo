import type { ComplaintStatus } from '@/components/service/ServiceStatusBadge'

export type ComplaintLine = {
  id: string
  sku: string
  serialNumber: string | null
  normalizedSerial: string | null
  replacementSerialNumber: string | null
  productId: string | null
  notes: string | null
}

export type SerialInsight = {
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

export type ComplaintDetail = {
  id: string
  complaintNumber: string
  status: ComplaintStatus
  issueCategory: string
  title: string | null
  description: string | null
  customerName: string | null
  customerPhone: string | null
  outletId: string | null
  outletName: string | null
  raisedById: string
  resolutionNote: string | null
  telephonicReason: string | null
  closedAt: string | null
  cancelledAt: string | null
  reopenedAt: string | null
  createdAt: string
  updatedAt: string
  lines: ComplaintLine[]
  assignments: Array<{
    id: string
    action: string
    asiUserId: string | null
    seUserId: string | null
    asiUserName: string | null
    seUserName: string | null
    assignedById: string
    note: string | null
    createdAt: string
  }>
  tests: Array<{
    id: string
    complaintLineId: string | null
    submittedById: string
    submittedByName: string | null
    verdict: string
    summary: string | null
    structuredData: unknown | null
    createdAt: string
  }>
  activities: Array<{
    id: string
    actorId: string | null
    actorName: string | null
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
    decidedById: string | null
    fulfillmentRoute: 'warehouse' | 'outlet' | null
    sourceWarehouseId: string | null
    sourceOutletId: string | null
    approvedReplacementSerial: string | null
    replacementOrderId: string | null
    replacementInvoiceId: string | null
    rejectionReason: string | null
    decidedAt: string | null
    updatedAt: string
  } | null
  serialInsights: SerialInsight[]
}

export type WarehouseOption = { id: string; name: string; location: string }
export type FormSubmission = {
  id: string
  templateId: string
  templateName: string
  submittedById: string
  testReportId: string | null
  submittedAt: string
  isDisabled: boolean
  disabledReason: string | null
  attachments: Array<{
    id: string
    fileName: string
    mimeType: string
    fileSize: number
    createdAt: string
  }>
  values: Array<{
    id: string
    fieldKey: string
    fieldLabel: string
    rawValue: string
    isValid: boolean
    validationError: string | null
  }>
}
export type ServiceStaffUser = { id: string; name: string; email: string; roleName: string }
export type ServiceAssignmentCandidates = {
  asiUsers: ServiceStaffUser[]
  serviceEngineers: ServiceStaffUser[]
  actor: { id: string | null; roleName: string | null; isAsi: boolean }
}
export type SkuOption = {
  id: string
  name: string
  displayName?: string | null
  skuCode?: string | null
  sku?: string | null
  isActive?: boolean
}
export type LineDraft = { productId: string; serialNumber: string; notes: string }
