import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'

type ApiSuccess<T> = { data: T }

type ApiErrorLike = {
  response?: {
    status?: number
    data?: {
      error?: {
        message?: string
      }
    }
  }
}

type RequestConfig = AxiosRequestConfig

const configuredBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
const restBaseURL = import.meta.env.DEV
  ? '/api/v1'
  : `${configuredBaseUrl || 'http://localhost:3000'}/api/v1`

const trpcBaseURL = import.meta.env.DEV
  ? '/trpc'
  : `${configuredBaseUrl || 'http://localhost:3000'}/trpc`

const fallbackApi = axios.create({
  baseURL: restBaseURL,
  withCredentials: true,
})

const ACTOR_KEY = 'syrex_phase1_actor_id'
const DEV_FALLBACK_ACTOR_ID = (import.meta.env.VITE_DEV_ACTOR_ID as string | undefined)?.trim() || '21000000-0000-4000-8000-000000000001'

function getActorId() {
  const stored = window.localStorage.getItem(ACTOR_KEY)
  if (stored) return stored
  if (import.meta.env.DEV) return DEV_FALLBACK_ACTOR_ID
  return null
}

function setActorId(actorId: string | null) {
  if (!actorId) {
    window.localStorage.removeItem(ACTOR_KEY)
    return
  }
  window.localStorage.setItem(ACTOR_KEY, actorId)
}

function makeApiError(message: string, status = 400): ApiErrorLike {
  return {
    response: {
      status,
      data: {
        error: { message }
      }
    }
  }
}

function asIsoAfterHours(hours = 72) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function mapTrpcError(payload: any): never {
  const message = payload?.error?.json?.message ?? 'Request failed'
  const status = payload?.error?.json?.data?.httpStatus ?? 400
  throw makeApiError(message, status)
}

function unwrap(payload: any) {
  if (payload?.error) {
    mapTrpcError(payload)
  }
  return payload?.result?.data?.json
}

async function trpcQuery<T>(procedure: string, input: unknown): Promise<T> {
  const qs =
    input === undefined
      ? ''
      : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
  const actorId = getActorId()
  const response = await fetch(`${trpcBaseURL}/${procedure}${qs}`, {
    method: 'GET',
    headers: actorId ? { 'x-actor-id': actorId } : undefined,
  })
  const payload = await response.json()
  return unwrap(payload) as T
}

