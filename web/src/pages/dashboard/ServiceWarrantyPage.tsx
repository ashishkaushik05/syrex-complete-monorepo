import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type ComplaintRow = {
  id: string
  complaintNumber: string
  status: string
  title: string | null
  outletName: string | null
  serials: string[]
  createdAt: string
  updatedAt: string
}

type TicketListPayload = {
  data: ComplaintRow[]
}

export function ServiceWarrantyPage() {
  const navigate = useNavigate()

  const query = useQuery<ComplaintRow[]>({
    queryKey: ['service', 'warranty-queue'],
    queryFn: async () => {
      const response = await api.get<{ data: TicketListPayload }>('/tickets', {
        params: { status: 'test_result_submitted', limit: 100 },
      })
      const payload = response.data as any
      const list = Array.isArray(payload?.data?.data) ? payload.data.data : []
      return list
    },
  })

  const rows = query.data ?? []

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle>Warranty Decision Queue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-500">
          Complaints with a submitted test result awaiting warranty approve / reject.
        </p>

        {query.isLoading ? <p className="text-sm text-slate-500">Loading queue...</p> : null}
        {query.isError ? (
          <p className="text-sm text-red-600">{apiErrorMessage(query.error, 'Unable to load warranty queue.')}</p>
        ) : null}

        {!query.isLoading && !query.isError ? (
          rows.length === 0 ? (
            <p className="text-sm text-slate-500">No complaints awaiting warranty decision.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Complaint</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Serials</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900 font-mono text-sm">
                            {row.complaintNumber}
                          </span>
                          <span className="text-xs text-slate-500">{row.title ?? 'Untitled'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{row.outletName ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(row.serials ?? []).slice(0, 2).map((serial) => (
                            <Badge
                              key={serial}
                              variant="secondary"
                              className="bg-slate-100 text-slate-700 font-mono text-xs"
                            >
                              {serial}
                            </Badge>
                          ))}
                          {(row.serials ?? []).length > 2 ? (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-700 text-xs">
                              +{(row.serials ?? []).length - 2}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">{timeAgo(row.createdAt)}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => navigate(`/dashboard/service/complaints/${row.id}`)}
                        >
                          Review
                        </Button>
                      </TableCell>
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
