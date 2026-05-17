import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePermission } from '@/context/PermissionContext'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'

type WarehouseDetail = {
  id: string
  name: string
  location: string
  address?: string | null
  managerId?: string | null
  manager?: { id: string; name: string; email: string } | null
  isActive: boolean
  createdAt: string
  summary: {
    skuCount: number
    totalUnits: number
    reservedUnits: number
    inTransitUnits: number
    availableUnits: number
  }
}

type UserOption = {
  id: string
  name: string
  email: string
  role?: { id: string; name: string } | null
}

type WarehouseStockRow = {
  id: string
  warehouseId: string
  productId: string
  productName: string
  sku: string
  currentQty: number
  reservedQty: number
  inTransitQty: number
  availableQty: number
  reorderPoint: number
  safetyStockQty: number
  updatedAt: string
}

type WarehouseDetailResponse = {
  data: WarehouseDetail
}

type WarehouseStockResponse = {
  data: WarehouseStockRow[]
}

type DispatchActivity = {
  id: string
  orderId: string
  transporterName: string
  vehicleNumber: string
  lrNumber: string | null
  dispatchDate: string
  deliveryStatus: 'created' | 'in_transit' | 'delivered'
  lines: Array<{ qtyDispatched: number }>
}

type DispatchActivityResponse = {
  data: DispatchActivity[]
  pagination: {
    total: number
    page: number
    limit: number
  }
}

type WarehouseProductOptionRow = {
  productId: string
  productName: string
  sku: string
}

type WarehouseProductOptionsResponse = {
  data: WarehouseProductOptionRow[]
}

type GRNLineDraft = {
  productId: string
  productName: string
  sku: string
  qtyReceived: number
}

