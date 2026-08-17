import type { ComplaintCreateInput, PortalCatalogProduct } from '../types'

export function buildComplaintInput(
  data: FormData,
  complainantType: 'self' | 'on_behalf_of',
  selectedProduct: PortalCatalogProduct,
): ComplaintCreateInput {
  return {
    issueCategory: String(data.get('issueCategory')),
    title: String(data.get('title') || '') || undefined,
    description: String(data.get('description')),
    customerName: String(data.get('customerName')),
    customerPhone: String(data.get('customerPhone')),
    complainantType,
    sku: selectedProduct.sku,
    serialNumber: String(data.get('serialNumber')),
    ...(complainantType === 'on_behalf_of' ? {
      thirdPartyName: String(data.get('thirdPartyName')),
      thirdPartyPhone: String(data.get('thirdPartyPhone')),
    } : {}),
  }
}
