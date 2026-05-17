import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'


type DispatchLine = {
  id: string
  productId: string
  qtyDispatched: number
  serialNumber?: string | null
  serialNumbers?: string[] | null
}

type DispatchRecord = {
  id: string
  orderId: string
  lrNumber?: string | null
  transporterName?: string | null
  vehicleNumber?: string | null
  dispatchDate: string
  createdAt: string
  warehouse?: {
    id: string
    name: string
    location?: string | null
  } | null
  order?: {
    id: string
    outlet?: {
      id: string
      name: string
      outletCode?: string | null
    }
  }
  lines: DispatchLine[]
}

type ProductOption = {
  id: string
  name: string
}

type PaginatedResponse<T> = {
  data: T[]
}

function normalizeDispatch(payload: unknown): DispatchRecord | null {
  if (!payload || typeof payload !== 'object') return null
  const row = payload as Partial<DispatchRecord>
  return {
    ...row,
    id: String(row.id ?? ''),
    orderId: String(row.orderId ?? ''),
    dispatchDate: String(row.dispatchDate ?? ''),
    createdAt: String(row.createdAt ?? ''),
    lines: Array.isArray(row.lines) ? row.lines : [],
  } as DispatchRecord
}

export function DispatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const dispatchId = id ?? ''

  const dispatchQuery = useQuery({
    queryKey: ['sales-dispatch-detail', dispatchId],
    enabled: Boolean(dispatchId),
    queryFn: async () => {
      const response = await api.get<{ data: DispatchRecord }>(`/dispatches/${dispatchId}`)
      return normalizeDispatch(response.data.data)
    },
  })

  const productsQuery = useQuery({
    queryKey: ['sales-products-map'],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<ProductOption>>('/products', {
        params: { page: 1, limit: 200 },
      })
      return response.data.data
    },
  })

  const productNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of productsQuery.data ?? []) {
      map.set(item.id, item.name)
    }
    return map
  }, [productsQuery.data])

  const dispatch = dispatchQuery.data

  return (
    <div className="space-y-4">
      {dispatchQuery.isLoading ? <p className="text-sm text-slate-500">Loading dispatch...</p> : null}
      {dispatchQuery.isError ? <p className="text-sm text-red-600">{apiErrorMessage(dispatchQuery.error, 'Unable to load dispatch.')}</p> : null}

      {dispatch ? (
        <>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Dispatch {dispatch.id.slice(0, 12)}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <p>
                <span className="font-medium text-slate-900">Outlet:</span>{' '}
                {dispatch.order?.outlet?.name ?? '-'} {dispatch.order?.outlet?.outletCode ? `(${dispatch.order.outlet.outletCode})` : ''}
              </p>
              <p>
                <span className="font-medium text-slate-900">Warehouse:</span>{' '}
                {dispatch.warehouse?.name ?? '-'} {dispatch.warehouse?.location ? `(${dispatch.warehouse.location})` : ''}
              </p>
              <p>
                <span className="font-medium text-slate-900">LR Number:</span> {dispatch.lrNumber ?? '-'}
              </p>
              <p>
                <span className="font-medium text-slate-900">Transporter:</span> {dispatch.transporterName ?? '-'}
              </p>
              <p>
                <span className="font-medium text-slate-900">Vehicle Number:</span> {dispatch.vehicleNumber ?? '-'}
              </p>
              <p>
                <span className="font-medium text-slate-900">Dispatch Date:</span>{' '}
                {new Date(dispatch.dispatchDate).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Items Dispatched</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Serial Numbers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispatch.lines.map((line) => {
                      const serialList = line.serialNumbers && line.serialNumbers.length > 0
                        ? line.serialNumbers.join(', ')
                        : line.serialNumber ?? '-'

                      return (
                        <TableRow key={line.id}>
                          <TableCell>{productNameById.get(line.productId) ?? line.productId}</TableCell>
                          <TableCell>{line.qtyDispatched}</TableCell>
                          <TableCell>{serialList}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-3">
                <Link to={`/dashboard/sales/orders/${dispatch.orderId}`} className="text-sm text-cyan-700 hover:underline">
                  View source order
                </Link>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