function badgeClassForAvailability(availableQty: number, reorderPoint: number) {
  if (availableQty <= 0) return 'bg-red-100 text-red-700'
  if (availableQty <= reorderPoint) return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

function deliveryStatusClass(status: DispatchActivity['deliveryStatus']) {
  if (status === 'delivered') return 'bg-emerald-100 text-emerald-700'
  if (status === 'in_transit') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-700'
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

export function WarehouseDetailPage() {
  const params = useParams<{ id: string }>()
  const warehouseId = params.id ?? ''
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { can } = usePermission()
  const canWriteWarehouses = can('warehouses:write')
  const [stockSearch, setStockSearch] = useState('')
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignSearch, setAssignSearch] = useState('')
  const [assignError, setAssignError] = useState<string | null>(null)
  const [grnOpen, setGrnOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [grnSourceType, setGrnSourceType] = useState<'production_batch' | 'external_purchase' | 'manual'>('external_purchase')
  const [grnNotes, setGrnNotes] = useState('')
  const [grnSearch, setGrnSearch] = useState('')
  const [grnLines, setGrnLines] = useState<GRNLineDraft[]>([])
  const [grnError, setGrnError] = useState<string | null>(null)
  const [adjustSearch, setAdjustSearch] = useState('')
  const [adjustProductId, setAdjustProductId] = useState('')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustError, setAdjustError] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['warehouses', 'detail', warehouseId],
    enabled: Boolean(warehouseId),
    queryFn: async () => {
      const response = await api.get<WarehouseDetailResponse>(`/warehouses/${warehouseId}`)
      return response.data.data
    },
  })

  const stockQuery = useQuery({
    queryKey: ['warehouses', 'stock', warehouseId],
    enabled: Boolean(warehouseId),
    queryFn: async () => {
      const response = await api.get<WarehouseStockResponse>(`/warehouses/${warehouseId}/stock`)
      return response.data.data
    },
  })

  const stockRows = stockQuery.data ?? []
  const filteredStockRows = useMemo(() => {
    const term = stockSearch.trim().toLowerCase()
    if (!term) return stockRows
    return stockRows.filter(
      (row) => row.sku.toLowerCase().includes(term) || row.productName.toLowerCase().includes(term),
    )
  }, [stockRows, stockSearch])

  const activityQuery = useQuery({
    queryKey: ['warehouses', 'recent-dispatches', warehouseId],
    enabled: Boolean(warehouseId),
    queryFn: async () => {
      const response = await api.get<DispatchActivityResponse>('/dispatches', {
        params: {
          warehouseId,
          page: 1,
          limit: 6,
        },
      })
      return response.data
    },
  })

  const recentDispatches = activityQuery.data?.data ?? []
  const summary = detailQuery.data?.summary

  const productOptionsQuery = useQuery({
    queryKey: ['warehouses', 'product-options'],
    queryFn: async () => {
      const response = await api.get<WarehouseProductOptionsResponse>('/warehouses/products/options')
      return response.data.data
    },
  })

  const productOptions = useMemo(() => {
    const map = new Map<string, WarehouseProductOptionRow>()
    for (const row of productOptionsQuery.data ?? []) map.set(row.productId, row)
    for (const row of stockRows) {
      if (!map.has(row.productId)) {
        map.set(row.productId, {
          productId: row.productId,
          productName: row.productName,
          sku: row.sku,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.productName.localeCompare(b.productName))
  }, [productOptionsQuery.data, stockRows])

  const grnFilteredOptions = useMemo(() => {
    const term = grnSearch.trim().toLowerCase()
    if (!term) return productOptions.slice(0, 30)
    return productOptions.filter((row) => row.productName.toLowerCase().includes(term) || row.sku.toLowerCase().includes(term))
  }, [productOptions, grnSearch])

  const adjustFilteredOptions = useMemo(() => {
    const term = adjustSearch.trim().toLowerCase()
    if (!term) return productOptions.slice(0, 80)
    return productOptions.filter((row) => row.productName.toLowerCase().includes(term) || row.sku.toLowerCase().includes(term))
  }, [productOptions, adjustSearch])

  const warehouseManagerUsersQuery = useQuery({
    queryKey: ['users', 'warehouse-managers'],
    enabled: assignOpen && canWriteWarehouses,
    queryFn: async () => {
      const response = await api.get<{ data: UserOption[] }>('/users')
      const users = response.data.data ?? (response.data as unknown as UserOption[])
      return users.filter((user) => user.role?.name === 'Warehouse Manager')
    },
  })

  const filteredManagerOptions = useMemo(() => {
    const term = assignSearch.trim().toLowerCase()
    const users = warehouseManagerUsersQuery.data ?? []
    if (!term) return users
    return users.filter(
      (user) => user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term),
    )
  }, [warehouseManagerUsersQuery.data, assignSearch])

  const assignManagerMutation = useMutation({
    mutationFn: async (managerId: string | null) => {
      await api.patch(`/warehouses/${warehouseId}`, { managerId })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['warehouses', 'detail', warehouseId] })
      await queryClient.invalidateQueries({ queryKey: ['warehouses', 'list'] })
      setAssignOpen(false)
      setAssignSearch('')
      setAssignError(null)
    },
    onError: (error) => setAssignError(apiErrorMessage(error, 'Unable to update manager.')),
  })

  const grnMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/warehouses/${warehouseId}/stock/grn`, {
        sourceType: grnSourceType,
        notes: grnNotes.trim() || undefined,
        lines: grnLines.map((line) => ({
          productId: line.productId,
          qtyReceived: line.qtyReceived,
        })),
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['warehouses', 'detail', warehouseId] }),
        queryClient.invalidateQueries({ queryKey: ['warehouses', 'stock', warehouseId] }),
        queryClient.invalidateQueries({ queryKey: ['warehouses', 'recent-dispatches', warehouseId] }),
      ])
      setGrnOpen(false)
      setGrnSourceType('external_purchase')
      setGrnNotes('')
      setGrnSearch('')
      setGrnLines([])
      setGrnError(null)
    },
    onError: (error) => setGrnError(apiErrorMessage(error, 'Unable to record GRN.')),
  })

  const adjustMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/warehouses/${warehouseId}/stock/adjust`, {
        productId: adjustProductId,
        adjustmentQty: Number(adjustQty),
        reason: adjustReason.trim(),
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['warehouses', 'detail', warehouseId] }),
        queryClient.invalidateQueries({ queryKey: ['warehouses', 'stock', warehouseId] }),
      ])
      setAdjustOpen(false)
      setAdjustSearch('')
      setAdjustProductId('')
      setAdjustQty('')
      setAdjustReason('')
      setAdjustError(null)
    },
    onError: (error) => setAdjustError(apiErrorMessage(error, 'Unable to adjust stock.')),
  })

  const addGrnLine = (row: WarehouseProductOptionRow) => {
    if (grnLines.some((line) => line.productId === row.productId)) return
    setGrnLines((current) => [...current, { productId: row.productId, productName: row.productName, sku: row.sku, qtyReceived: 1 }])
  }

  const submitGrn = () => {
    if (grnLines.length === 0) {
      setGrnError('Add at least one GRN line.')
      return
    }
    if (grnLines.some((line) => !Number.isFinite(line.qtyReceived) || line.qtyReceived <= 0)) {
      setGrnError('All quantities must be greater than 0.')
      return
    }
    setGrnError(null)
    grnMutation.mutate()
  }

  const submitAdjustment = () => {
    if (!adjustProductId) {
      setAdjustError('Select a product.')
      return
    }
    const qty = Number(adjustQty)
    if (!Number.isFinite(qty) || qty === 0) {
      setAdjustError('Adjustment qty cannot be 0.')
      return
    }
    if (!adjustReason.trim()) {
      setAdjustError('Reason is required.')
      return
    }
    setAdjustError(null)
    adjustMutation.mutate()
  }

  return (
    <div className="space-y-4">
      {detailQuery.isLoading ? <p className="text-sm text-slate-500">Loading warehouse details...</p> : null}
      {detailQuery.isError ? (
        <p className="text-sm text-red-600">{apiErrorMessage(detailQuery.error, 'Unable to load warehouse details.')}</p>
      ) : null}

      {detailQuery.data ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{detailQuery.data.name}</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setGrnOpen(true)}>
                Record GRN
              </Button>
              <Button variant="outline" onClick={() => setAdjustOpen(true)}>
                Adjust Stock
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
              <p>
                <span className="font-medium text-slate-900">Location:</span> {detailQuery.data.location}
              </p>
              <p>
                <span className="font-medium text-slate-900">Address:</span> {detailQuery.data.address ?? '-'}
              </p>
              <p>
                <span className="font-medium text-slate-900">Warehouse ID:</span> {detailQuery.data.id}
              </p>
              <p>
                <span className="font-medium text-slate-900">Created:</span> {formatDateTime(detailQuery.data.createdAt)}
              </p>
              <p>
                <span className="font-medium text-slate-900">Status:</span>{' '}
                <span className={detailQuery.data.isActive ? 'text-emerald-700' : 'text-slate-500'}>
                  {detailQuery.data.isActive ? 'Active' : 'Inactive'}
                </span>
              </p>
              <div className="flex items-start gap-2">
                <p>
                  <span className="font-medium text-slate-900">Manager:</span>{' '}
                  {detailQuery.data.manager ? (
                    <span>
                      {detailQuery.data.manager.name}{' '}
                      <span className="text-slate-500 text-xs">({detailQuery.data.manager.email})</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">Unassigned</span>
                  )}
                </p>
                {canWriteWarehouses ? (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setAssignOpen(true)}>
                      {detailQuery.data.manager ? 'Change' : 'Assign'}
                    </Button>
                    {detailQuery.data.manager ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs text-red-600 hover:text-red-700"
                        disabled={assignManagerMutation.isPending}
                        onClick={() => assignManagerMutation.mutate(null)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-md border border-slate-200 p-2">
                <p className="text-xs text-slate-500">SKUs Tracked</p>
                <p className="text-lg font-semibold text-slate-900">{summary?.skuCount ?? 0}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-2">
                <p className="text-xs text-slate-500">Total Units</p>
                <p className="text-lg font-semibold text-slate-900">{summary?.totalUnits ?? 0}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-2">
                <p className="text-xs text-slate-500">Reserved</p>
                <p className="text-lg font-semibold text-slate-900">{summary?.reservedUnits ?? 0}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-2">
                <p className="text-xs text-slate-500">In Transit</p>
                <p className="text-lg font-semibold text-slate-900">{summary?.inTransitUnits ?? 0}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-2">
                <p className="text-xs text-slate-500">Available</p>
                <p className="text-lg font-semibold text-emerald-700">{summary?.availableUnits ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Stock</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b border-slate-200 p-3">
            <input
              className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm"
              placeholder="Search stock by SKU or product name"
              value={stockSearch}
              onChange={(event) => setStockSearch(event.target.value)}
            />
          </div>
          {stockQuery.isLoading ? <p className="p-4 text-sm text-slate-500">Loading stock...</p> : null}
          {stockQuery.isError ? (
            <p className="p-4 text-sm text-red-600">{apiErrorMessage(stockQuery.error, 'Unable to load stock.')}</p>
          ) : null}
          {!stockQuery.isLoading && !stockQuery.isError && filteredStockRows.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No stock records for this warehouse.</p>
          ) : null}

          {filteredStockRows.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>Reserved</TableHead>
                    <TableHead>In Transit</TableHead>
                    <TableHead>Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStockRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.sku}</TableCell>
                      <TableCell>{row.productName}</TableCell>
                      <TableCell>{row.currentQty}</TableCell>
                      <TableCell>{row.reservedQty}</TableCell>
                      <TableCell>{row.inTransitQty}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badgeClassForAvailability(
                            row.availableQty,
                            row.reorderPoint,
                          )}`}
                        >
                          {row.availableQty}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Recent Dispatch Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {activityQuery.isLoading ? <p className="p-4 text-sm text-slate-500">Loading recent dispatches...</p> : null}
          {activityQuery.isError ? (
            <p className="p-4 text-sm text-red-600">
              {apiErrorMessage(activityQuery.error, 'Unable to load recent dispatch activity.')}
            </p>
          ) : null}
          {!activityQuery.isLoading && !activityQuery.isError && recentDispatches.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No dispatches recorded for this warehouse yet.</p>
          ) : null}
          {recentDispatches.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dispatch</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentDispatches.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => navigate(`/dashboard/sales/dispatches/${row.id}`)}
                    >
                      <TableCell className="font-mono text-xs text-slate-700">{row.id.slice(0, 8)}</TableCell>
                      <TableCell>{formatDateTime(row.dispatchDate)}</TableCell>
                      <TableCell>
                        {row.transporterName} · {row.vehicleNumber}
                      </TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${deliveryStatusClass(row.deliveryStatus)}`}>
                          {row.deliveryStatus.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.lines.reduce((sum, line) => sum + Number(line.qtyDispatched ?? 0), 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={grnOpen} onOpenChange={setGrnOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record GRN</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">
              Source Type
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={grnSourceType}
                onChange={(event) => setGrnSourceType(event.target.value as 'production_batch' | 'external_purchase' | 'manual')}
              >
                <option value="production_batch">Production Batch</option>
                <option value="external_purchase">External Purchase</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <Input placeholder="Notes (optional)" value={grnNotes} onChange={(event) => setGrnNotes(event.target.value)} />
            <Input placeholder="Search product by name or SKU" value={grnSearch} onChange={(event) => setGrnSearch(event.target.value)} />
            <div className="max-h-36 overflow-y-auto rounded-md border border-slate-200">
              {grnFilteredOptions.length === 0 ? (
                <p className="p-2 text-xs text-slate-500">No matching products.</p>
              ) : (
                grnFilteredOptions.map((row) => (
                  <button
                    key={row.productId}
                    type="button"
                    className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                    onClick={() => addGrnLine(row)}
                  >
                    <span>{row.productName}</span>
                    <span className="text-xs text-slate-500">{row.sku}</span>
                  </button>
                ))
              )}
            </div>
            <div className="space-y-2">
              {grnLines.map((line) => (
                <div key={line.productId} className="grid grid-cols-[1fr_120px_80px] items-center gap-2">
                  <div className="rounded-md border border-slate-200 px-2 py-1 text-sm">{line.productName} ({line.sku})</div>
                  <Input
                    type="number"
                    min={1}
                    value={line.qtyReceived}
                    onChange={(event) => {
                      const qty = Number(event.target.value)
                      setGrnLines((current) => current.map((item) => (item.productId === line.productId ? { ...item, qtyReceived: qty } : item)))
                    }}
                  />
                  <Button variant="outline" onClick={() => setGrnLines((current) => current.filter((item) => item.productId !== line.productId))}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            {grnError ? <p className="text-sm text-red-600">{grnError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrnOpen(false)}>Cancel</Button>
            <Button onClick={submitGrn} disabled={grnMutation.isPending}>
              {grnMutation.isPending ? 'Saving...' : 'Submit GRN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Search product by name or SKU" value={adjustSearch} onChange={(event) => setAdjustSearch(event.target.value)} />
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={adjustProductId}
              onChange={(event) => setAdjustProductId(event.target.value)}
            >
              <option value="">Select product</option>
              {adjustFilteredOptions.map((row) => (
                <option key={row.productId} value={row.productId}>
                  {row.productName} ({row.sku})
                </option>
              ))}
            </select>
            <Input
              placeholder="Adjustment qty (positive or negative)"
              type="number"
              value={adjustQty}
              onChange={(event) => setAdjustQty(event.target.value)}
            />
            <Input placeholder="Reason" value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} />
            {adjustError ? <p className="text-sm text-red-600">{adjustError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={submitAdjustment} disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? 'Saving...' : 'Submit Adjustment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Warehouse Manager</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Search by name or email"
              value={assignSearch}
              onChange={(event) => setAssignSearch(event.target.value)}
            />
            {warehouseManagerUsersQuery.isLoading ? (
              <p className="text-sm text-slate-500">Loading users...</p>
            ) : filteredManagerOptions.length === 0 ? (
              <p className="text-sm text-slate-500">No Warehouse Manager users found.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200">
                {filteredManagerOptions.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                    disabled={assignManagerMutation.isPending}
                    onClick={() => assignManagerMutation.mutate(user.id)}
                  >
                    <span className="font-medium text-slate-900">{user.name}</span>
                    <span className="text-xs text-slate-500">{user.email}</span>
                  </button>
                ))}
              </div>
            )}
            {assignError ? <p className="text-sm text-red-600">{assignError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