async function trpcMutation<T>(procedure: string, input: unknown): Promise<T> {
  const actorId = getActorId()
  const response = await fetch(`${trpcBaseURL}/${procedure}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(actorId ? { 'x-actor-id': actorId } : {}),
    },
    body: JSON.stringify({ json: input }),
  })
  const payload = await response.json()
  return unwrap(payload) as T
}

async function trpcListAll<TItem>(
  procedure: string,
  baseInput: Record<string, unknown> = {},
  pageSize = 100,
): Promise<TItem[]> {
  const items: TItem[] = []
  let cursor: string | null = null

  for (let i = 0; i < 100; i += 1) {
    const pageResp: { items: TItem[]; nextCursor: string | null } = await trpcQuery(procedure, {
      ...baseInput,
      cursor,
      limit: pageSize,
    })
    items.push(...(pageResp.items ?? []))
    if (!pageResp.nextCursor) break
    cursor = pageResp.nextCursor
  }

  return items
}

async function getRolesIndex() {
  const roles = await trpcQuery<Array<{ id: string; name: string; permissions: string[]; isSystem: boolean; createdAt: string }>>(
    'roles.list',
    undefined,
  )
  const byId = new Map(roles.map((role) => [role.id, role]))
  const byName = new Map(roles.map((role) => [role.name, role]))
  return { roles, byId, byName }
}

type OutletRole = 'owner' | 'staff'

function normalizeOutletRole(value: unknown): OutletRole {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'owner') return 'owner'
  if (normalized === 'staff') return 'staff'
  throw makeApiError(`Unknown outlet role: ${String(value ?? '')}`)
}

function roleNameForMatch(role: { name?: string } | undefined | null) {
  return String(role?.name ?? '').trim().toLowerCase()
}

function resolveOutletRoleId(
  rolesIndex: { roles: Array<{ id: string; name: string }> },
  outletRole: OutletRole,
) {
  const ownerCandidates = ['owner', 'outlet owner', 'admin', 'sales']
  const staffCandidates = ['staff', 'outlet staff', 'sales']
  const candidates = outletRole === 'owner' ? ownerCandidates : staffCandidates

  for (const candidate of candidates) {
    const found = rolesIndex.roles.find((role) => roleNameForMatch(role) === candidate)
    if (found) return found.id
  }
  throw makeApiError(`Unable to map outlet role '${outletRole}' to an existing backend role`)
}

function toOutletRole(roleName: string | undefined | null): OutletRole {
  const normalized = String(roleName ?? '').trim().toLowerCase()
  if (normalized.includes('owner') || normalized === 'admin') return 'owner'
  return 'staff'
}


async function getOutletsIndex() {
  const items = await trpcListAll<any>('outlets.list')
  const byId = new Map(items.map((outlet) => [outlet.id, outlet]))
  return { items, byId }
}

async function getCatalogIndex() {
  const [brandsItems, categoriesItems, productsItems] = await Promise.all([
    trpcListAll<any>('brands.list'),
    trpcListAll<any>('categories.list'),
    trpcListAll<any>('products.list'),
  ])
  const brandById = new Map(brandsItems.map((brand) => [brand.id, brand]))
  const categoryById = new Map(categoriesItems.map((category) => [category.id, category]))
  return { brandById, categoryById, products: productsItems }
}

type CatalogImageRow = {
  id: string
  uri: string
  sortOrder: number
  brandId: string | null
  categoryId: string | null
  productId: string | null
}

async function getCatalogImagesIndex() {
  const images = await trpcListAll<CatalogImageRow>('images.list')
  const byBrandId = new Map<string, CatalogImageRow[]>()
  const byCategoryId = new Map<string, CatalogImageRow[]>()
  const byProductId = new Map<string, CatalogImageRow[]>()

  for (const image of images) {
    if (image.brandId) {
      const rows = byBrandId.get(image.brandId) ?? []
      rows.push(image)
      byBrandId.set(image.brandId, rows)
    }
    if (image.categoryId) {
      const rows = byCategoryId.get(image.categoryId) ?? []
      rows.push(image)
      byCategoryId.set(image.categoryId, rows)
    }
    if (image.productId) {
      const rows = byProductId.get(image.productId) ?? []
      rows.push(image)
      byProductId.set(image.productId, rows)
    }
  }

  const sortRows = (rows: CatalogImageRow[]) =>
    [...rows].sort((a, b) => {
      if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      return a.id.localeCompare(b.id)
    })

  for (const [key, rows] of byBrandId) byBrandId.set(key, sortRows(rows))
  for (const [key, rows] of byCategoryId) byCategoryId.set(key, sortRows(rows))
  for (const [key, rows] of byProductId) byProductId.set(key, sortRows(rows))

  return { byBrandId, byCategoryId, byProductId }
}

async function replaceEntityImages(
  target: { brandId?: string; categoryId?: string; productId?: string },
  imageUris: string[],
) {
  const existing = await trpcListAll<CatalogImageRow>('images.list', target)
  for (const row of existing) {
    await trpcMutation('images.remove', { id: row.id })
  }
  for (let i = 0; i < imageUris.length; i += 1) {
    await trpcMutation('images.create', {
      uri: imageUris[i],
      sortOrder: i,
      ...target,
    })
  }
}

function getPageAndLimit(config?: RequestConfig, defaultLimit = 20) {
  const pageRaw = Number(config?.params?.page ?? 1)
  const limitRaw = Number(config?.params?.limit ?? defaultLimit)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : defaultLimit
  return { page, limit }
}

function invoicePaymentStatus(amountDue: number, amountPaid: number) {
  if (amountDue <= 0) return 'paid' as const
  if (amountPaid > 0) return 'partially_paid' as const
  return 'unpaid' as const
}

function daysSince(isoDate: string) {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  if (!Number.isFinite(then)) return 0
  const diff = now - then
  if (diff <= 0) return 0
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

async function getInvoiceListView(input: { outletId?: string; orderId?: string; q?: string } = {}) {
  const [invoiceRows, outletsIndex] = await Promise.all([
    trpcListAll<any>('invoices.list', input),
    getOutletsIndex(),
  ])

  return invoiceRows.map((invoice) => {
    const total = Number(invoice.total ?? 0)
    const paidAmount = Number(invoice.amountPaid ?? 0)
    const remainingAmount = Number(invoice.amountDue ?? 0)
    return {
      ...invoice,
      total,
      paidAmount,
      remainingAmount,
      paymentStatus: invoicePaymentStatus(remainingAmount, paidAmount),
      isOverdue: remainingAmount > 0 && new Date(invoice.invoiceDate).getTime() < Date.now(),
      paymentDate: null,
      outlet: outletsIndex.byId.get(invoice.outletId)
        ? {
            id: invoice.outletId,
            name: outletsIndex.byId.get(invoice.outletId)?.name ?? invoice.outletId,
          }
        : undefined,
    }
  })
}

async function getDispatchListView(input: { warehouseId?: string; deliveryStatus?: string } = {}) {
  const dispatchRows = await trpcListAll<any>('dispatches.list', input)
  const orderIds = Array.from(new Set(dispatchRows.flatMap((dispatch) => (dispatch.lines ?? []).map((line: any) => line.orderId))))
  const warehouseIds = Array.from(new Set(dispatchRows.map((dispatch) => dispatch.warehouseId)))

  const [warehouses, orders, outletsIndex] = await Promise.all([
    trpcListAll<any>('warehouses.list'),
    Promise.all(orderIds.map((id) => trpcQuery<any>('orders.getById', { id }).catch(() => null))),
    getOutletsIndex(),
  ])

  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]))
  const orderById = new Map(orders.filter(Boolean).map((order) => [order.id, order]))
  const usedWarehouseIds = new Set(warehouseIds)

  return dispatchRows.map((dispatch) => {
    const lineOrderId = dispatch.lines?.[0]?.orderId ?? ''
    const order = lineOrderId ? orderById.get(lineOrderId) : null
    const outlet = order?.outletId ? outletsIndex.byId.get(order.outletId) : null
    const warehouse = usedWarehouseIds.has(dispatch.warehouseId) ? warehouseById.get(dispatch.warehouseId) : null

    return {
      ...dispatch,
      orderId: lineOrderId,
      warehouse: warehouse
        ? { id: warehouse.id, name: warehouse.name, location: warehouse.location ?? null }
        : null,
      order: order
        ? {
            id: order.id,
            outlet: outlet
              ? {
                  id: outlet.id,
                  name: outlet.name,
                  outletCode: outlet.outletCode ?? null,
                }
              : undefined,
          }
        : undefined,
    }
  })
}

async function phase1Get(url: string, config?: RequestConfig): Promise<unknown | null> {
  if (url === '/auth/me') {
    const user = await trpcQuery<any>('auth.me', undefined)
    const permissions = (user.role?.permissions ?? []) as string[]
    return {
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          userType: user.userType,
          isActive: user.isActive,
        },
        role: user.roleId,
        permissions,
        managedWarehouseId: user.managedWarehouseId ?? null,
        context: {
          userType: user.userType,
          permissions,
          isGlobalScope: true,
          capabilities: {
            fieldSenseEnabled: Boolean(user.isFieldEnabled),
          },
        },
      },
    }
  }

  if (url === '/roles') {
    const roles = await trpcQuery<any[]>('roles.list', undefined)
    return { data: roles.map((role) => ({ id: role.id, name: role.name, permissions: role.permissions, isSystem: role.isSystem })) }
  }

  if (url === '/permissions') {
    const catalog = await trpcQuery<{
      permissions: Array<{
        key: string
        module: string
        action: string
        label: string
        description: string
        risk: 'low' | 'medium' | 'high'
        group: string
      }>
    }>('system.permissions', undefined)
    return { data: catalog.permissions ?? [] }
  }

  if (url === '/users') {
    const listItems = await trpcListAll<any>('users.list')
    const rolesIndex = await getRolesIndex()
    return {
      data: listItems.map((user) => ({
        ...user,
        role: rolesIndex.byId.get(user.roleId)
          ? { id: user.roleId, name: rolesIndex.byId.get(user.roleId)?.name }
          : null,
      })),
    }
  }

  if (/^\/users\/[^/]+$/.test(url)) {
    const id = url.split('/')[2]
    const user = await trpcQuery<any>('users.getById', { id })
    const rolesIndex = await getRolesIndex()
    return {
      data: {
        ...user,
        role: rolesIndex.byId.get(user.roleId)
          ? { id: user.roleId, name: rolesIndex.byId.get(user.roleId)?.name }
          : null,
      },
    }
  }

  if (url === '/users/invitations') {
    const listItems = await trpcListAll<any>('invitations.list')
    return {
      data: listItems.map((invite) => ({
        ...invite,
        inviteLink: `${window.location.origin}/invite/accept?token=${invite.token}`,
      })),
    }
  }

  if (url === '/catalog/brands') {
    const includeInactive = Boolean(config?.params?.includeInactive)
    const [listItems, imagesIndex] = await Promise.all([
      trpcListAll<any>('brands.list', {
        isActive: includeInactive ? undefined : true,
      }),
      getCatalogImagesIndex(),
    ])
    return {
      data: listItems.map((brand) => ({
        id: brand.id,
        name: brand.name,
        description: brand.description,
        isActive: brand.isActive,
        logoImage: imagesIndex.byBrandId.get(brand.id)?.[0]?.uri ?? null,
      })),
    }
  }

  if (url === '/catalog/categories') {
    const includeInactive = Boolean(config?.params?.includeInactive)
    const brandId = (config?.params?.brandId as string | undefined) || undefined
    const [listItems, brands, imagesIndex] = await Promise.all([
      trpcListAll<any>('categories.list', {
        brandId,
        isActive: includeInactive ? undefined : true,
      }),
      trpcListAll<{ id: string; name: string }>('brands.list'),
      getCatalogImagesIndex(),
    ])
    const brandMap = new Map(brands.map((brand) => [brand.id, brand.name]))
    return {
      data: listItems.map((category) => ({
        id: category.id,
        brandId: category.brandId,
        brand: brandMap.get(category.brandId) ?? null,
        name: category.name,
        description: category.description,
        icon: imagesIndex.byCategoryId.get(category.id)?.[0]?.uri ?? null,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
      })),
    }
  }

  if (url === '/catalog/skus') {
    const categoryId = (config?.params?.categoryId as string | undefined) || undefined
    const brandId = (config?.params?.brandId as string | undefined) || undefined
    const [brandsList, categoriesList, listItems, imagesIndex] = await Promise.all([
      trpcListAll<any>('brands.list'),
      trpcListAll<any>('categories.list'),
      trpcListAll<any>('products.list', { categoryId }),
      getCatalogImagesIndex(),
    ])
    const brandById = new Map(brandsList.map((brand) => [brand.id, brand]))
    const categoryById = new Map(categoriesList.map((category) => [category.id, category]))
    return {
      data: listItems
        .filter((product) => {
          if (!brandId) return true
          const category = categoryById.get(product.categoryId)
          return category?.brandId === brandId
        })
        .map((product) => {
          const category = categoryById.get(product.categoryId)
          return {
            id: product.id,
            brandId: category?.brandId ?? null,
            categoryId: product.categoryId,
            name: product.name,
            displayName: product.displayName ?? product.name,
            skuCode: product.sku,
            basePrice: Number(product.basePrice),
            warrantyMonths: product.warrantyMonths,
            category: category?.name ?? null,
            brand: category?.brandId ? (brandById.get(category.brandId)?.name ?? null) : null,
            type: null,
            description: product.description,
            details: product.specs
              ? {
                  version: 1,
                  customFields: Object.entries(product.specs as Record<string, unknown>).map(([key, value]) => ({
                    key,
                    label: key,
                    type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'text',
                    value,
                    visible: true,
                  })),
                }
              : null,
            images: (imagesIndex.byProductId.get(product.id) ?? []).map((row) => row.uri),
            isActive: product.isActive,
          }
        }),
    }
  }

  if (url === '/outlets/counts') {
    const listItems = await trpcListAll<any>('outlets.list')
    const active = listItems.filter((item) => item.isActive).length
    return { data: { active, inactive: listItems.length - active } }
  }

  if (url === '/outlets') {
    const page = Number(config?.params?.page ?? 1)
    const limit = Number(config?.params?.limit ?? 20)
    const isActive = config?.params?.isActive as boolean | undefined

    const listItems = await trpcListAll<any>('outlets.list', { isActive })
    const start = (page - 1) * limit
    const items = listItems.slice(start, start + limit)
    return {
      data: {
        data: items,
        pagination: {
          total: listItems.length,
          page,
          limit,
        },
      },
    }
  }

  if (/^\/outlets\/[^/]+\/users$/.test(url)) {
    const id = url.split('/')[2]
    const outlet = await trpcQuery<any>('outlets.getById', { id })
    const user = await trpcQuery<any>('users.getById', { id: outlet.userId }).catch(() => null)
    const rolesIndex = await getRolesIndex()
    const roleName = user?.roleId ? rolesIndex.byId.get(user.roleId)?.name : null

    if (!user) return { data: { data: [] } }
    return {
      data: {
        data: [
          {
            id: user.id,
            email: user.email,
            name: user.name,
            isActive: Boolean(user.isActive),
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            outletRole: toOutletRole(roleName),
          },
        ],
      },
    }
  }

  if (/^\/outlets\/[^/]+\/points\/history$/.test(url)) {
    return { data: { data: [] } }
  }

  if (/^\/outlets\/[^/]+\/points$/.test(url)) {
    const id = url.split('/')[2]
    const outlet = await trpcQuery<any>('outlets.getById', { id })
    return {
      data: {
        data: {
          id: outlet.id,
          outletCode: outlet.outletCode,
          name: outlet.name,
          pointsBalance: 0,
          creditLimit: outlet.creditLimit,
          outstandingBalance: outlet.outstandingBalance,
        },
      },
    }
  }

  if (url.startsWith('/outlets/')) {
    const id = url.split('/')[2]
    const outlet = await trpcQuery<any>('outlets.getById', { id })
    return { data: { data: outlet } }
  }

  if (url === '/warehouses') {
    const listItems = await trpcListAll<any>('warehouses.list')
    return {
      data: {
        data: listItems.map((warehouse) => ({
          ...warehouse,
          skuCount: 0,
          totalUnits: 0,
          reservedUnits: 0,
          availableUnits: 0,
        })),
      },
    }
  }

  if (url === '/products') {
    const page = Number(config?.params?.page ?? 1)
    const limit = Number(config?.params?.limit ?? 20)
    const q = (config?.params?.q as string | undefined) || undefined
    const listItems = await trpcListAll<any>('products.list', { q })
    const start = (page - 1) * limit
    return {
      data: {
        data: listItems.slice(start, start + limit),
        pagination: {
          total: listItems.length,
          page,
          limit,
        },
      },
    }
  }

  if (url === '/catalog/search') {
    const q = ((config?.params?.q as string | undefined) ?? '').trim()
    const [{ brandById, categoryById, products }, imagesIndex] = await Promise.all([
      getCatalogIndex(),
      getCatalogImagesIndex(),
    ])
    const normalized = q.toLowerCase()
    const filtered = !normalized
      ? products
      : products.filter((product) => {
          const category = categoryById.get(product.categoryId)
          const brand = category?.brandId ? brandById.get(category.brandId) : null
          return (
            product.name?.toLowerCase().includes(normalized) ||
            product.displayName?.toLowerCase().includes(normalized) ||
            product.sku?.toLowerCase().includes(normalized) ||
            category?.name?.toLowerCase().includes(normalized) ||
            brand?.name?.toLowerCase().includes(normalized)
          )
        })
    return {
      data: {
        data: filtered.map((product) => {
          const category = categoryById.get(product.categoryId)
          return {
            id: product.id,
            brandId: category?.brandId ?? null,
            categoryId: product.categoryId,
            name: product.name,
            displayName: product.displayName ?? product.name,
            skuCode: product.sku,
            sku: product.sku,
            basePrice: Number(product.basePrice),
            warrantyMonths: product.warrantyMonths,
            category: category?.name ?? null,
            brand: category?.brandId ? (brandById.get(category.brandId)?.name ?? null) : null,
            type: null,
            description: product.description,
            details: product.specs ?? null,
            images: (imagesIndex.byProductId.get(product.id) ?? []).map((row) => row.uri),
            isActive: product.isActive,
          }
        }),
      },
    }
  }

  if (url === '/orders' || url === '/orders/pending-approval') {
    const page = Number(config?.params?.page ?? 1)
    const limit = Number(config?.params?.limit ?? 20)
    const statusParam = (config?.params?.status as string | undefined) || undefined
    const qParam = (config?.params?.q as string | undefined) || (config?.params?.outletName as string | undefined) || undefined
    const priorityParam = (config?.params?.priority as string | undefined) || undefined
    const input: Record<string, unknown> = {}
    input.status = url === '/orders/pending-approval' ? 'pending_approval' : statusParam
    if (qParam) input.q = qParam
    const [listItems, outletsIndex, invoices, dispatches] = await Promise.all([
      trpcListAll<any>('orders.list', input),
      getOutletsIndex(),
      trpcListAll<any>('invoices.list'),
      trpcListAll<any>('dispatches.list'),
    ])

    const invoiceNumbersByOrderId = new Map<string, string[]>()
    for (const invoice of invoices) {
      const orderId = String(invoice.orderId ?? '')
      if (!orderId) continue
      const row = invoiceNumbersByOrderId.get(orderId) ?? []
      row.push(String(invoice.invoiceNumber ?? invoice.id))
      invoiceNumbersByOrderId.set(orderId, row)
    }

    const dispatchSummaryByOrderId = new Map<string, { dispatchCount: number; dispatchedQty: number }>()
    for (const dispatch of dispatches) {
      const touchedOrderIds = new Set<string>()
      for (const line of dispatch.lines ?? []) {
        const orderId = String(line.orderId ?? '')
        if (!orderId) continue
        const prev = dispatchSummaryByOrderId.get(orderId) ?? { dispatchCount: 0, dispatchedQty: 0 }
        prev.dispatchedQty += Number(line.qtyDispatched ?? 0)
        if (!touchedOrderIds.has(orderId)) {
          prev.dispatchCount += 1
          touchedOrderIds.add(orderId)
        }
        dispatchSummaryByOrderId.set(orderId, prev)
      }
    }

    let mapped = listItems.map((order) => ({
      ...order,
      orgId: '',
      outlet: outletsIndex.byId.get(order.outletId)
        ? {
            id: order.outletId,
            name: outletsIndex.byId.get(order.outletId)?.name ?? order.outletId,
          }
        : undefined,
      lines: order.lines ?? [],
      linkedInvoices: invoiceNumbersByOrderId.get(order.id) ?? [],
      dispatchCount: dispatchSummaryByOrderId.get(order.id)?.dispatchCount ?? 0,
      dispatchedQty: dispatchSummaryByOrderId.get(order.id)?.dispatchedQty ?? 0,
    }))
    if (priorityParam) {
      mapped = mapped.filter((order) => order.priority === priorityParam)
    }

    const start = (page - 1) * limit
    return {
      data: {
        data: mapped.slice(start, start + limit),
        pagination: {
          total: mapped.length,
          page,
          limit,
        },
      },
    }
  }

  if (/^\/orders\/[^/]+$/.test(url)) {
    const id = url.split('/')[2]
    const order = await trpcQuery<any>('orders.getById', { id })
    const outlet = await trpcQuery<any>('outlets.getById', { id: order.outletId }).catch(() => null)
    return {
      data: {
        data: {
          ...order,
          outlet: outlet ? { id: outlet.id, name: outlet.name } : undefined,
        },
      },
    }
  }

  if (/^\/warehouses\/[^/]+\/stock$/.test(url)) {
    const warehouseId = url.split('/')[2]
    const q = (config?.params?.q as string | undefined) || undefined
    const listItems = await trpcListAll<any>('inventory.stockList', { warehouseId, q })
    return {
      data: {
        data: listItems.map((item) => ({
          id: item.id,
          warehouseId: item.warehouseId,
          productId: item.productId,
          productName: item.product.name,
          sku: item.product.sku,
          currentQty: item.currentQty,
          reservedQty: item.reservedQty,
          inTransitQty: item.inTransitQty,
          availableQty: item.currentQty - item.reservedQty,
          reorderPoint: 0,
          safetyStockQty: 0,
          updatedAt: item.updatedAt,
        })),
      },
    }
  }

  if (/^\/warehouses\/[^/]+$/.test(url)) {
    const id = url.split('/')[2]
    const warehouse = await trpcQuery<any>('warehouses.getById', { id })
    const stockItems = await trpcListAll<any>('inventory.stockList', { warehouseId: id }).catch(() => [])
    const summary = stockItems.reduce(
      (acc, row) => {
        acc.skuCount += 1
        acc.totalUnits += row.currentQty
        acc.reservedUnits += row.reservedQty
        acc.inTransitUnits += row.inTransitQty
        acc.availableUnits += row.currentQty - row.reservedQty
        return acc
      },
      { skuCount: 0, totalUnits: 0, reservedUnits: 0, inTransitUnits: 0, availableUnits: 0 },
    )
    return {
      data: {
        data: {
          ...warehouse,
          summary,
        },
      },
    }
  }

  if (url === '/warehouses/products/options') {
    const listItems = await trpcListAll<any>('products.list')
    return {
      data: {
        data: listItems.map((product) => ({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
        })),
      },
    }
  }

  if (url === '/warehouses/orders/assignment-queue') {
    const [orders, outletsIndex] = await Promise.all([
      trpcListAll<any>('orders.list', { status: 'pending_approval' }),
      getOutletsIndex(),
    ])
    return {
      data: {
        data: orders.map((order) => ({
          ...order,
          waitDays: Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24))),
          assignmentQueueScore: 0,
          outlet: outletsIndex.byId.get(order.outletId)
            ? {
                id: order.outletId,
                name: outletsIndex.byId.get(order.outletId)?.name ?? order.outletId,
              }
            : null,
          recommendation: null,
          warehouseEvaluations: [],
        })),
        total: orders.length,
      },
    }
  }

  if (/^\/planning\/dispatch\/[^/]+\/queue$/.test(url)) {
    const warehouseId = url.split('/')[3]
    const [warehouse, approvedOrders, partialOrders, products, stockRows, outletsIndex] = await Promise.all([
      trpcQuery<any>('warehouses.getById', { id: warehouseId }),
      trpcListAll<any>('orders.list', { status: 'approved' }),
      trpcListAll<any>('orders.list', { status: 'partially_dispatched' }),
      trpcListAll<any>('products.list'),
      trpcListAll<any>('inventory.stockList', { warehouseId }),
      getOutletsIndex(),
    ])

    const productNameBySku = new Map<string, string>()
    for (const product of products) {
      const sku = String(product.sku ?? '')
      if (!sku) continue
      productNameBySku.set(sku, String(product.name ?? sku))
    }

    const availableByProductId = new Map<string, number>()
    for (const row of stockRows) {
      const currentQty = Number(row.currentQty ?? 0)
      const reservedQty = Number(row.reservedQty ?? 0)
      availableByProductId.set(row.productId, Math.max(0, currentQty - reservedQty))
    }

    const priorityWeight: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 }
    const queueOrders = [...approvedOrders, ...partialOrders]
      .filter((order) => {
        const outlet = outletsIndex.byId.get(order.outletId)
        return outlet?.warehouseId === warehouseId
      })
      .sort((a, b) => {
        const byPriority = (priorityWeight[String(b.priority)] ?? 0) - (priorityWeight[String(a.priority)] ?? 0)
        if (byPriority !== 0) return byPriority
        return new Date(String(a.createdAt)).getTime() - new Date(String(b.createdAt)).getTime()
      })

    const items = queueOrders.map((order) => {
      const lines = (order.lines ?? []).map((line: any) => {
        const qtyOrdered = Number(line.qtyOrdered ?? 0)
        const qtyDispatched = Number(line.qtyDispatched ?? 0)
        const qtyRemaining = Math.max(0, qtyOrdered - qtyDispatched)
        const availableNow = Math.max(0, Number(availableByProductId.get(line.productId) ?? 0))
        const qtyDispatchable = Math.min(qtyRemaining, availableNow)
        const shortage = Math.max(0, qtyRemaining - qtyDispatchable)

        availableByProductId.set(line.productId, Math.max(0, availableNow - qtyDispatchable))

        return {
          orderLineId: line.id,
          productId: line.productId,
          sku: line.sku,
          productName: productNameBySku.get(String(line.sku ?? '')) ?? String(line.sku ?? line.productId),
          qtyRemaining,
          qtyDispatchable,
          shortage,
          availableNow,
        }
      })

      const pendingQty = lines.reduce((sum: number, line: any) => sum + Number(line.qtyRemaining ?? 0), 0)
      const dispatchableQty = lines.reduce((sum: number, line: any) => sum + Number(line.qtyDispatchable ?? 0), 0)
      const shortageQty = lines.reduce((sum: number, line: any) => sum + Number(line.shortage ?? 0), 0)
      const fillRate = pendingQty > 0 ? dispatchableQty / pendingQty : 0
      const classification = shortageQty <= 0 ? 'full' : dispatchableQty > 0 ? 'partial' : 'blocked'
      const createdAt = String(order.createdAt ?? new Date().toISOString())
      const waitFrom = String(order.approvedAt ?? createdAt)
      const daysWaiting = Math.max(
        0,
        Math.floor((Date.now() - new Date(waitFrom).getTime()) / (1000 * 60 * 60 * 24)),
      )
      const baseScore = (priorityWeight[String(order.priority)] ?? 1) * 100 - daysWaiting
      const fillRateWeight = 30
      const finalScore = baseScore + fillRate * fillRateWeight
      const outlet = outletsIndex.byId.get(order.outletId)

      return {
        orderId: order.id,
        orderNumber: order.orderNumber ?? null,
        priority: order.priority,
        status: order.status,
        totalValue: order.totalValue ?? null,
        waitFrom,
        baseScore,
        fillRate,
        fillRateWeight,
        finalScore,
        classification,
        pendingQty,
        dispatchableQty,
        shortageQty,
        lines,
        outlet: outlet
          ? {
              id: outlet.id,
              name: outlet.name,
              outletCode: outlet.outletCode ?? '',
              outletPaymentScore: 0,
            }
          : null,
      }
    })

    const totals = items.reduce(
      (acc, item) => {
        acc.orders += 1
        if (item.classification === 'full') acc.full += 1
        if (item.classification === 'partial') acc.partial += 1
        if (item.classification === 'blocked') acc.blocked += 1
        acc.pendingQty += item.pendingQty
        acc.dispatchableQty += item.dispatchableQty
        return acc
      },
      { orders: 0, full: 0, partial: 0, blocked: 0, pendingQty: 0, dispatchableQty: 0 },
    )

    return {
      data: {
        data: {
          warehouse: {
            id: warehouse.id,
            name: warehouse.name,
            location: warehouse.location,
          },
          generatedAt: new Date().toISOString(),
          totals,
          items,
        },
      },
    }
  }

  if (url === '/invoices') {
    const { page, limit } = getPageAndLimit(config)
    const orderId = (config?.params?.orderId as string | undefined) || undefined
    const outletId = (config?.params?.outletId as string | undefined) || undefined
    const q = (config?.params?.q as string | undefined) || undefined
    const allItems = await getInvoiceListView({ orderId, outletId, q })
    const offset = (page - 1) * limit
    const data = allItems.slice(offset, offset + limit)
    return {
      data: {
        data,
        pagination: {
          total: allItems.length,
          page,
          limit,
        },
      },
    }
  }

  if (/^\/invoices\/[^/]+$/.test(url)) {
    const id = url.split('/')[2]
    const invoice = await trpcQuery<any>('invoices.getById', { id })
    const outletsIndex = await getOutletsIndex()
    const paidAmount = Number(invoice.amountPaid ?? 0)
    const remainingAmount = Number(invoice.amountDue ?? 0)
    return {
      data: {
        data: {
          ...invoice,
          total: Number(invoice.total ?? 0),
          paidAmount,
          remainingAmount,
          paymentStatus: invoicePaymentStatus(remainingAmount, paidAmount),
          isOverdue: remainingAmount > 0 && new Date(invoice.invoiceDate).getTime() < Date.now(),
          paymentDate: null,
          outlet: outletsIndex.byId.get(invoice.outletId)
            ? {
                id: invoice.outletId,
                name: outletsIndex.byId.get(invoice.outletId)?.name ?? invoice.outletId,
              }
            : undefined,
        },
      },
    }
  }

  if (url === '/dispatches') {
    const { page, limit } = getPageAndLimit(config)
    const warehouseId = (config?.params?.warehouseId as string | undefined) || undefined
    const deliveryStatus = (config?.params?.deliveryStatus as string | undefined) || undefined
    const orderId = (config?.params?.orderId as string | undefined) || undefined
    let allItems = await getDispatchListView({ warehouseId, deliveryStatus })
    if (orderId) {
      allItems = allItems.filter((dispatch) =>
        (dispatch.lines ?? []).some((line: any) => String(line.orderId ?? '') === orderId),
      )
    }
    const offset = (page - 1) * limit
    const data = allItems.slice(offset, offset + limit)
    return {
      data: {
        data,
        pagination: {
          total: allItems.length,
          page,
          limit,
        },
      },
    }
  }

  if (/^\/dispatches\/[^/]+$/.test(url)) {
    const id = url.split('/')[2]
    const dispatch = await trpcQuery<any>('dispatches.getById', { id })
    const [warehouses, order, outletsIndex] = await Promise.all([
      trpcListAll<any>('warehouses.list'),
      trpcQuery<any>('orders.getById', { id: dispatch.lines?.[0]?.orderId ?? '' }).catch(() => null),
      getOutletsIndex(),
    ])
    const warehouse = warehouses.find((item) => item.id === dispatch.warehouseId)
    const outlet = order?.outletId ? outletsIndex.byId.get(order.outletId) : null

    return {
      data: {
        data: {
          ...dispatch,
          orderId: dispatch.lines?.[0]?.orderId ?? '',
          warehouse: warehouse
            ? { id: warehouse.id, name: warehouse.name, location: warehouse.location ?? null }
            : null,
          order: order
            ? {
                id: order.id,
                outlet: outlet
                  ? {
                      id: outlet.id,
                      name: outlet.name,
                      outletCode: outlet.outletCode ?? null,
                    }
                  : undefined,
              }
            : undefined,
        },
      },
    }
  }

  if (url === '/orgs') {
    return { data: { data: [] } }
  }

  if (url === '/field/agents/active') {
    return { data: { data: [] } }
  }

  if (url === '/field/shifts') {
    return { data: { data: [] } }
  }

  if (/^\/field\/shifts\/[^/]+\/trail$/.test(url) || /^\/field\/shifts\/[^/]+\/visits$/.test(url)) {
    return { data: { data: [] } }
  }

  if (url === '/tickets') {
    const page = Number(config?.params?.page ?? 1)
    const limit = Number(config?.params?.limit ?? 20)
    const status = typeof config?.params?.status === 'string' ? config.params.status : undefined
    const q = typeof config?.params?.q === 'string' ? config.params.q : undefined
    const response = await trpcQuery<any>('serviceComplaints.list', {
      cursor: null,
      limit: Math.max(1, Math.min(limit, 100)),
      status,
      q,
    })
    const items = Array.isArray(response?.items) ? response.items : []
    return {
      data: {
        data: items,
        pagination: {
          total: Number(response?.tabCounts?.all ?? items.length),
          page,
          limit,
        },
        tabCounts: response?.tabCounts ?? null,
      },
    }
  }

  if (/^\/tickets\/[^/]+$/.test(url)) {
    const id = url.split('/')[2]
    const detail = await trpcQuery<any>('serviceComplaints.detail', { id })
    const serialInsights = await Promise.all(
      (detail?.lines ?? []).flatMap((line: any) => {
        const jobs: Array<Promise<any>> = []
        if (line?.serialNumber) {
          jobs.push(
            trpcQuery<any>('serviceSerials.resolve', { serial: line.serialNumber }).then((resolved) => ({
              lineId: line.id,
              role: 'old',
              serial: line.serialNumber,
              resolved,
            })),
          )
        }
        if (line?.replacementSerialNumber) {
          jobs.push(
            trpcQuery<any>('serviceSerials.resolve', { serial: line.replacementSerialNumber }).then((resolved) => ({
              lineId: line.id,
              role: 'replacement',
              serial: line.replacementSerialNumber,
              resolved,
            })),
          )
        }
        return jobs
      }),
    )
    return {
      data: {
        data: {
          ...detail,
          serialInsights,
        },
      },
    }
  }

  if (url === '/service/serials') {
    const serial = String(config?.params?.q ?? config?.params?.serial ?? '')
    if (!serial) return { data: { data: null } }
    const resolved = await trpcQuery<any>('serviceSerials.resolve', { serial })
    return { data: { data: resolved } }
  }

  if (url === '/service/serials/eligibility') {
    const serial = String(config?.params?.serial ?? '')
    if (!serial) return { data: { data: null } }
    const result = await trpcQuery<any>('serviceSerials.replacementEligibility', { serial })
    return { data: { data: result } }
  }

  if (/^\/tickets\/[^/]+\/submissions$/.test(url)) {
    const id = url.split('/')[2]
    const subs = await trpcQuery<any>('serviceForms.listSubmissions', { complaintId: id })
    return { data: { data: Array.isArray(subs) ? subs : [] } }
  }

  if (url === '/service/forms/templates') {
    const withFields = config?.params?.withFields === 'true' || config?.params?.withFields === true
    const templates = await trpcQuery<any>('serviceForms.listTemplates', {
      isActive: true,
      withFields,
    })
    return { data: { data: Array.isArray(templates) ? templates : [] } }
  }

  if (url === '/service/integrations/clients') {
    const clients = await trpcQuery<any>('serviceIntegrations.listClients', undefined)
    return { data: { data: clients } }
  }

  if (url === '/settings/billing/charges') {
    const result = await trpcQuery<{ items: any[] }>('taxCharges.list', undefined)
    return { data: { data: result.items } }
  }

  if (url === '/settings/billing/profile') {
    const profile = await trpcQuery<any>('orgBillingProfile.get', undefined)
    return { data: { data: profile } }
  }

  if (url === '/notifications/unread-count') {
    return { data: { data: { count: 0 } } }
  }

  if (url === '/notifications') {
    const page = Number(config?.params?.page ?? 1)
    const limit = Number(config?.params?.limit ?? 20)
    return {
      data: {
        data: [],
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 1,
        },
      },
    }
  }

  if (url === '/accounts/outstanding') {
    const [outlets, invoices] = await Promise.all([
      trpcListAll<any>('outlets.list'),
      trpcListAll<any>('invoices.list'),
    ])

    const dueByOutlet = new Map<string, number>()
    for (const invoice of invoices) {
      const due = Number(invoice.amountDue ?? 0)
      if (!Number.isFinite(due) || due <= 0) continue
      dueByOutlet.set(invoice.outletId, (dueByOutlet.get(invoice.outletId) ?? 0) + due)
    }

    const rows = outlets
      .map((outlet) => {
        const outstandingBalance = dueByOutlet.get(outlet.id) ?? 0
        const creditLimit = Number(outlet.creditLimit ?? 0)
        const availableCredit = Math.max(0, creditLimit - outstandingBalance)
        const creditUtilisationPct = creditLimit > 0 ? (outstandingBalance / creditLimit) * 100 : 0
        return {
          outletId: outlet.id,
          outletCode: outlet.outletCode ?? outlet.id,
          outletName: outlet.name ?? outlet.id,
          outstandingBalance,
          creditLimit,
          availableCredit,
          creditUtilisationPct,
        }
      })
      .filter((row) => row.outstandingBalance > 0)
      .sort((a, b) => b.outstandingBalance - a.outstandingBalance || a.outletName.localeCompare(b.outletName))

    return {
      data: {
        data: {
          totalOutlets: rows.length,
          totalOutstanding: rows.reduce((sum, row) => sum + row.outstandingBalance, 0),
          rows,
        },
      },
    }
  }

  if (url === '/accounts/ar-aging') {
    const [outlets, invoices] = await Promise.all([
      trpcListAll<any>('outlets.list'),
      trpcListAll<any>('invoices.list'),
    ])
    const outletById = new Map(outlets.map((outlet) => [outlet.id, outlet]))
    const bucketByOutlet = new Map<
      string,
      { current: number; band0_30: number; band31_60: number; band60_plus: number; total: number }
    >()

    for (const invoice of invoices) {
      const remaining = Number(invoice.amountDue ?? 0)
      if (!Number.isFinite(remaining) || remaining <= 0) continue

      const ageDays = daysSince(String(invoice.invoiceDate))
      const outletId = String(invoice.outletId)
      const bucket = bucketByOutlet.get(outletId) ?? {
        current: 0,
        band0_30: 0,
        band31_60: 0,
        band60_plus: 0,
        total: 0,
      }

      if (ageDays <= 0) bucket.current += remaining
      else if (ageDays <= 30) bucket.band0_30 += remaining
      else if (ageDays <= 60) bucket.band31_60 += remaining
      else bucket.band60_plus += remaining
      bucket.total += remaining

      bucketByOutlet.set(outletId, bucket)
    }

    const rows = Array.from(bucketByOutlet.entries())
      .map(([outletId, bucket]) => {
        const outlet = outletById.get(outletId)
        return {
          outletId,
          outletCode: outlet?.outletCode ?? outletId,
          outletName: outlet?.name ?? outletId,
          current: bucket.current,
          band0_30: bucket.band0_30,
          band31_60: bucket.band31_60,
          band60_plus: bucket.band60_plus,
          total: bucket.total,
        }
      })
      .sort((a, b) => b.total - a.total || a.outletName.localeCompare(b.outletName))

    const totals = rows.reduce(
      (acc, row) => {
        acc.current += row.current
        acc.band0_30 += row.band0_30
        acc.band31_60 += row.band31_60
        acc.band60_plus += row.band60_plus
        acc.totalOutstanding += row.total
        return acc
      },
      {
        current: 0,
        band0_30: 0,
        band31_60: 0,
        band60_plus: 0,
        totalOutstanding: 0,
      },
    )

    return {
      data: {
        data: {
          generatedAt: new Date().toISOString(),
          totals,
          rows,
        },
      },
    }
  }

  if (/^\/accounts\/outlet\/[^/]+\/financial-profile$/.test(url)) {
    const outletId = url.split('/')[3]
    const outlet = await trpcQuery<any>('outlets.getById', { id: outletId }).catch(() => null)
    const creditLimit = Number(outlet?.creditLimit ?? 0)
    const outstandingBalance = Number(outlet?.outstandingBalance ?? 0)
    return {
      data: {
        data: {
          outstandingBalance,
          creditLimit,
          availableCredit: Math.max(0, creditLimit - outstandingBalance),
          creditUtilisationPct: creditLimit > 0 ? (outstandingBalance / creditLimit) * 100 : 0,
          overdueInvoices: {
            count: 0,
            total: 0,
            oldestDate: null,
          },
        },
      },
    }
  }

  if (/^\/accounts\/outlets\/[^/]+\/payments$/.test(url)) {
    const outletId = url.split('/')[3]
    const { page, limit } = getPageAndLimit(config)
    const allPayments = await trpcListAll<any>('payments.list', { outletId })
    const invoices = await trpcListAll<any>('invoices.list', { outletId })
    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]))

    const normalized = allPayments.map((payment) => {
      const allocations = (payment.allocations ?? []).map((allocation: any) => {
        const invoice = invoiceById.get(allocation.invoiceId)
        return {
          ...allocation,
          amount: Number(allocation.amount ?? 0),
          invoiceNumber: invoice?.invoiceNumber ?? allocation.invoiceId,
          invoiceDate: invoice?.invoiceDate ?? allocation.allocatedAt,
        }
      })
      const allocatedAmount = allocations.reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0)
      return {
        ...payment,
        amount: Number(payment.amount ?? 0),
        allocatedAmount,
        allocatedInvoices: allocations.length,
        allocations,
      }
    })

    const offset = (page - 1) * limit
    const data = normalized.slice(offset, offset + limit)
    return {
      data: {
        data,
        pagination: {
          total: normalized.length,
          page,
          limit,
        },
      },
    }
  }

  return null
}

async function phase1Post(url: string, body?: any): Promise<unknown | null> {
  if (url === '/auth/login') {
    const session = await trpcMutation<any>('auth.login', body)
    const permissions = (session.user.role?.permissions ?? []) as string[]
    setActorId(session.user.id)
    return {
      data: {
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          userType: session.user.userType,
          isActive: true,
        },
        role: session.user.roleId,
        permissions,
        managedWarehouseId: session.user.managedWarehouseId ?? null,
        context: {
          userType: session.user.userType,
          permissions,
          isGlobalScope: true,
        },
      },
    }
  }

  if (url === '/auth/logout') {
    await trpcMutation('auth.logout', {})
    setActorId(null)
    return { data: { ok: true } }
  }

  if (url === '/roles') {
    const role = await trpcMutation<any>('roles.create', {
      name: String(body?.name ?? '').trim(),
      permissions: Array.isArray(body?.permissions) ? body.permissions.map((value: unknown) => String(value)) : [],
      isSystem: typeof body?.isSystem === 'boolean' ? body.isSystem : false,
    })
    return { data: { data: role } }
  }

  if (url === '/users') {
    const rolesIndex = await getRolesIndex()
    const roleId = rolesIndex.byName.get(body.role)?.id
    if (!roleId) {
      throw makeApiError(`Unknown role: ${body.role}`)
    }
    const user = await trpcMutation<any>('users.create', {
      email: body.email,
      name: body.name,
      password: body.password,
      userType: 'internal',
      roleId,
      isActive: true,
    })
    return { data: user }
  }

  if (/^\/outlets\/[^/]+\/users$/.test(url)) {
    const outletIdMatch = url.match(/^\/outlets\/([^/]+)\/users$/)
    const outletId = outletIdMatch?.[1]
    const outletRole = normalizeOutletRole(body?.role)
    const rolesIndex = await getRolesIndex()
    const roleId = resolveOutletRoleId(rolesIndex, outletRole)

    const user = await trpcMutation<any>('users.create', {
      email: body?.email,
      name: body?.name,
      password: body?.password,
      userType: 'outlet',
      roleId,
      isActive: true,
    })

    // Link the new user to the outlet so auth.me returns the correct outletId.
    if (outletId) {
      await trpcMutation<any>('outlets.update', { id: outletId, userId: user.id })
    }

    return {
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        isActive: Boolean(user.isActive),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        outletRole,
      },
    }
  }

  if (url === '/users/invitations') {
    const invite = await trpcMutation<any>('invitations.create', {
      email: body.email,
      name: body.name,
      role: body.role,
      expiresAt: asIsoAfterHours(body.expiresInHours ?? 72),
    })
    return {
      data: {
        ...invite,
        inviteLink: `${window.location.origin}/invite/accept?token=${invite.token}`,
      },
    }
  }

  if (/^\/users\/invitations\/[^/]+\/revoke$/.test(url)) {
    const id = url.split('/')[3]
    const invite = await trpcMutation('invitations.revoke', { id })
    return { data: invite }
  }

  if (url === '/users/invitations/accept') {
    throw makeApiError('Invitation accept password flow is not available in Phase 1 backend. Ask an admin to activate your account.', 400)
  }

  if (url === '/catalog/brands') {
    const brand = await trpcMutation<any>('brands.create', {
      name: body.name,
      description: body.description,
      isActive: true,
    })
    const logoImage = typeof body?.logoImage === 'string' ? body.logoImage.trim() : ''
    if (logoImage) {
      await replaceEntityImages({ brandId: brand.id }, [logoImage])
    }
    return { data: brand }
  }

  if (url === '/catalog/categories') {
    const category = await trpcMutation<any>('categories.create', {
      brandId: body.brandId,
      name: body.name,
      description: body.description,
      sortOrder: body.sortOrder ?? 0,
      isActive: body.isActive ?? true,
    })
    const icon = typeof body?.icon === 'string' ? body.icon.trim() : ''
    if (icon) {
      await replaceEntityImages({ categoryId: category.id }, [icon])
    }
    return { data: category }
  }

  if (url === '/catalog/skus') {
    const product = await trpcMutation<any>('products.create', {
      categoryId: body.categoryId,
      name: body.name,
      displayName: body.displayName,
      sku: body.skuCode,
      description: body.description,
      specs: body.details?.customFields
        ? Object.fromEntries((body.details.customFields as Array<{ key: string; value: unknown }>).map((f) => [f.key, f.value]))
        : null,
      warrantyMonths: Number(body.warrantyMonths ?? 0),
      basePrice: String(body.basePrice ?? '0'),
      sortOrder: body.sortOrder ?? 0,
      isActive: body.isActive ?? true,
    })
    const images = Array.isArray(body?.images) ? body.images.map((row: unknown) => String(row).trim()).filter(Boolean) : []
    if (images.length > 0) {
      await replaceEntityImages({ productId: product.id }, images)
    }
    return { data: product }
  }

  if (url === '/catalog/skus/import') {
    throw makeApiError('SKU import is not available in Phase 1 backend.', 400)
  }

  if (url === '/outlets') {
    const actorId = getActorId()
    if (!actorId) {
      throw makeApiError('Missing logged in actor context', 401)
    }
    const requestedWarehouseId =
      typeof body?.warehouseId === 'string' && body.warehouseId.trim().length > 0 ? body.warehouseId.trim() : null

    if (requestedWarehouseId) {
      await trpcQuery<any>('warehouses.getById', { id: requestedWarehouseId }).catch(() => {
        throw makeApiError('Invalid warehouseId', 400)
      })
    }

    const existingOutlets = await trpcListAll<any>('outlets.list')
    let userIdForOutlet = actorId

    if (existingOutlets.some((outlet) => outlet.userId === actorId)) {
      const rolesIndex = await getRolesIndex()
      const actor = await trpcQuery<any>('auth.me', undefined)
      const fallbackRoleId = actor?.roleId ?? rolesIndex.roles[0]?.id
      const roleId = rolesIndex.byName.get('Sales')?.id ?? fallbackRoleId
      if (!roleId) {
        throw makeApiError('Unable to resolve role for outlet user creation', 500)
      }

      const emailBase = String(body?.name ?? 'outlet')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '') || 'outlet'
      const nonce = Date.now()
      const outletUser = await trpcMutation<any>('users.create', {
        email: `${emailBase}.${nonce}@outlet.local`,
        name: body?.ownerName ?? body?.name ?? `Outlet User ${nonce}`,
        password: `Outlet@${nonce}`,
        userType: 'outlet',
        roleId,
        isActive: true,
      })
      userIdForOutlet = outletUser.id
    }

    const outlet = await trpcMutation('outlets.create', {
      outletCode: `OUT-${Date.now()}`,
      userId: userIdForOutlet,
      warehouseId: requestedWarehouseId,
      name: body.name,
      ownerName: body.ownerName,
      phone: body.phone,
      address: body.address,
      creditLimit: '0',
      isActive: true,
    })
    return { data: { data: outlet } }
  }

  if (url === '/warehouses') {
    const warehouse = await trpcMutation('warehouses.create', {
      name: body.name,
      location: body.location,
      address: body.address,
      managerId: null,
      isActive: true,
    })
    return { data: warehouse }
  }

  if (url === '/orders') {
    const lines = Array.isArray(body?.lines)
      ? body.lines
      : Array.isArray(body?.items)
        ? body.items.map((item: any) => ({
            productId: item.productId,
            qtyOrdered: Number(item.qty),
            unitPrice: String(item.unitPrice ?? '0'),
          }))
        : []
    const order = await trpcMutation('orders.create', {
      outletId: body.outletId,
      orderDate: body.orderDate,
      deliveryAddress: body.deliveryAddress,
      priority: body.priority ?? 'medium',
      notes: body.notes ?? null,
      lines,
    })
    return { data: { data: order } }
  }

  if (/^\/accounts\/outlets\/[^/]+\/payments\/preview$/.test(url)) {
    const outletId = url.split('/')[3]
    const amountRaw = body?.amount
    const amount = typeof amountRaw === 'string' ? Number(amountRaw) : Number(amountRaw ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw makeApiError('Payment amount must be greater than zero', 400)
    }

    const invoices = await getInvoiceListView({ outletId })
    const openInvoices = invoices
      .filter((row) => Number(row.remainingAmount ?? 0) > 0)
      .sort((a, b) => {
        const dateDiff = new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime()
        if (dateDiff !== 0) return dateDiff
        return a.id.localeCompare(b.id)
      })

    let remaining = amount
    const allocations: Array<{
      invoiceId: string
      invoiceNumber: string
      invoiceDate: string
      remainingBefore: number
      allocateAmount: number
      remainingAfter: number
    }> = []

    for (const invoice of openInvoices) {
      if (remaining <= 0) break
      const before = Number(invoice.remainingAmount ?? 0)
      const allocate = Math.min(remaining, before)
      if (allocate <= 0) continue
      const after = Math.max(0, before - allocate)
      allocations.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        remainingBefore: before,
        allocateAmount: allocate,
        remainingAfter: after,
      })
      remaining -= allocate
    }

    const totalOutstanding = openInvoices.reduce((sum, invoice) => sum + Number(invoice.remainingAmount ?? 0), 0)
    return {
      data: {
        data: {
          totalOutstanding,
          amountToAllocate: amount - remaining,
          unallocatedAmount: Math.max(0, remaining),
          allocations,
        },
      },
    }
  }

  if (/^\/accounts\/outlets\/[^/]+\/payments$/.test(url)) {
    const outletId = url.split('/')[3]
    const paymentDate = body?.paymentDate
    const payment = await trpcMutation<any>('payments.create', {
      outletId,
      amount: String(body?.amount ?? ''),
      paymentDate: paymentDate ?? undefined,
      reference: body?.reference ?? null,
      description: body?.description ?? null,
    })

    const paymentList = await trpcListAll<any>('payments.list', { outletId })
    const created = paymentList.find((row) => row.id === payment.id) ?? payment
    const invoices = await trpcListAll<any>('invoices.list', { outletId })
    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]))
    const totalOutstandingAfter = invoices.reduce((sum, invoice) => sum + Number(invoice.amountDue ?? 0), 0)
    const allocations = (created.allocations ?? []).map((allocation: any) => {
      const invoice = invoiceById.get(allocation.invoiceId)
      const remainingAfter = Number(invoice?.amountDue ?? 0)
      const allocateAmount = Number(allocation.amount ?? 0)
      return {
        invoiceId: allocation.invoiceId,
        invoiceNumber: invoice?.invoiceNumber ?? allocation.invoiceId,
        invoiceDate: invoice?.invoiceDate ?? allocation.allocatedAt,
        remainingBefore: remainingAfter + allocateAmount,
        allocateAmount,
        remainingAfter,
      }
    })
    const totalOutstandingBefore =
      totalOutstandingAfter +
      allocations.reduce((sum: number, row: { allocateAmount: number }) => sum + row.allocateAmount, 0)

    return {
      data: {
        data: {
          payment: {
            id: created.id,
            amount: Number(created.amount ?? 0),
            paymentDate: created.paymentDate,
          },
          totalOutstandingBefore,
          outletOutstandingAfter: totalOutstandingAfter,
          allocations,
        },
      },
    }
  }

  if (/^\/orders\/[^/]+\/approve$/.test(url)) {
    const id = url.split('/')[2]
    const order = await trpcMutation('orders.transition', { id, action: 'approve', note: body?.note ?? null })
    return { data: order }
  }

  if (/^\/orders\/[^/]+\/reject$/.test(url)) {
    const id = url.split('/')[2]
    const order = await trpcMutation('orders.transition', { id, action: 'reject', note: body?.reason ?? body?.note ?? null })
    return { data: order }
  }

  if (/^\/orders\/[^/]+\/assign-warehouse$/.test(url)) {
    throw makeApiError('Warehouse assignment is not available in Phase 2 backend.', 400)
  }

  if (/^\/planning\/dispatch\/[^/]+\/queue\/refresh$/.test(url)) {
    const warehouseId = url.split('/')[3]
    await trpcQuery<any>('warehouses.getById', { id: warehouseId })
    return { data: { data: { ok: true, refreshedAt: new Date().toISOString() } } }
  }

  if (/^\/planning\/dispatch\/[^/]+\/queue\/execute-selected$/.test(url)) {
    const warehouseId = url.split('/')[3]
    const selections = Array.isArray(body?.selections) ? body.selections : []
    if (selections.length === 0) {
      throw makeApiError('Select at least one order to dispatch', 400)
    }
    const transporterName = String(body?.transporterName ?? '').trim()
    const vehicleNumber = String(body?.vehicleNumber ?? '').trim()
    if (!transporterName) throw makeApiError('Transporter is required', 400)
    if (!vehicleNumber) throw makeApiError('Vehicle number is required', 400)

    const createdDispatches = []
    for (const selection of selections) {
      const lines = Array.isArray(selection?.items)
        ? selection.items
            .map((item: any) => ({
              orderLineId: item.orderLineId,
              qtyDispatched: Number(item.qty ?? 0),
              serialNumbers: Array.isArray(item.serialNumbers) ? item.serialNumbers : [],
            }))
            .filter((line: any) => line.qtyDispatched > 0)
        : []

      if (lines.length === 0) continue

      const created = await trpcMutation<any>('dispatches.create', {
        warehouseId,
        transporterName,
        vehicleNumber,
        lrNumber: selection?.lrNumber ?? null,
        lines,
      })
      createdDispatches.push(created)
    }

    if (createdDispatches.length === 0) {
      throw makeApiError('No dispatchable lines selected', 400)
    }

    return {
      data: {
        data: {
          createdCount: createdDispatches.length,
          dispatchIds: createdDispatches.map((row: any) => row.id),
        },
      },
    }
  }

  if (url === '/dispatches/serials/usage') {
    const inputSerials = Array.isArray(body?.serialNumbers)
      ? body.serialNumbers
          .map((serial: unknown) => String(serial ?? '').trim().toUpperCase())
          .filter((serial: string) => serial.length > 0)
      : []

    const rows = await trpcListAll<any>('dispatches.list')
    const usageBySerial = new Map<string, { dispatchId: string; orderId: string | null; dispatchDate: string }>()
    for (const dispatch of rows) {
      const orderId = dispatch.lines?.[0]?.orderId ?? null
      for (const line of dispatch.lines ?? []) {
        for (const serial of Array.isArray(line.serialNumbers) ? line.serialNumbers : []) {
          const normalized = String(serial).trim().toUpperCase()
          if (!normalized || usageBySerial.has(normalized)) continue
          usageBySerial.set(normalized, {
            dispatchId: dispatch.id,
            orderId,
            dispatchDate: dispatch.dispatchDate,
          })
        }
      }
    }

    return {
      data: {
        data: {
          serials: inputSerials.map((serial: string) => {
            const usage = usageBySerial.get(serial)
            return {
              serialNumber: serial,
              used: Boolean(usage),
              dispatchId: usage?.dispatchId ?? null,
              orderId: usage?.orderId ?? null,
              dispatchDate: usage?.dispatchDate ?? null,
              outletName: null,
            }
          }),
        },
      },
    }
  }

  if (/^\/tickets\/[^/]+\/claim$/.test(url)) {
    const id = url.split('/')[2]
    const assignment = await trpcMutation<any>('serviceAssignments.assign', {
      complaintId: id,
      note: body?.note ?? 'Claimed by current service user',
    })
    return { data: { data: assignment } }
  }

  if (/^\/tickets\/[^/]+\/route$/.test(url)) {
    const id = url.split('/')[2]
    const assignment = await trpcMutation<any>('serviceAssignments.reassign', {
      complaintId: id,
      asiUserId: body?.asiUserId ?? null,
      seUserId: body?.seUserId ?? null,
      note: body?.note ?? null,
    })
    return { data: { data: assignment } }
  }

  if (/^\/tickets\/[^/]+\/comments$/.test(url)) {
    const id = url.split('/')[2]
    const updated = await trpcMutation<any>('serviceComplaints.update', {
      id,
      resolutionNote: body?.comment ?? body?.note ?? null,
    })
    return { data: { data: updated } }
  }

  if (/^\/tickets\/[^/]+\/close$/.test(url)) {
    const id = url.split('/')[2]
    const closeMode = String(body?.mode ?? '').trim().toLowerCase()
    if (closeMode === 'telephonic') {
      const closed = await trpcMutation<any>('serviceComplaints.transition', {
        id,
        action: 'telephonic_close',
        note: body?.reason ?? body?.note ?? 'Closed telephonically',
      })
      return { data: { data: closed } }
    }
    const closed = await trpcMutation<any>('serviceComplaints.transition', {
      id,
      action: 'tested_ok_close',
      note: body?.reason ?? body?.note ?? 'Closed after service test',
    })
    return { data: { data: closed } }
  }

  if (/^\/tickets\/[^/]+\/reopen$/.test(url)) {
    throw makeApiError('Complaint reopening is not supported. Raise a new complaint.', 400)
  }

  if (/^\/tickets\/[^/]+\/assign$/.test(url)) {
    const id = url.split('/')[2]
    const op = body?.reassign ? 'serviceAssignments.reassign' : 'serviceAssignments.assign'
    const assigned = await trpcMutation<any>(op, {
      complaintId: id,
      asiUserId: body?.asiUserId ?? null,
      seUserId: body?.seUserId ?? null,
      note: body?.note ?? null,
    })
    return { data: { data: assigned } }
  }

  if (/^\/tickets\/[^/]+\/forms$/.test(url)) {
    const id = url.split('/')[2]
    const submitted = await trpcMutation<any>('serviceForms.submitForm', {
      complaintId: id,
      templateId: body?.templateId,
      values: Array.isArray(body?.values) ? body.values : [],
    })
    return { data: { data: submitted } }
  }

  // Test report submission (separate from form submission)
  if (/^\/tickets\/[^/]+\/test-submit$/.test(url)) {
    const id = url.split('/')[2]
    const submitted = await trpcMutation<any>('serviceTests.submit', {
      complaintId: id,
      complaintLineId: body?.complaintLineId ?? null,
      verdict: body?.verdict ?? 'warranty_candidate',
      summary: body?.summary ?? body?.note ?? '',
      structuredData: body?.structuredData ?? {},
    })
    return { data: { data: submitted } }
  }

  if (/^\/tickets\/[^/]+\/transition$/.test(url)) {
    const id = url.split('/')[2]
    const transitioned = await trpcMutation<any>('serviceComplaints.transition', {
      id,
      action: body?.action,
      note: body?.note ?? null,
    })
    return { data: { data: transitioned } }
  }

  if (/^\/tickets\/[^/]+\/warranty\/approve$/.test(url)) {
    const id = url.split('/')[2]
    const approved = await trpcMutation<any>('serviceWarranty.approve', {
      complaintId: id,
      sourceWarehouseId: body?.sourceWarehouseId,
      note: body?.note ?? null,
    })
    return { data: { data: approved } }
  }

  if (/^\/tickets\/[^/]+\/warranty\/reject$/.test(url)) {
    const id = url.split('/')[2]
    const rejected = await trpcMutation<any>('serviceWarranty.reject', {
      complaintId: id,
      reason: body?.reason ?? body?.note ?? 'Rejected by service team',
    })
    return { data: { data: rejected } }
  }

  if (/^\/tickets\/[^/]+\/replacement$/.test(url)) {
    const id = url.split('/')[2]
    const assigned = await trpcMutation<any>('serviceWarranty.assignReplacement', {
      complaintId: id,
      complaintLineId: body?.complaintLineId,
      replacementSerial: body?.replacementSerial,
    })
    return { data: { data: assigned } }
  }

  if (/^\/tickets\/[^/]+\/fulfillment-order$/.test(url)) {
    const id = url.split('/')[2]
    const created = await trpcMutation<any>('serviceWarranty.createFulfillmentOrder', {
      complaintId: id,
      sourceWarehouseId: body?.sourceWarehouseId,
      deliveryAddress: body?.deliveryAddress,
      lines: body?.lines ?? [],
    })
    return { data: { data: created } }
  }

  if (url === '/tickets') {
    const created = await trpcMutation<any>('serviceComplaints.create', {
      title: body?.title || undefined,
      description: body?.description || undefined,
      outletId: body?.outletId || undefined,
      lines: Array.isArray(body?.lines)
        ? body.lines.map((line: any) => ({
            serialNumber: line.serialNumber,
            productId: line.productId ?? undefined,
            notes: line.notes ?? undefined,
          }))
        : [],
    })
    return { data: { data: created } }
  }

  if (url === '/service/integrations/clients') {
    const result = await trpcMutation<any>('serviceIntegrations.createClient', {
      name: body?.name,
      scopes: body?.scopes ?? [],
      expiresAt: body?.expiresAt ?? undefined,
    })
    return { data: { data: result } }
  }

  if (/^\/service\/integrations\/clients\/[^/]+\/rotate$/.test(url)) {
    const clientId = url.split('/')[4]
    const result = await trpcMutation<any>('serviceIntegrations.rotateSecret', { clientId })
    return { data: { data: result } }
  }

  if (/^\/service\/integrations\/clients\/[^/]+\/revoke$/.test(url)) {
    const clientId = url.split('/')[4]
    const result = await trpcMutation<any>('serviceIntegrations.revokeClient', { clientId })
    return { data: { data: result } }
  }

  if (/^\/invoices\/[^/]+\/charges$/.test(url)) {
    const id = url.split('/')[2]
    const result = await trpcMutation<any>('invoices.updateCharges', { invoiceId: id, charges: body.charges })
    return { data: { data: result } }
  }

  if (url === '/settings/billing/charges/preview') {
    const result = await trpcQuery<any>('invoices.previewCharges', { subtotal: body?.subtotal ?? '0' })
    return { data: { data: result } }
  }

  if (url === '/settings/billing/charges') {
    const charge = await trpcMutation<any>('taxCharges.create', {
      name: body.name,
      type: body.type,
      rate: String(body.rate ?? '0'),
      isActive: body.isActive ?? true,
      displayOrder: body.displayOrder ?? 0,
    })
    return { data: { data: charge } }
  }

  if (url === '/settings/billing/profile') {
    const profile = await trpcMutation<any>('orgBillingProfile.upsert', body)
    return { data: { data: profile } }
  }

  if (url === '/settings/billing/charges/reorder') {
    const result = await trpcMutation<any>('taxCharges.reorder', { orderedIds: body.orderedIds })
    return { data: { data: result.items } }
  }

  if (url === '/notifications/read-all') {
    return { data: { ok: true } }
  }

  if (/^\/warehouses\/[^/]+\/stock\/grn$/.test(url)) {
    const warehouseId = url.split('/')[2]
    const sourceType = body?.sourceType === 'production_batch' ? 'production_line_movement' : 'manual'
    const receipt = await trpcMutation('inventory.createGoodsReceipt', {
      warehouseId,
      sourceType,
      sourceBatchId: body?.sourceBatchId ?? null,
      receiptDate: body?.receiptDate,
      notes: body?.notes ?? null,
      lines: (body?.lines ?? []).map((line: any) => ({
        productId: line.productId,
        qtyReceived: Number(line.qtyReceived),
      })),
    })
    return { data: receipt }
  }

  if (/^\/warehouses\/[^/]+\/stock\/adjust$/.test(url)) {
    const warehouseId = url.split('/')[2]
    const adjustment = await trpcMutation('inventory.createStockAdjustment', {
      warehouseId,
      productId: body?.productId,
      adjustmentQty: Number(body?.adjustmentQty),
      reason: body?.reason,
    })
    return { data: adjustment }
  }

  if (url === '/service/forms/templates') {
    const created = await trpcMutation<any>('serviceForms.createTemplate', {
      name: body?.name,
      description: body?.description ?? undefined,
      fields: body?.fields ?? undefined,
    })
    return { data: { data: created } }
  }

  if (/^\/service\/forms\/templates\/[^/]+\/fields$/.test(url)) {
    const templateId = url.split('/')[4]
    const added = await trpcMutation<any>('serviceForms.addField', {
      templateId,
      fieldKey: body?.fieldKey,
      label: body?.label,
      fieldType: body?.fieldType ?? 'text',
      isRequired: body?.isRequired ?? true,
      displayOrder: body?.displayOrder ?? 0,
      validationRules: body?.validationRules ?? undefined,
    })
    return { data: { data: added } }
  }

  if (/^\/service\/forms\/templates\/[^/]+\/disable$/.test(url)) {
    const templateId = url.split('/')[4]
    const disabled = await trpcMutation<any>('serviceForms.disableTemplate', { id: templateId })
    return { data: { data: disabled } }
  }

  return null
}

async function phase1Patch(url: string, body?: any): Promise<unknown | null> {
  if (/^\/roles\/[^/]+$/.test(url)) {
    const id = url.split('/')[2]
    const payload: Record<string, unknown> = { id }
    if (typeof body?.name === 'string') payload.name = body.name
    if (Array.isArray(body?.permissions)) payload.permissions = body.permissions.map((value: unknown) => String(value))
    if (typeof body?.isSystem === 'boolean') payload.isSystem = body.isSystem
    const role = await trpcMutation<any>('roles.update', payload)
    return { data: { data: role } }
  }

  if (/^\/users\/[^/]+\/password$/.test(url)) {
    const id = url.split('/')[2]
    const nextPassword = String(body?.newPassword ?? '').trim()
    if (nextPassword.length < 8) {
      throw makeApiError('Password must be at least 8 characters.', 400)
    }
    const result = await trpcMutation('users.changePassword', { id, password: nextPassword })
    return { data: result }
  }

  if (/^\/users\/[^/]+$/.test(url)) {
    const id = url.split('/')[2]
    const payload: Record<string, unknown> = { id }
    if (typeof body.name === 'string') payload.name = body.name
    if (typeof body.isActive === 'boolean') payload.isActive = body.isActive
    if (typeof body.role === 'string') {
      const rolesIndex = await getRolesIndex()
      const roleId = rolesIndex.byName.get(body.role)?.id
      if (!roleId) throw makeApiError(`Unknown role: ${body.role}`)
      payload.roleId = roleId
    }
    const user = await trpcMutation('users.update', payload)
    return { data: user }
  }

  if (/^\/users\/[^/]+\/role$/.test(url)) {
    const id = url.split('/')[2]
    const rolesIndex = await getRolesIndex()
    const roleId = rolesIndex.byName.get(body.role)?.id
    if (!roleId) throw makeApiError(`Unknown role: ${body.role}`)
    const user = await trpcMutation('users.update', { id, roleId })
    return { data: user }
  }

  if (/^\/catalog\/brands\/[^/]+$/.test(url)) {
    const id = url.split('/')[3]
    const brand = await trpcMutation('brands.update', {
      id,
      name: body.name,
      description: body.description,
      isActive: body.isActive,
    })
    if (Object.prototype.hasOwnProperty.call(body ?? {}, 'logoImage')) {
      const logoImage = typeof body?.logoImage === 'string' ? body.logoImage.trim() : ''
      await replaceEntityImages({ brandId: id }, logoImage ? [logoImage] : [])
    }
    return { data: brand }
  }

  if (/^\/catalog\/categories\/[^/]+$/.test(url)) {
    const id = url.split('/')[3]
    const category = await trpcMutation('categories.update', {
      id,
      brandId: body.brandId,
      name: body.name,
      description: body.description,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
    })
    if (Object.prototype.hasOwnProperty.call(body ?? {}, 'icon')) {
      const icon = typeof body?.icon === 'string' ? body.icon.trim() : ''
      await replaceEntityImages({ categoryId: id }, icon ? [icon] : [])
    }
    return { data: category }
  }

  if (/^\/catalog\/skus\/[^/]+$/.test(url)) {
    const id = url.split('/')[3]
    const product = await trpcMutation('products.update', {
      id,
      categoryId: body.categoryId,
      name: body.name,
      displayName: body.displayName,
      sku: body.skuCode,
      description: body.description,
      specs: body.details?.customFields
        ? Object.fromEntries((body.details.customFields as Array<{ key: string; value: unknown }>).map((f) => [f.key, f.value]))
        : undefined,
      warrantyMonths: body.warrantyMonths,
      basePrice: body.basePrice !== undefined ? String(body.basePrice) : undefined,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
    })
    if (Array.isArray(body?.images)) {
      const images = body.images.map((row: unknown) => String(row).trim()).filter(Boolean)
      await replaceEntityImages({ productId: id }, images)
    }
    return { data: product }
  }

  if (/^\/warehouses\/[^/]+$/.test(url)) {
    const id = url.split('/')[2]
    const payload: Record<string, unknown> = { id }
    if (body.name !== undefined) payload.name = body.name
    if (body.location !== undefined) payload.location = body.location
    if (body.address !== undefined) payload.address = body.address
    if (Object.prototype.hasOwnProperty.call(body ?? {}, 'managerId')) payload.managerId = body.managerId
    if (body.isActive !== undefined) payload.isActive = body.isActive
    const warehouse = await trpcMutation('warehouses.update', payload)
    return { data: warehouse }
  }

  if (/^\/outlets\/[^/]+\/billing$/.test(url)) {
    const id = url.split('/')[2]
    const outlet = await trpcMutation('outlets.updateBilling', {
      id,
      legalName: body.legalName ?? undefined,
      gstin: body.gstin ?? undefined,
      billingAddress1: body.billingAddress1 ?? undefined,
      billingAddress2: body.billingAddress2 ?? undefined,
      billingCity: body.billingCity ?? undefined,
      billingState: body.billingState ?? undefined,
      billingPincode: body.billingPincode ?? undefined,
      billingCountry: body.billingCountry ?? undefined,
    })
    return { data: outlet }
  }

  if (/^\/outlets\/[^/]+$/.test(url)) {
    const id = url.split('/')[2]
    const outlet = await trpcMutation('outlets.update', {
      id,
      warehouseId: body.warehouseId ?? undefined,
      name: body.name,
      ownerName: body.ownerName,
      phone: body.phone,
      address: body.address,
      creditLimit: body.creditLimit !== undefined ? String(body.creditLimit) : undefined,
      isActive: body.isActive,
      legalName: body.legalName ?? undefined,
      gstin: body.gstin ?? undefined,
      billingAddress1: body.billingAddress1 ?? undefined,
      billingAddress2: body.billingAddress2 ?? undefined,
      billingCity: body.billingCity ?? undefined,
      billingState: body.billingState ?? undefined,
      billingPincode: body.billingPincode ?? undefined,
      billingCountry: body.billingCountry ?? undefined,
    })
    return { data: outlet }
  }

  if (/^\/settings\/billing\/charges\/[^/]+$/.test(url)) {
    const id = url.split('/')[4]
    const charge = await trpcMutation<any>('taxCharges.update', {
      id,
      name: body.name,
      type: body.type,
      rate: body.rate !== undefined ? String(body.rate) : undefined,
      isActive: body.isActive,
      displayOrder: body.displayOrder,
    })
    return { data: { data: charge } }
  }

  if (/^\/tickets\/[^/]+\/priority$/.test(url)) {
    const id = url.split('/')[2]
    const updated = await trpcMutation<any>('serviceComplaints.update', {
      id,
      resolutionNote: body?.priority ? `Priority updated to ${body.priority}` : null,
    })
    return { data: { data: updated } }
  }

  if (/^\/notifications\/[^/]+\/read$/.test(url)) {
    return { data: { ok: true } }
  }

  return null
}

async function phase1Delete(url: string): Promise<unknown | null> {
  if (/^\/users\/[^/]+$/.test(url)) {
    throw makeApiError('User delete is not available in Phase 1 backend.', 400)
  }
  if (/^\/roles\/[^/]+$/.test(url)) {
    throw makeApiError('Role delete is not available in Phase 1 backend.', 400)
  }
  if (/^\/settings\/billing\/charges\/[^/]+$/.test(url)) {
    const id = url.split('/')[4]
    await trpcMutation<any>('taxCharges.delete', { id })
    return { data: { ok: true } }
  }
  return null
}

async function resolveGet<T = unknown>(url: string, config?: RequestConfig): Promise<ApiSuccess<T>> {
  const phase1 = await phase1Get(url, config)
  if (phase1 !== null) return phase1 as ApiSuccess<T>

  const response = await fallbackApi.get<T>(url, config)
  return { data: response.data as T }
}

async function resolvePost<T = unknown>(url: string, body?: unknown, config?: RequestConfig): Promise<ApiSuccess<T>> {
  const phase1 = await phase1Post(url, body)
  if (phase1 !== null) return phase1 as ApiSuccess<T>

  const response = await fallbackApi.post<T>(url, body, config)
  return { data: response.data as T }
}

async function resolvePatch<T = unknown>(url: string, body?: unknown, config?: RequestConfig): Promise<ApiSuccess<T>> {
  const phase1 = await phase1Patch(url, body)
  if (phase1 !== null) return phase1 as ApiSuccess<T>

  const response = await fallbackApi.patch<T>(url, body, config)
  return { data: response.data as T }
}

async function resolvePut<T = unknown>(url: string, body?: unknown, config?: RequestConfig): Promise<ApiSuccess<T>> {
  const response = await fallbackApi.put<T>(url, body, config)
  return { data: response.data as T }
}

async function resolveDelete<T = unknown>(url: string, config?: RequestConfig): Promise<ApiSuccess<T>> {
  const phase1 = await phase1Delete(url)
  if (phase1 !== null) return phase1 as ApiSuccess<T>

  const response = await fallbackApi.delete<T>(url, config)
  return { data: response.data as T }
}

fallbackApi.interceptors.response.use(
  (res) => res,
  (err) => {
    const requestUrl = (err?.config?.url as string | undefined) ?? ''
    const isAuthStateProbe = requestUrl.includes('/auth/me')
    if (err.response?.status === 401 && !isAuthStateProbe && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export const api = {
  get: resolveGet,
  post: resolvePost,
  patch: resolvePatch,
  put: resolvePut,
  delete: resolveDelete,
}

export { trpcQuery, trpcMutation, getActorId }

const sseBaseURL = import.meta.env.DEV
  ? 'http://localhost:3000'
  : (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:3000'

export function openFieldSenseStream(
  onLocation: (payload: {
    agentId: string
    shiftId: string
    lat: number
    lng: number
    accuracy?: number
    recordedAt: string
    receivedAt: string
  }) => void,
  signal: AbortSignal,
): void {
  const actorId = getActorId()
  const url = `${sseBaseURL}/field/live-stream`

  let reconnectDelay = 1000
  const MAX_DELAY = 30_000
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function connect() {
    if (signal.aborted) return

    fetch(url, {
      signal,
      headers: {
        Accept: 'text/event-stream',
        ...(actorId ? { 'x-actor-id': actorId } : {}),
      },
    })
      .then(async (res) => {
        if (signal.aborted) return
        if (!res.ok || !res.body) {
          scheduleReconnect()
          return
        }
        // Successful connection — reset backoff
        reconnectDelay = 1000
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const chunks = buffer.split('\n\n')
            buffer = chunks.pop() ?? ''
            for (const chunk of chunks) {
              let eventType = 'message'
              let data = ''
              for (const line of chunk.split('\n')) {
                if (line.startsWith('event: ')) eventType = line.slice(7).trim()
                else if (line.startsWith('data: ')) data = line.slice(6).trim()
              }
              if ((eventType === 'location-update' || eventType === 'location') && data) {
                try { onLocation(JSON.parse(data)) } catch { /* ignore malformed */ }
              }
            }
          }
        } catch {
          // reader aborted or network error mid-stream
        }
        // Stream ended — reconnect unless aborted
        scheduleReconnect()
      })
      .catch(() => {
        // fetch itself failed (network error or abort)
        scheduleReconnect()
      })
  }

  function scheduleReconnect() {
    if (signal.aborted) return
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY)
      connect()
    }, reconnectDelay)
  }

  // Cancel any pending reconnect when the signal fires
  signal.addEventListener('abort', () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  })

  connect()
}
