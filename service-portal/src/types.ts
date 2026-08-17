export type ServiceUser = {
  id: string
  name: string
  phone: string
  email: string
  isActive: boolean
  createdAt: string
}

export type AuthSession = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: ServiceUser
}

export type ComplaintStatus =
  | 'raised'
  | 'assigned'
  | 'visit'
  | 'test_result_submitted'
  | 'retest_requested'
  | 'resolved'
  | 'telephonic_closure'
  | 'cancelled'

export type ComplaintListItem = {
  id: string
  complaintNumber: string
  status: ComplaintStatus
  issueCategory: string
  title: string | null
  customerName: string | null
  serialNumber: string
  createdAt: string
  updatedAt: string
}

export type PortalAttachment = {
  id: string
  fileName: string
  mimeType: string
  fileSize: number
  isConfirmed: boolean
  createdAt: string
}

export type PortalCatalogFacet = {
  name: string
  categories: string[]
}

export type PortalCatalogProduct = {
  sku: string
  name: string
  displayName: string | null
  brandName: string
  categoryName: string
  description: string | null
  warrantyMonths: number
  primaryImageUrl: string | null
}

export type ComplaintDetail = ComplaintListItem & {
  description: string | null
  customerPhone: string | null
  complainantType: 'self' | 'on_behalf_of'
  thirdPartyName: string | null
  thirdPartyPhone: string | null
  sku: string
  assignedEngineer: { name: string; roleLabel: string } | null
  latestTest: {
    verdict: 'tested_ok' | 'warranty_candidate' | 'failed' | 'needs_retest'
    summary: string
    submittedAt: string
  } | null
  warranty: {
    status: 'pending' | 'approved' | 'rejected'
    reason: string | null
    decidedAt: string | null
    replacement: { type: 'order' | 'invoice'; reference: string; status: string } | null
  } | null
  timeline: Array<{ action: string; status: ComplaintStatus | null; createdAt: string }>
  attachments: PortalAttachment[]
  canEdit: boolean
  canCancel: boolean
}

export type ComplaintCreateInput = {
  issueCategory: string
  title?: string
  description: string
  customerName: string
  customerPhone: string
  complainantType: 'self' | 'on_behalf_of'
  thirdPartyName?: string
  thirdPartyPhone?: string
  sku: string
  serialNumber: string
}
