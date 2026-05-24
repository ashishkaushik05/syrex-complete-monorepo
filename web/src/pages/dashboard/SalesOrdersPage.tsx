import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatCurrencyINR, timeAgo, titleCase } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'
import { usePermission } from '@/context/PermissionContext'

type OrderStatus =
  | 'pending_approval'
  | 'on_hold'
  | 'approved'
  | 'partially_dispatched'
  | 'fully_dispatched'
  | 'rejected'
  | 'cancelled'

type StatusFilter = 'all' | OrderStatus

type OutletOption = {
  id: string
  name: string
  outletCode: string
  phone: string
  address: string
  isActive: boolean
  warehouseId?: string | null
}

type WarehouseOption = {
  id: string
  isActive: boolean
}

type ProductOption = {
  id: string
  name: string
  displayName: string
  sku: string
  skuCode: string
  brand: string | null
  category: string | null
  type: string | null
  basePrice: number | string
}

type OrderLine = {
  id: string
  sku: string
  qtyOrdered: number
  qtyDispatched: number
  unitPrice: number | string
}

type OrderPriority = 'low' | 'medium' | 'high' | 'critical'
type DispatchDeliveryLabel = 'created' | 'in_transit' | 'delivered' | null

type SalesOrder = {
  id: string
  orderNumber?: string
  outletId: string
  orgId: string
  status: OrderStatus
  priority?: OrderPriority
  deliveryAddress: string
  subtotalValue?: string | number
  discountType?: 'percentage' | 'fixed' | null
  discountRate?: string | number
  discountAmount?: string | number
  taxableValue?: string | number
  taxTotal?: string | number
  totalValue?: string | number
  paymentTermsDays?: number
  taxSnapshot?: unknown
  notes?: string | null
  createdAt: string
  outlet?: {
    id: string
    name: string
  }
  lines?: OrderLine[]
  linkedInvoices?: string[]
  dispatchedQty?: number
  dispatchCount?: number
  dispatchDeliveryLabel?: DispatchDeliveryLabel
}

type PaginatedResponse<T> = {
  data: T[]
  pagination: {
    total: number
    page: number
    limit: number
  }
}

type ToastState = {
  text: string
  type: 'success' | 'error'
} | null

type MaybeNested<T> = T | { data?: T }

function unwrapNested<T>(payload: MaybeNested<T> | undefined): T | undefined {
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
    return payload.data
  }
  return payload as T | undefined
}

function normalizePaginated<T>(
  payload: MaybeNested<PaginatedResponse<T>> | undefined,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  const candidate = payload as unknown
  if (
    candidate &&
    typeof candidate === 'object' &&
    'pagination' in candidate &&
    'data' in candidate &&
    Array.isArray((candidate as PaginatedResponse<T>).data)
  ) {
    return candidate as PaginatedResponse<T>
  }
  const nested = unwrapNested(payload)
  if (nested && Array.isArray(nested.data) && nested.pagination) {
    return nested
  }
  return {
    data: [],
    pagination: { total: 0, page, limit },
  }
}

