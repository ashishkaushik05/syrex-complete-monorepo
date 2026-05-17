import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePermission } from '@/context/PermissionContext'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'

type WarehouseRow = {
  id: string
  name: string
  location: string
  address?: string | null
  managerId?: string | null
  manager?: { id: string; name: string; email: string } | null
  isActive: boolean
  createdAt: string
  skuCount: number
  totalUnits: number
  reservedUnits: number
  availableUnits: number
}

type WarehouseListResponse = {
  data: WarehouseRow[]
}

type CreateWarehousePayload = {
  name: string
  location: string
  address?: string
}

function numberValue(value: number | string | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function WarehousesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { can } = usePermission()
  const { managedWarehouseId } = useAuth()
  const isManager = Boolean(managedWarehouseId)
  const canWriteWarehouses = can('warehouses:write')

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [address, setAddress] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'list'],
    queryFn: async () => {
      const response = await api.get<WarehouseListResponse>('/warehouses')
      return response.data.data
    },
  })

  const createWarehouseMutation = useMutation({
    mutationFn: async (payload: CreateWarehousePayload) => {
      await api.post('/warehouses', payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      setCreateOpen(false)
      setName('')
      setLocation('')
      setAddress('')
      setFormError(null)
    },
    onError: (error) => {
      setFormError(apiErrorMessage(error, 'Unable to create warehouse.'))
    },
  })

  const warehouses = warehousesQuery.data ?? []

  const summary = useMemo(() => {
    return warehouses.reduce(
      (acc, row) => {
        acc.totalSkus += numberValue(row.skuCount)
        acc.totalAvailable += numberValue(row.availableUnits)
        return acc
      },
      { totalSkus: 0, totalAvailable: 0 },
    )
  }, [warehouses])

  const submitCreate = () => {
    const payload: CreateWarehousePayload = {
      name: name.trim(),
      location: location.trim(),
      address: address.trim() || undefined,
    }

    if (!payload.name || !payload.location) {
      setFormError('Name and location are required.')
      return
    }

    setFormError(null)
    createWarehouseMutation.mutate(payload)
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Warehouses</CardTitle>
            {isManager ? (
              <p className="mt-1 text-sm text-amber-700">Showing your assigned warehouse</p>
            ) : null}
          </div>
          {canWriteWarehouses ? (
            <Button onClick={() => setCreateOpen(true)}>New Warehouse</Button>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <StatCard label="Total Warehouses" value={warehouses.length} />
          <StatCard label="Total SKUs Tracked" value={summary.totalSkus} />
          <StatCard label="Total Available Units" value={summary.totalAvailable} />
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="p-0">
          {warehousesQuery.isLoading ? <p className="p-4 text-sm text-slate-500">Loading warehouses...</p> : null}
          {warehousesQuery.isError ? (
            <p className="p-4 text-sm text-red-600">
              {apiErrorMessage(warehousesQuery.error, 'Unable to load warehouses.')}
            </p>
          ) : null}
          {!warehousesQuery.isLoading && !warehousesQuery.isError && warehouses.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No warehouses found.</p>
          ) : null}

          {warehouses.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>SKU Count</TableHead>
                    <TableHead>Total Units</TableHead>
                    <TableHead>Reserved Units</TableHead>
                    <TableHead>Available Units</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouses.map((warehouse) => (
                    <TableRow
                      key={warehouse.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => navigate(`/dashboard/dispatch/warehouses/${warehouse.id}`)}
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{warehouse.name}</span>
                          <span className="text-xs text-slate-500">{warehouse.address ?? '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>{warehouse.location}</TableCell>
                      <TableCell>
                        {warehouse.manager ? (
                          <div className="flex flex-col">
                            <span className="text-sm text-slate-900">{warehouse.manager.name}</span>
                            <span className="text-xs text-slate-500">{warehouse.manager.email}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>{numberValue(warehouse.skuCount)}</TableCell>
                      <TableCell>{numberValue(warehouse.totalUnits)}</TableCell>
                      <TableCell>{numberValue(warehouse.reservedUnits)}</TableCell>
                      <TableCell>{numberValue(warehouse.availableUnits)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Warehouse</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Warehouse name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              placeholder="Location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
            <Input
              placeholder="Address (optional)"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={createWarehouseMutation.isPending}>
              {createWarehouseMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}
