import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Store } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageEmptyState, PageErrorState, PageLoadingState } from '@/components/crud/PageStates'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useListState } from '@/hooks/useListState'
import { api } from '@/lib/api'
import { usePermission } from '@/context/PermissionContext'
import { formatCurrencyINR } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type OutletRecord = {
  id: string
  outletCode: string
  warehouseId?: string | null
  name: string
  ownerName: string
  phone: string
  address: string
  creditLimit: number | string
  outstandingBalance: number | string
  pointsBalance: number
  isActive: boolean
  createdAt: string
}

type WarehouseOption = {
  id: string
  name: string
  location: string
  isActive: boolean
}

type OutletListResponse = {
  data: OutletRecord[]
  pagination: {
    total: number
    page: number
    limit: number
  }
}

function asNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}


export function OutletsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { page, setPage, limit, setLimit, search, setSearch } = useListState(20)
  const { can } = usePermission()
  const canWriteOutlets = can('outlets:write')

  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active')
  const [createModalOpen, setCreateModalOpen] = useState(false)

  const [createName, setCreateName] = useState('')
  const [createOwnerName, setCreateOwnerName] = useState('')
  const [createPhone, setCreatePhone] = useState('')
  const [createAddress, setCreateAddress] = useState('')
  const [createWarehouseId, setCreateWarehouseId] = useState('')
  const [createMessage, setCreateMessage] = useState<string | null>(null)

  const countsQuery = useQuery({
    queryKey: ['outlets-counts'],
    queryFn: async () => {
      const response = await api.get<{ data?: { active?: number; inactive?: number } } | { active?: number; inactive?: number }>(
        '/outlets/counts',
      )
      const payload = response.data as unknown
      let counts: { active?: number; inactive?: number } | undefined
      if (payload && typeof payload === 'object' && 'data' in payload) {
        counts = (payload as { data?: { active?: number; inactive?: number } }).data
      } else {
        counts = payload as { active?: number; inactive?: number } | undefined
      }
      return {
        active: Number(counts?.active ?? 0),
        inactive: Number(counts?.inactive ?? 0),
      }
    },
  })

  const outletsQuery = useQuery({
    queryKey: ['outlets-admin-list', page, limit, statusFilter],
    queryFn: async () => {
      const response = await api.get<OutletListResponse>('/outlets', {
        params: {
          page,
          limit,
          isActive: statusFilter === 'active',
        },
      })
      return response.data
    },
  })

  const warehousesQuery = useQuery({
    queryKey: ['outlets-create-warehouses'],
    enabled: createModalOpen,
    queryFn: async () => {
      const response = await api.get<{ data: WarehouseOption[] }>('/warehouses')
      return response.data.data.filter((warehouse) => warehouse.isActive)
    },
  })

  const filteredOutlets = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const items = outletsQuery.data?.data ?? []
    if (!keyword) return items
    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(keyword) ||
        item.outletCode.toLowerCase().includes(keyword) ||
        item.phone.toLowerCase().includes(keyword) ||
        item.ownerName.toLowerCase().includes(keyword)
      )
    })
  }, [outletsQuery.data?.data, search])

  const activeCount = countsQuery.data?.active ?? 0
  const inactiveCount = countsQuery.data?.inactive ?? 0
  const totalCount = activeCount + inactiveCount

  const pageOutstanding = useMemo(
    () => (outletsQuery.data?.data ?? []).reduce((sum, o) => sum + asNumber(o.outstandingBalance), 0),
    [outletsQuery.data?.data],
  )

  const createOutletMutation = useMutation({
    mutationFn: async (payload: {
      name: string
      ownerName: string
      phone: string
      address: string
      warehouseId?: string | null
    }) => {
      const response = await api.post<{ data: OutletRecord }>('/outlets', payload)
      return response.data.data
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['outlets-admin-list'] }),
        queryClient.invalidateQueries({ queryKey: ['outlets-counts'] }),
      ])
    },
  })

  const handleCreateOutlet = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateMessage(null)

    try {
      const created = await createOutletMutation.mutateAsync({
        name: createName.trim(),
        ownerName: createOwnerName.trim(),
        phone: createPhone.trim(),
        address: createAddress.trim(),
        warehouseId: createWarehouseId || null,
      })

      setCreateModalOpen(false)
      setCreateName('')
      setCreateOwnerName('')
      setCreatePhone('')
      setCreateAddress('')
      setCreateWarehouseId('')
      setCreateMessage(null)
      navigate(`/dashboard/outlets/${created.id}`)
    } catch (error) {
      setCreateMessage(apiErrorMessage(error, 'Unable to create outlet.'))
    }
  }

  const total = outletsQuery.data?.pagination.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-5">
      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Outlets</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900">{totalCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Active</p>
          <p className="mt-1.5 text-2xl font-bold text-emerald-600">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Inactive</p>
          <p className="mt-1.5 text-2xl font-bold text-amber-600">{inactiveCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Outstanding</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900">{formatCurrencyINR(pageOutstanding)}</p>
          <p className="mt-0.5 text-xs text-slate-400">Current page only</p>
        </div>
      </div>

      {/* Main Table */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as 'active' | 'inactive')
                setPage(1)
              }}
            >
              <TabsList>
                <TabsTrigger value="active">
                  Active
                  <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                    {activeCount}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="inactive">
                  Inactive
                  <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                    {inactiveCount}
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {canWriteOutlets && (
              <Button onClick={() => setCreateModalOpen(true)} size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                New Outlet
              </Button>
            )}
          </div>

          {/* Filters */}
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1">
              <Label className="text-xs text-slate-500">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-8"
                  placeholder="Name, code, owner or phone..."
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Per page</Label>
              <select
                value={String(limit)}
                onChange={(event) => setLimit(Number(event.target.value))}
                className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {outletsQuery.isLoading ? <PageLoadingState label="Loading outlets..." /> : null}
          {outletsQuery.isError ? (
            <PageErrorState
              title="Could not load outlets"
              description="Verify `outlets:read` permission and try again."
              onRetry={() => outletsQuery.refetch()}
            />
          ) : null}

          {!outletsQuery.isLoading && !outletsQuery.isError ? (
            <>
              {filteredOutlets.length === 0 ? (
                <PageEmptyState
                  title={statusFilter === 'active' ? 'No active outlets' : 'No inactive outlets'}
                  description={
                    statusFilter === 'active'
                      ? 'Create a new outlet or adjust your filters.'
                      : 'All outlets are currently active.'
                  }
                  action={
                    statusFilter === 'active' && canWriteOutlets ? (
                      <Button onClick={() => setCreateModalOpen(true)}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        Create Outlet
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700">Outlet</TableHead>
                        <TableHead className="font-semibold text-slate-700">Outstanding</TableHead>
                        <TableHead className="font-semibold text-slate-700">Points</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOutlets.map((outlet) => (
                        <TableRow
                          key={outlet.id}
                          className="cursor-pointer hover:bg-slate-50/60"
                          onClick={() => navigate(`/dashboard/outlets/${outlet.id}`)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                                <Store className="h-3.5 w-3.5 text-slate-500" />
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900">{outlet.name}</p>
                                <p className="text-xs text-slate-400">
                                  {outlet.outletCode} · {outlet.phone}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-medium text-slate-800">
                            {formatCurrencyINR(asNumber(outlet.outstandingBalance))}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">{outlet.pointsBalance}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Showing {filteredOutlets.length} of {total} outlets
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-slate-500">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Create Outlet Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Outlet</DialogTitle>
            <DialogDescription>
              Add a new distribution outlet.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateOutlet} className="mt-2 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="create-name">Outlet Name</Label>
              <Input
                id="create-name"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="e.g. Sunrise Auto Parts"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-owner">Owner / Contact Name</Label>
              <Input
                id="create-owner"
                value={createOwnerName}
                onChange={(event) => setCreateOwnerName(event.target.value)}
                placeholder="e.g. Ramesh Kumar"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-phone">Phone Number</Label>
              <Input
                id="create-phone"
                value={createPhone}
                onChange={(event) => setCreatePhone(event.target.value)}
                placeholder="e.g. 9876543210"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-warehouse">Assigned Warehouse</Label>
              <select
                id="create-warehouse"
                value={createWarehouseId}
                onChange={(event) => setCreateWarehouseId(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="">Not assigned</option>
                {(warehousesQuery.data ?? []).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} · {warehouse.location}
                  </option>
                ))}
              </select>
              {warehousesQuery.isError ? (
                <p className="text-xs text-red-600">{apiErrorMessage(warehousesQuery.error, 'Unable to load warehouses.')}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-address">Full Address</Label>
              <Input
                id="create-address"
                value={createAddress}
                onChange={(event) => setCreateAddress(event.target.value)}
                placeholder="Street, City, PIN"
                required
              />
            </div>

            {createMessage && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {createMessage}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateModalOpen(false)
                  setCreateWarehouseId('')
                  setCreateMessage(null)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createOutletMutation.isPending}>
                {createOutletMutation.isPending ? 'Creating...' : 'Create Outlet'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