const ORDER_STATUS_TABS: Array<{ key: OrderStatus; label: string }> = [
  { key: 'pending_approval', label: 'Pending Approval' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'approved', label: 'Approved' },
  { key: 'partially_dispatched', label: 'Partially Dispatched' },
  { key: 'fully_dispatched', label: 'Fully Dispatched' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
]

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function statusBadgeClass(status: OrderStatus) {
  if (status === 'approved' || status === 'fully_dispatched') {
    return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  }
  if (status === 'pending_approval' || status === 'partially_dispatched') {
    return 'border-amber-300 bg-amber-100 text-amber-800'
  }
  if (status === 'on_hold') {
    return 'border-orange-300 bg-orange-100 text-orange-800'
  }
  if (status === 'rejected' || status === 'cancelled') {
    return 'border-red-300 bg-red-100 text-red-800'
  }
  return 'border-slate-300 bg-slate-100 text-slate-700'
}

function priorityBadgeClass(priority: OrderPriority) {
  if (priority === 'critical') return 'border-red-300 bg-red-100 text-red-800'
  if (priority === 'high') return 'border-amber-300 bg-amber-100 text-amber-800'
  if (priority === 'medium') return 'border-blue-300 bg-blue-100 text-blue-800'
  return 'border-slate-300 bg-slate-100 text-slate-500'
}

function deliveryLabelBadge(label: DispatchDeliveryLabel): { text: string; cls: string } | null {
  if (!label) return null
  if (label === 'delivered') return { text: 'Delivered', cls: 'border-emerald-300 bg-emerald-100 text-emerald-800' }
  if (label === 'in_transit') return { text: 'In Transit', cls: 'border-blue-300 bg-blue-100 text-blue-800' }
  return { text: 'Not Shipped', cls: 'border-slate-300 bg-slate-100 text-slate-500' }
}

export function SalesOrdersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { can } = usePermission()
  const canCreateOrder = can('orders:write')

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createStep, setCreateStep] = useState(1)
  const [selectedOutletId, setSelectedOutletId] = useState<string>('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed' | null>(null)
  const [discountRate, setDiscountRate] = useState('0')
  const [paymentTermsDays, setPaymentTermsDays] = useState('30')
  const [outletSearch, setOutletSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [debouncedProductSearch, setDebouncedProductSearch] = useState('')
  const [qtyByProductId, setQtyByProductId] = useState<Record<string, number>>({})
  const [createError, setCreateError] = useState<string | null>(null)

  const [toast, setToast] = useState<ToastState>(null)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedProductSearch(productSearch.trim())
    }, 250)
    return () => window.clearTimeout(timer)
  }, [productSearch])

  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter, debouncedSearch, pageSize])

  const ordersQuery = useQuery<PaginatedResponse<SalesOrder>>({
    queryKey: ['sales-orders-list', statusFilter, currentPage, pageSize, debouncedSearch],
    queryFn: async () => {
      const response = await api.get<MaybeNested<PaginatedResponse<SalesOrder>>>('/orders', {
        params: {
          page: currentPage,
          limit: pageSize,
          status: statusFilter === 'all' ? undefined : statusFilter,
          q: debouncedSearch || undefined,
        },
      })
      const payload = response.data as MaybeNested<PaginatedResponse<SalesOrder>> | undefined
      return normalizePaginated(payload, currentPage, pageSize)
    },
  })

  const statusCountsQuery = useQuery<Record<StatusFilter, number>>({
    queryKey: ['sales-orders-status-counts'],
    queryFn: async () => {
      const allResponse = await api.get<MaybeNested<PaginatedResponse<SalesOrder>>>('/orders', {
        params: { page: 1, limit: 1 },
      })
      const statusResponses = await Promise.allSettled(
        ORDER_STATUS_TABS.map((tab) =>
          api.get<MaybeNested<PaginatedResponse<SalesOrder>>>('/orders', {
            params: { page: 1, limit: 1, status: tab.key },
          }),
        ),
      )

      const unwrapTotal = (value: MaybeNested<PaginatedResponse<SalesOrder>> | undefined) => {
        const pageData = normalizePaginated(value, 1, 1)
        return Number(pageData?.pagination?.total ?? 0)
      }

      const counts = {
        all: unwrapTotal(allResponse.data),
      } as Record<StatusFilter, number>

      ORDER_STATUS_TABS.forEach((tab, index) => {
        const response = statusResponses[index]
        counts[tab.key] = response.status === 'fulfilled' ? unwrapTotal(response.value.data) : 0
      })

      return counts
    },
  })

  const outletsQuery = useQuery<OutletOption[]>({
    queryKey: ['sales-order-create-outlets'],
    enabled: createModalOpen,
    queryFn: async () => {
      const response = await api.get<MaybeNested<PaginatedResponse<OutletOption>>>('/outlets', {
        params: { page: 1, limit: 200, isActive: true },
      })
      const payload = response.data as MaybeNested<PaginatedResponse<OutletOption>> | undefined
      const pageData = normalizePaginated(payload, 1, 200)
      return pageData?.data ?? []
    },
  })

  const productsQuery = useQuery<ProductOption[]>({
    queryKey: ['sales-order-create-products', debouncedProductSearch],
    enabled: createModalOpen,
    queryFn: async () => {
      const endpoint = debouncedProductSearch ? '/catalog/search' : '/catalog/skus'
      const response = await api.get<MaybeNested<ProductOption[]>>(endpoint, {
        params: debouncedProductSearch
          ? { q: debouncedProductSearch, limit: 200 }
          : { includeInactive: false, q: undefined },
      })
      const payload = response.data as MaybeNested<ProductOption[]> | undefined
      const unwrapped = unwrapNested(payload)
      if (Array.isArray(unwrapped)) return unwrapped
      return []
    },
  })

  const warehousesQuery = useQuery<WarehouseOption[]>({
    queryKey: ['sales-order-create-warehouses'],
    enabled: createModalOpen,
    queryFn: async () => {
      const response = await api.get<{ data: { data: WarehouseOption[] } }>('/warehouses')
      return response.data.data.data ?? []
    },
  })

  const [productCacheById, setProductCacheById] = useState<Record<string, ProductOption>>({})

  useEffect(() => {
    if (!productsQuery.data) return
    setProductCacheById((prev) => {
      const next = { ...prev }
      for (const product of productsQuery.data) {
        next[product.id] = product
      }
      return next
    })
  }, [productsQuery.data])

  const createOrderMutation = useMutation<SalesOrder, Error, void>({
    mutationFn: async () => {
      const outlet = outletsQuery.data?.find((item) => item.id === selectedOutletId)
      if (!outlet) {
        throw new Error('Please select an outlet')
      }
      if (outlet.isActive === false) {
        throw new Error('Selected outlet is inactive. Activate the outlet before creating an order.')
      }
      if (!outlet.warehouseId) {
        throw new Error('Selected outlet has no assigned warehouse. Assign a warehouse before creating an order.')
      }

      const warehouse = (warehousesQuery.data ?? []).find((item) => item.id === outlet.warehouseId)
      if (warehouse && !warehouse.isActive) {
        throw new Error('Selected outlet is linked to an inactive warehouse. Activate the warehouse before creating an order.')
      }

      const selectedItems = selectedLineItems

      if (selectedItems.length === 0) {
        throw new Error('Add at least one line item')
      }

      if (!deliveryAddress.trim()) {
        throw new Error('Delivery address is required')
      }

      const response = await api.post<MaybeNested<SalesOrder>>('/orders', {
        outletId: outlet.id,
        deliveryAddress: deliveryAddress.trim(),
        priority: 'medium',
        discountType,
        discountRate: discountType ? discountRate : '0',
        paymentTermsDays: Math.max(0, Math.min(365, Number(paymentTermsDays || 30))),
        notes: notes.trim() || undefined,
        lines: selectedItems.map((item) => ({
          productId: item.product.id,
          qtyOrdered: item.qty,
          unitPrice: String(toNumber(item.product.basePrice)),
        })),
      })
      const payload = response.data as MaybeNested<SalesOrder> | undefined
      const created = unwrapNested(payload)
      if (!created?.id) {
        throw new Error('Order creation did not return an order id')
      }
      return created
    },
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales-orders-list'] }),
        queryClient.invalidateQueries({ queryKey: ['sales-orders-status-counts'] }),
      ])
      setCreateModalOpen(false)
      setToast({ text: 'Order created', type: 'success' })
      navigate(`/dashboard/sales/orders/${created.id}`)
    },
    onError: (error) => {
      setCreateError(apiErrorMessage(error, 'Could not create order'))
    },
  })

  const selectedOutlet = useMemo(() => {
    if (!selectedOutletId) return null
    return outletsQuery.data?.find((item) => item.id === selectedOutletId) ?? null
  }, [outletsQuery.data, selectedOutletId])

  useEffect(() => {
    if (!selectedOutlet) return
    setDeliveryAddress(selectedOutlet.address ?? '')
  }, [selectedOutlet])

  useEffect(() => {
    if (!createModalOpen) return
    setCreateStep(1)
    setSelectedOutletId('')
    setDeliveryAddress('')
    setNotes('')
    setDiscountType(null)
    setDiscountRate('0')
    setPaymentTermsDays('30')
    setOutletSearch('')
    setProductSearch('')
    setDebouncedProductSearch('')
    setQtyByProductId({})
    setProductCacheById({})
    setCreateError(null)
  }, [createModalOpen])

  const rows = ordersQuery.data?.data ?? []
  const totalRows = ordersQuery.data?.pagination.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const pageStart = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = totalRows === 0 ? 0 : Math.min(currentPage * pageSize, totalRows)

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const ordersLoadError = ordersQuery.isError ? apiErrorMessage(ordersQuery.error, 'Unable to load orders.') : null
  const statusTabsLoadError = statusCountsQuery.isError
    ? apiErrorMessage(statusCountsQuery.error, 'Unable to load order status counts.')
    : null
  const outletsLoadError = outletsQuery.isError
    ? apiErrorMessage(outletsQuery.error, 'Unable to load outlets for order creation.')
    : null
  const warehousesLoadError = warehousesQuery.isError
    ? apiErrorMessage(warehousesQuery.error, 'Unable to load warehouses for outlet validation.')
    : null
  const productsLoadError = productsQuery.isError
    ? apiErrorMessage(productsQuery.error, 'Unable to load SKUs for order creation.')
    : null

  const filteredOutlets = useMemo(() => {
    const data = outletsQuery.data ?? []
    const keyword = outletSearch.trim().toLowerCase()
    if (!keyword) return data
    return data.filter((outlet) => {
      return (
        outlet.name.toLowerCase().includes(keyword) ||
        outlet.outletCode.toLowerCase().includes(keyword) ||
        outlet.phone.toLowerCase().includes(keyword)
      )
    })
  }, [outletsQuery.data, outletSearch])

  const filteredProducts = useMemo(() => {
    return productsQuery.data ?? []
  }, [productsQuery.data])

  const selectedLineItems = useMemo(() => {
    return Object.entries(qtyByProductId)
      .map(([productId, qty]) => ({
        product: productCacheById[productId],
        qty,
      }))
      .filter((item): item is { product: ProductOption; qty: number } => Boolean(item.product) && item.qty > 0)
  }, [qtyByProductId, productCacheById])

  const runningTotal = useMemo(() => {
    return selectedLineItems.reduce((sum, item) => {
      return sum + toNumber(item.product.basePrice) * item.qty
    }, 0)
  }, [selectedLineItems])

  const discountAmount = useMemo(() => {
    const rate = toNumber(discountRate)
    if (!discountType || runningTotal <= 0 || rate <= 0) return 0
    if (discountType === 'percentage') return Math.min(runningTotal, (runningTotal * Math.min(rate, 100)) / 100)
    return Math.min(runningTotal, rate)
  }, [discountRate, discountType, runningTotal])

  const taxableSubtotal = Math.max(0, runningTotal - discountAmount)

  const chargesPreviewQuery = useQuery({
    queryKey: ['order-charges-preview', runningTotal, discountType, discountRate],
    enabled: createStep === 3 && runningTotal > 0,
    queryFn: async () => {
      const resp = await api.post('/settings/billing/charges/preview', {
        subtotal: String(runningTotal),
        discountType,
        discountRate,
      })
      return (resp as any).data.data as {
        charges: Array<{ taxChargeId: string; name: string; type: 'percentage' | 'fixed'; rate: string; amount: string; displayOrder: number }>
        discountAmount: string
        taxableSubtotal: string
        subtotal: string
        total: string
      }
    },
  })

  const setProductQty = (productId: string, qty: number) => {
    setQtyByProductId((prev) => {
      if (qty <= 0) {
        const next = { ...prev }
        delete next[productId]
        return next
      }
      return {
        ...prev,
        [productId]: qty,
      }
    })
  }

  const nextStep = () => {
    setCreateError(null)
    if (createStep === 1) {
      if (!selectedOutlet) {
        setCreateError('Select an outlet to continue')
        return
      }
      if (selectedOutlet.isActive === false) {
        setCreateError('Selected outlet is inactive. Activate the outlet before creating an order.')
        return
      }
      if (!selectedOutlet.warehouseId) {
        setCreateError('Selected outlet has no assigned warehouse. Assign a warehouse before creating an order.')
        return
      }
      const selectedWarehouse = (warehousesQuery.data ?? []).find((warehouse) => warehouse.id === selectedOutlet.warehouseId)
      if (selectedWarehouse && !selectedWarehouse.isActive) {
        setCreateError('Selected outlet is linked to an inactive warehouse. Activate the warehouse before creating an order.')
        return
      }
      if (!deliveryAddress.trim()) {
        setCreateError('Delivery address is required')
        return
      }
      setCreateStep(2)
      return
    }

    if (createStep === 2) {
      if (selectedLineItems.length === 0) {
        setCreateError('Add at least one line item')
        return
      }
      setCreateStep(3)
      return
    }

    const discountRateValue = toNumber(discountRate)
    if (discountRateValue < 0) {
      setCreateError('Discount rate must be non-negative')
      return
    }
    if (discountType === 'percentage' && discountRateValue > 100) {
      setCreateError('Discount percentage cannot exceed 100')
      return
    }
    const terms = Number(paymentTermsDays)
    if (!Number.isFinite(terms) || terms < 0 || terms > 365) {
      setCreateError('Payment terms must be between 0 and 365 days')
      return
    }

    createOrderMutation.mutate()
  }

  const previousStep = () => {
    setCreateError(null)
    setCreateStep((step) => Math.max(1, step - 1))
  }

  return (
    <div className="space-y-4">
      {toast ? (
        <div className="fixed right-4 top-4 z-40">
          <div
            className={`rounded-lg px-4 py-2 text-sm font-medium shadow-md ${
              toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.text}
          </div>
        </div>
      ) : null}

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold">Sales Orders</CardTitle>
            {canCreateOrder && (
              <Button onClick={() => setCreateModalOpen(true)} size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                New Order
              </Button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="orders-search">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="orders-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-8"
                  placeholder="Order ID, outlet, address..."
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="flex min-w-max items-center gap-2">
              <Button
                type="button"
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('all')}
              >
                All ({statusCountsQuery.data?.all ?? 0})
              </Button>
              {ORDER_STATUS_TABS.map((tab) => (
                <Button
                  key={tab.key}
                  type="button"
                  variant={statusFilter === tab.key ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(tab.key)}
                >
                  {tab.label} ({statusCountsQuery.data?.[tab.key] ?? 0})
                </Button>
              ))}
            </div>
          </div>

          {statusTabsLoadError ? <p className="text-sm text-amber-700">{statusTabsLoadError}</p> : null}
        </CardHeader>

        <CardContent>
          {ordersQuery.isLoading ? <p className="text-sm text-slate-500">Loading orders...</p> : null}
          {ordersLoadError ? <p className="text-sm text-red-600">{ordersLoadError}</p> : null}

          {!ordersQuery.isLoading && !ordersQuery.isError ? (
            rows.length === 0 ? (
              <p className="text-sm text-slate-500">No orders found for current filter.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Outlet</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Invoices</TableHead>
                      <TableHead>Dispatched</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((order) => {
                      const total = (order.lines ?? []).reduce((sum, line) => {
                        return sum + line.qtyOrdered * toNumber(line.unitPrice)
                      }, 0)
                      const totalOrderedQty = (order.lines ?? []).reduce((sum, line) => sum + Number(line.qtyOrdered ?? 0), 0)
                      const dispatchedQtyFromLines = (order.lines ?? []).reduce(
                        (sum, line) => sum + Number(line.qtyDispatched ?? 0),
                        0,
                      )
                      const dispatchedQty = Number(order.dispatchedQty ?? dispatchedQtyFromLines)
                      const invoiceNumbers = order.linkedInvoices ?? []
                      const deliveryBadge = deliveryLabelBadge(order.dispatchDeliveryLabel ?? null)
                      return (
                        <TableRow
                          key={order.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/dashboard/sales/orders/${order.id}`)}
                        >
                          <TableCell>
                            <p className="font-medium text-slate-900">
                              {order.orderNumber ? order.orderNumber : `Order ${order.id.slice(0, 8)}`}
                            </p>
                            <p className="text-xs text-slate-500 line-clamp-1">{order.deliveryAddress}</p>
                          </TableCell>
                          <TableCell>{order.outlet?.name ?? order.outletId}</TableCell>
                          <TableCell>
                            {order.priority ? (
                              <Badge className={priorityBadgeClass(order.priority)}>{titleCase(order.priority)}</Badge>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusBadgeClass(order.status)}>{titleCase(order.status)}</Badge>
                          </TableCell>
                          <TableCell>
                            {invoiceNumbers.length > 0 ? (
                              <div className="space-y-0.5">
                                {invoiceNumbers.slice(0, 2).map((invoiceNumber) => (
                                  <p key={invoiceNumber} className="text-xs text-slate-700">
                                    {invoiceNumber}
                                  </p>
                                ))}
                                {invoiceNumbers.length > 2 ? (
                                  <p className="text-xs text-slate-500">+{invoiceNumbers.length - 2} more</p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">No invoice</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm text-slate-900">
                              {dispatchedQty}/{totalOrderedQty}
                            </p>
                            <p className="text-xs text-slate-500">{order.dispatchCount ?? 0} dispatches</p>
                            {deliveryBadge ? (
                              <Badge className={`mt-1 ${deliveryBadge.cls}`}>{deliveryBadge.text}</Badge>
                            ) : null}
                          </TableCell>
                          <TableCell>{order.lines?.length ?? 0}</TableCell>
                          <TableCell>{formatCurrencyINR(toNumber(order.totalValue ?? total))}</TableCell>
                          <TableCell>{timeAgo(order.createdAt)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )
          ) : null}

          {!ordersQuery.isLoading && !ordersQuery.isError ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-600">
                Showing {pageStart}-{pageEnd} of {totalRows}
              </p>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600" htmlFor="orders-page-size">
                  Rows
                </label>
                <select
                  id="orders-page-size"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                >
                  Previous
                </Button>
                <span className="min-w-24 text-center text-sm text-slate-700">
                  Page {currentPage} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-h-[92vh] w-[95vw] max-w-[1400px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Sales Order</DialogTitle>
            <DialogDescription>
              Step {createStep} of 3: {createStep === 1 ? 'Outlet' : createStep === 2 ? 'Line Items' : 'Review'}
            </DialogDescription>
          </DialogHeader>

          {createStep === 1 ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="outlet-search">Search Outlet</Label>
                <Input
                  id="outlet-search"
                  value={outletSearch}
                  onChange={(event) => setOutletSearch(event.target.value)}
                  placeholder="Search by name, code or phone..."
                />
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {outletsQuery.isLoading ? <p className="text-sm text-slate-500">Loading outlets...</p> : null}
                {outletsLoadError ? <p className="text-sm text-red-600">{outletsLoadError}</p> : null}
                {warehousesLoadError ? <p className="text-sm text-red-600">{warehousesLoadError}</p> : null}
                {filteredOutlets.map((outlet) => {
                  const selected = selectedOutletId === outlet.id
                  return (
                    <button
                      key={outlet.id}
                      type="button"
                      onClick={() => setSelectedOutletId(outlet.id)}
                      className={`w-full rounded-lg border p-3 text-left ${
                        selected ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <p className="font-medium text-slate-900">{outlet.name}</p>
                      <p className="text-xs text-slate-500">
                        {outlet.outletCode} · {outlet.phone}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 line-clamp-1">{outlet.address}</p>
                    </button>
                  )
                })}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="delivery-address">Delivery Address</Label>
                <p className="text-xs text-slate-400">Auto-filled from the selected outlet. You can edit it.</p>
                <textarea
                  id="delivery-address"
                  value={deliveryAddress}
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                  className="min-h-24 w-full rounded-md border border-slate-200 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="Full delivery address"
                />
              </div>
            </div>
          ) : null}

          {createStep === 2 ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="product-search">Search SKUs</Label>
                <Input
                  id="product-search"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Search by name, SKU, brand or category..."
                />
              </div>
              {productsLoadError ? <p className="text-sm text-red-600">{productsLoadError}</p> : null}

              <div className="max-h-[58vh] overflow-y-auto rounded-lg border border-slate-200">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[44%] whitespace-normal">Product</TableHead>
                      <TableHead className="w-[20%]">SKU</TableHead>
                      <TableHead className="w-[18%]">Unit Price</TableHead>
                      <TableHead className="w-[18%]">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => {
                      const qty = qtyByProductId[product.id] ?? 0
                      const hierarchy = [product.brand, product.category, product.type].filter(Boolean).join(' · ')
                      return (
                        <TableRow key={product.id}>
                          <TableCell className="whitespace-normal break-words">
                            <p className="font-medium text-slate-900 break-words">{product.displayName || product.name}</p>
                            <p className="text-xs text-slate-500 break-words">{hierarchy || '—'}</p>
                          </TableCell>
                          <TableCell className="whitespace-normal break-all">{product.skuCode || product.sku}</TableCell>
                          <TableCell>{formatCurrencyINR(toNumber(product.basePrice))}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-xs"
                                onClick={() => setProductQty(product.id, qty - 1)}
                                disabled={qty <= 0}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-6 text-center text-sm font-medium">{qty}</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-xs"
                                onClick={() => setProductQty(product.id, qty + 1)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                Running total: {formatCurrencyINR(runningTotal)}
              </div>
            </div>
          ) : null}

          {createStep === 3 ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 p-3 text-sm">
                <p>
                  <span className="font-medium text-slate-900">Outlet:</span> {selectedOutlet?.name ?? '-'}
                </p>
                <p className="mt-1">
                  <span className="font-medium text-slate-900">Delivery:</span> {deliveryAddress || '-'}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="order-discount-type">Discount Type</Label>
                  <select
                    id="order-discount-type"
                    value={discountType ?? 'none'}
                    onChange={(event) =>
                      setDiscountType(event.target.value === 'none' ? null : (event.target.value as 'percentage' | 'fixed'))
                    }
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                  >
                    <option value="none">No discount</option>
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="order-discount-rate">Discount Rate</Label>
                  <Input
                    id="order-discount-rate"
                    type="number"
                    min={0}
                    step="0.01"
                    value={discountRate}
                    onChange={(event) => setDiscountRate(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="order-payment-terms">Payment Terms (Days)</Label>
                  <Input
                    id="order-payment-terms"
                    type="number"
                    min={0}
                    max={365}
                    step={1}
                    value={paymentTermsDays}
                    onChange={(event) => setPaymentTermsDays(event.target.value)}
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedLineItems.map((item) => {
                      const unitPrice = toNumber(item.product.basePrice)
                      return (
                        <TableRow key={item.product.id}>
                          <TableCell>{item.product.displayName || item.product.name}</TableCell>
                          <TableCell>{item.product.skuCode || item.product.sku}</TableCell>
                          <TableCell>{item.qty}</TableCell>
                          <TableCell>{formatCurrencyINR(unitPrice)}</TableCell>
                          <TableCell>{formatCurrencyINR(unitPrice * item.qty)}</TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow>
                      <TableCell colSpan={4} className="text-right text-slate-600">
                        Subtotal
                      </TableCell>
                      <TableCell className="text-slate-600">{formatCurrencyINR(runningTotal)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={4} className="text-right text-slate-600">
                        Discount
                        {discountType ? ` (${discountType === 'percentage' ? `${toNumber(discountRate)}%` : 'fixed'})` : ''}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        -{formatCurrencyINR(chargesPreviewQuery.data ? Number(chargesPreviewQuery.data.discountAmount) : discountAmount)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={4} className="text-right text-slate-600">
                        Taxable Subtotal
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatCurrencyINR(chargesPreviewQuery.data ? Number(chargesPreviewQuery.data.taxableSubtotal) : taxableSubtotal)}
                      </TableCell>
                    </TableRow>
                    {chargesPreviewQuery.data?.charges.map((charge) => (
                      <TableRow key={charge.taxChargeId}>
                        <TableCell colSpan={4} className="text-right text-slate-500 text-xs">
                          {charge.name}
                          {charge.type === 'percentage' ? ` (${charge.rate}%)` : ' (fixed)'}
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs">
                          {formatCurrencyINR(Number(charge.amount))}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={4} className="text-right font-semibold text-slate-900">
                        Total
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900">
                        {chargesPreviewQuery.data
                          ? formatCurrencyINR(Number(chargesPreviewQuery.data.total))
                          : formatCurrencyINR(runningTotal)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="order-notes">Order Notes (Optional)</Label>
                <textarea
                  id="order-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-24 w-full rounded-md border border-slate-200 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="Any special instructions or notes for this order..."
                />
              </div>
            </div>
          ) : null}

          {createError ? <p className="text-sm text-red-600">{createError}</p> : null}

          <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
            <Button type="button" variant="outline" onClick={previousStep} disabled={createStep === 1 || createOrderMutation.isPending}>
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)} disabled={createOrderMutation.isPending}>
                Cancel
              </Button>
              <Button type="button" onClick={nextStep} disabled={createOrderMutation.isPending}>
                {createStep < 3 ? 'Next' : createOrderMutation.isPending ? 'Placing...' : 'Place Order'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
