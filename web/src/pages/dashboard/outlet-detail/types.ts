export type OutletRecord = {
  id: string
  outletCode: string
  warehouseId?: string | null
  billingProfileId?: string | null
  name: string
  ownerName: string
  phone: string
  address: string
  creditLimit: number | string
  outstandingBalance: number | string
  pointsBalance: number
  isActive: boolean
  createdAt: string
  transitDaysToOutlet?: number
  legalName?: string | null
  gstin?: string | null
  billingAddress1?: string | null
  billingAddress2?: string | null
  billingCity?: string | null
  billingState?: string | null
  billingPincode?: string | null
  billingCountry?: string | null
}

export type WarehouseOption = {
  id: string
  name: string
  location: string
  isActive: boolean
}

export type OrderItem = {
  id: string
  status: string
  grandTotal: number | string
  createdAt: string
}

export type PointsSummary = {
  id: string
  outletCode: string
  name: string
  pointsBalance: number
  creditLimit: number | string
  outstandingBalance: number | string
}

export type PointsHistoryItem = {
  id: string
  actionType: string
  points: number
  note: string | null
  createdAt: string
}

export type OutletPaymentItem = {
  id: string
  amount: number
  paymentDate: string
  reference: string | null
  description: string | null
  allocatedInvoices: number
  allocations: Array<{
    id: string
    invoiceId: string
    invoiceNumber: string
    invoiceDate: string
    amount: number
    allocatedAt: string
  }>
}

export type OutletUserRole = 'owner'

export type OutletUserItem = {
  id: string
  email: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  outletRole: OutletUserRole
}

export function asNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function orderStatusBadge(status: string): string {
  if (status === 'approved' || status === 'fully_dispatched') return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  if (status === 'pending_approval' || status === 'partially_dispatched') return 'border-amber-300 bg-amber-100 text-amber-800'
  if (status === 'rejected' || status === 'cancelled') return 'border-red-300 bg-red-100 text-red-800'
  return 'border-slate-300 bg-slate-100 text-slate-700'
}
