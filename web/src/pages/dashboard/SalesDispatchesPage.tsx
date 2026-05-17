import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type Dispatch = {
  id: string
  lrNumber: string | null
  transporterName: string | null
  vehicleNumber: string | null
  createdAt: string
  orderId: string
  warehouse?: {
    id: string
    name: string
  } | null
  order?: {
    outlet?: {
      name: string
      outletCode?: string | null
    }
  }
}

type Response = { data: Dispatch[] }

function normalizeDispatchRows(payload: unknown): Dispatch[] {
  if (Array.isArray(payload)) return payload as Dispatch[]
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: Dispatch[] }).data
  }
  return []
}

export function SalesDispatchesPage() {
  const navigate = useNavigate()

  const query = useQuery({
    queryKey: ['sales', 'dispatches'],
    queryFn: async () => {
      const response = await api.get<Response>('/dispatches', { params: { page: 1, limit: 50 } })
      return normalizeDispatchRows(response.data.data)
    },
  })
  const loadError = query.isError ? apiErrorMessage(query.error, 'Unable to load dispatches.') : null

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle>Sales Dispatches</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {query.isLoading ? <p className="text-sm text-slate-500">Loading dispatches...</p> : null}
        {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
        {!query.isLoading && !query.isError ? (
          (query.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No dispatches found.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                    <TableRow>
                      <TableHead>Dispatch</TableHead>
                      <TableHead>Outlet</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>LR Number</TableHead>
                      <TableHead>Transporter</TableHead>
                      <TableHead>Vehicle Number</TableHead>
                      <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(query.data ?? []).map((dispatch) => (
                    <TableRow
                      key={dispatch.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/dashboard/sales/dispatches/${dispatch.id}`)}
                    >
                      <TableCell className="font-medium text-slate-900">Dispatch {dispatch.id.slice(0, 8)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{dispatch.order?.outlet?.name ?? '-'}</span>
                          <span className="text-xs text-slate-500">{dispatch.order?.outlet?.outletCode ?? '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>{dispatch.warehouse?.name ?? '-'}</TableCell>
                      <TableCell>{dispatch.orderId.slice(0, 8)}</TableCell>
                      <TableCell>{dispatch.lrNumber ?? '-'}</TableCell>
                      <TableCell>{dispatch.transporterName ?? '-'}</TableCell>
                      <TableCell>{dispatch.vehicleNumber ?? '-'}</TableCell>
                      <TableCell>{timeAgo(dispatch.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}
