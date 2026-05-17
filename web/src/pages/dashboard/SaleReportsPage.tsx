import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'

type ReportFilter = 'all' | 'verified' | 'unverified'

type SaleReport = {
  id: string
  serialNumber: string
  customerName: string
  customerPhone: string
  saleDate: string
  pointsAwarded: number
  outletId: string
  assetId: string | null
  outlet?: {
    id: string
    name: string
  }
  asset?: {
    id: string
    productId?: string
  } | null
}

type Product = {
  id: string
  name: string
}

type PaginatedResponse<T> = {
  data: T[]
}

function statusBadgeClass(status: 'verified' | 'unverified') {
  if (status === 'verified') return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  return 'border-amber-300 bg-amber-100 text-amber-800'
}

export function SaleReportsPage() {
  const navigate = useNavigate()

  const [filter, setFilter] = useState<ReportFilter>('all')
  const [search, setSearch] = useState('')

  const reportsQuery = useQuery({
    queryKey: ['sales-sale-reports'],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<SaleReport>>('/sale-reports', {
        params: { page: 1, limit: 100 },
      })
      return response.data.data
    },
  })

  const productsQuery = useQuery({
    queryKey: ['sales-products-map'],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Product>>('/products', {
        params: { page: 1, limit: 500 },
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

  const filteredData = useMemo(() => {
    const query = search.trim().toLowerCase()

    return (reportsQuery.data ?? []).filter((report) => {
      const status: 'verified' | 'unverified' = report.assetId ? 'verified' : 'unverified'
      if (filter !== 'all' && status !== filter) {
        return false
      }

      if (!query) {
        return true
      }

      return (
        report.serialNumber.toLowerCase().includes(query) ||
        report.customerName.toLowerCase().includes(query)
      )
    })
  }, [filter, reportsQuery.data, search])
  const loadError = reportsQuery.isError
    ? apiErrorMessage(reportsQuery.error, 'Unable to load sale reports.')
    : null

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Sale Reports</CardTitle>
          <div className="flex gap-2">
            <Button variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>
              All
            </Button>
            <Button variant={filter === 'verified' ? 'default' : 'outline'} onClick={() => setFilter('verified')}>
              Verified
            </Button>
            <Button variant={filter === 'unverified' ? 'default' : 'outline'} onClick={() => setFilter('unverified')}>
              Unverified
            </Button>
          </div>
        </div>

        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by serial number or customer name"
        />
      </CardHeader>

      <CardContent>
        {reportsQuery.isLoading ? <p className="text-sm text-slate-500">Loading sale reports...</p> : null}
        {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}

        {!reportsQuery.isLoading && !reportsQuery.isError ? (
          filteredData.length === 0 ? (
            <p className="text-sm text-slate-500">No sale reports found.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serial</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Sale Date</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((report) => {
                    const status: 'verified' | 'unverified' = report.assetId ? 'verified' : 'unverified'
                    const productName = report.asset?.productId
                      ? productNameById.get(report.asset.productId)
                      : undefined

                    return (
                      <TableRow
                        key={report.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/dashboard/sales/reports/${report.id}`)}
                      >
                        <TableCell>{report.serialNumber}</TableCell>
                        <TableCell>{productName ?? '-'}</TableCell>
                        <TableCell>
                          <p className="font-medium text-slate-900">{report.customerName}</p>
                          <p className="text-xs text-slate-500">{report.customerPhone}</p>
                        </TableCell>
                        <TableCell>{report.outlet?.name ?? report.outletId}</TableCell>
                        <TableCell>{new Date(report.saleDate).toLocaleDateString()}</TableCell>
                        <TableCell>{report.pointsAwarded}</TableCell>
                        <TableCell>
                          <Badge className={statusBadgeClass(status)}>
                            {status === 'verified' ? 'Verified' : 'Unverified'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}
