import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthContext } from '../auth-context'
import { ComplaintDetailPage } from './ComplaintDetailPage'
import { ComplaintsPage } from './ComplaintsPage'
import { buildComplaintInput } from '../lib/complaint-input'
import { NewComplaintPage } from './NewComplaintPage'
import type { ComplaintDetail, PortalCatalogProduct } from '../types'

const user = {
  id: 'user-1',
  name: 'Portal User',
  phone: '9999999999',
  email: 'portal@example.com',
  isActive: true,
  createdAt: '2026-06-01T00:00:00.000Z',
}

function renderWithProviders(
  element: React.ReactNode,
  queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } }),
  path = '/complaints',
  state: unknown = null,
) {
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{
        user,
        loading: false,
        acceptSession: () => {},
        signOut: async () => {},
      }}>
        <MemoryRouter initialEntries={[{ pathname: path, state }]}>
          {element}
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

describe('portal pages', () => {
  it('renders cursor load-more controls when another complaint page exists', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
    queryClient.setQueryData(['complaints'], {
      pages: [{
        items: [{
          id: 'complaint-1',
          complaintNumber: 'CMP-2026-000001',
          status: 'raised',
          issueCategory: 'Not charging',
          title: null,
          customerName: 'Portal User',
          serialNumber: 'SERIAL-1',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }],
        nextCursor: 'next-page',
      }],
      pageParams: [null],
    })
    const html = renderWithProviders(<ComplaintsPage />, queryClient)
    expect(html).toContain('CMP-2026-000001')
    expect(html).toContain('Load more')
  })

  it('marks required complaint fields and exposes optional evidence upload', () => {
    const html = renderWithProviders(<NewComplaintPage />, undefined, '/complaints/new')
    for (const name of [
      'issueCategory',
      'description',
      'serialNumber',
      'customerName',
      'customerPhone',
    ]) {
      expect(html).toMatch(new RegExp(`<[^>]+(?=[^>]*name="${name}")(?=[^>]*required)[^>]*>`))
    }
    expect(html).toContain('Select product')
    expect(html).not.toContain('placeholder="Product SKU"')
    expect(html).toMatch(/<input(?=[^>]*name="serialNumber")(?=[^>]*minLength="2")(?=[^>]*maxLength="200")[^>]*>/)
    expect(html).toContain('Enter at least 2 characters exactly as printed on the product.')
    expect(html).toContain('accept="image/jpeg,image/png,image/webp,image/heic,image/heif"')
  })

  it('builds the complaint mutation with the selected SKU only', () => {
    const data = new FormData()
    data.set('issueCategory', 'Not charging')
    data.set('description', 'Battery does not charge')
    data.set('customerName', 'Portal User')
    data.set('customerPhone', '9999999999')
    data.set('serialNumber', 'SERIAL-1')
    const selectedProduct: PortalCatalogProduct = {
      sku: 'SYX-200',
      name: 'Power 200',
      displayName: 'Syrex Power 200',
      brandName: 'Syrex',
      categoryName: 'Inverter Batteries',
      description: 'Tall tubular battery',
      warrantyMonths: 48,
      primaryImageUrl: 'https://cdn.example.com/power-200.jpg',
    }

    const input = buildComplaintInput(data, 'self', selectedProduct)
    expect(input.sku).toBe('SYX-200')
    expect(input).not.toHaveProperty('productId')
    expect(input).not.toHaveProperty('brandName')
    expect(input).not.toHaveProperty('categoryName')
    expect(JSON.stringify(input)).not.toContain('Tall tubular battery')
  })

  it('renders only customer-safe detail data with cancellation and attachment controls', () => {
    const detail: ComplaintDetail = {
      id: 'complaint-1',
      complaintNumber: 'CMP-2026-000001',
      status: 'raised',
      issueCategory: 'Not charging',
      title: null,
      description: 'Safe description',
      customerName: 'Portal User',
      customerPhone: '9999999999',
      complainantType: 'self',
      thirdPartyName: null,
      thirdPartyPhone: null,
      sku: 'SKU-1',
      serialNumber: 'SERIAL-1',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      assignedEngineer: { name: 'Engineer', roleLabel: 'Service Engineer' },
      latestTest: {
        verdict: 'warranty_candidate',
        summary: 'Your warranty claim is under review.',
        submittedAt: '2026-06-02T00:00:00.000Z',
      },
      warranty: null,
      timeline: [{
        action: 'raised',
        status: 'raised',
        createdAt: '2026-06-01T00:00:00.000Z',
      }],
      attachments: [{
        id: 'attachment-1',
        fileName: 'evidence.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        isConfirmed: true,
        createdAt: '2026-06-01T01:00:00.000Z',
      }],
      canEdit: true,
      canCancel: true,
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
    queryClient.setQueryData(['complaint', 'complaint-1'], detail)
    const html = renderWithProviders(
      <Routes><Route path="/complaints/:id" element={<ComplaintDetailPage />} /></Routes>,
      queryClient,
      '/complaints/complaint-1',
    )
    expect(html).toContain('Your warranty claim is under review.')
    expect(html).toContain('Cancel this complaint')
    expect(html).toContain('Add photo')
    expect(html).toContain('Loading preview for evidence.jpg')
    expect(html).toContain('Download')
    expect(html).toContain('Remove evidence.jpg')
    expect(html).not.toContain('storageKey')
    expect(html).not.toContain('structuredData')
  })

  it('renders a post-create upload failure as a dismissible notice', () => {
    const detail = {
      id: 'complaint-1',
      complaintNumber: 'CMP-2026-000001',
      status: 'raised',
      issueCategory: 'Not working',
      title: null,
      description: 'Battery issue',
      customerName: 'Portal User',
      customerPhone: '9999999999',
      complainantType: 'self',
      thirdPartyName: null,
      thirdPartyPhone: null,
      sku: 'SKU-1',
      serialNumber: 'SERIAL-1',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      assignedEngineer: null,
      latestTest: null,
      warranty: null,
      timeline: [],
      attachments: [],
      canEdit: true,
      canCancel: true,
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
    queryClient.setQueryData(['complaint', 'complaint-1'], detail)
    const html = renderWithProviders(
      <Routes><Route path="/complaints/:id" element={<ComplaintDetailPage />} /></Routes>,
      queryClient,
      '/complaints/complaint-1',
      { uploadNotice: 'Complaint created, but a photo was not uploaded.' },
    )
    expect(html).toContain('Complaint created, but a photo was not uploaded.')
    expect(html).toContain('Dismiss upload notice')
  })
})
