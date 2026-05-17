import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { api } from '@/lib/api'
import { formatCurrencyINR } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type SaleReport = {
  id: string
  serialNumber: string
  customerName: string
  customerPhone: string
  saleDate: string
  price: number | string
  pointsAwarded: number
  createdAt: string
  outletId: string
  assetId: string | null
  outlet?: {
    id: string
    name: string
  }
  asset?: {
    id: string
    serialNumber: string
    productId?: string
    createdAt?: string
  } | null
}

type Product = {
  id: string
  name: string
}

type PaginatedResponse<T> = {
  data: T[]
}

type ToastState = {
  text: string
  type: 'success' | 'error'
} | null

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function statusBadgeClass(status: 'verified' | 'unverified') {
  if (status === 'verified') return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  return 'border-amber-300 bg-amber-100 text-amber-800'
}

export function SaleReportDetailPage() {
  const queryClient = useQueryClient()
  const { id } = useParams<{ id: string }>()
  const reportId = id ?? ''

  const [toast, setToast] = useState<ToastState>(null)
  const [verifyConfirmOpen, setVerifyConfirmOpen] = useState(false)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const reportQuery = useQuery({
    queryKey: ['sales-sale-report-detail', reportId],
    enabled: Boolean(reportId),
    queryFn: async () => {
      const response = await api.get<{ data: SaleReport }>(`/sale-reports/${reportId}`)
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

  const verifyMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/sale-reports/${reportId}/verify`)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales-sale-reports'] }),
        queryClient.invalidateQueries({ queryKey: ['sales-sale-report-detail', reportId] }),
      ])
      setToast({ text: 'Sale report verified', type: 'success' })
    },
    onError: (error) => {
      setToast({ text: apiErrorMessage(error, 'Could not verify report'), type: 'error' })
    },
  })

  const report = reportQuery.data
  const status: 'verified' | 'unverified' = report?.assetId ? 'verified' : 'unverified'
  const productName = report?.asset?.productId ? productNameById.get(report.asset.productId) : undefined
  const verifiedDate = report?.assetId ? (report?.asset?.createdAt ?? report?.createdAt) : null

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

      {reportQuery.isLoading ? <p className="text-sm text-slate-500">Loading sale report...</p> : null}
      {reportQuery.isError ? <p className="text-sm text-red-600">Unable to load sale report.</p> : null}

      {report ? (
        <>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Sale Report {report.id.slice(0, 12)}</CardTitle>
                <Badge className={statusBadgeClass(status)}>
                  {status === 'verified' ? 'Verified' : 'Unverified'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <p>
                <span className="font-medium text-slate-900">Serial Number:</span> {report.serialNumber}
              </p>
              <p>
                <span className="font-medium text-slate-900">Product:</span> {productName ?? '-'}
              </p>
              <p>
                <span className="font-medium text-slate-900">Outlet:</span> {report.outlet?.name ?? report.outletId}
              </p>
              <p>
                <span className="font-medium text-slate-900">Sale Date:</span>{' '}
                {new Date(report.saleDate).toLocaleDateString()}
              </p>
              <p>
                <span className="font-medium text-slate-900">Sale Price:</span> {formatCurrencyINR(toNumber(report.price))}
              </p>
              <p>
                <span className="font-medium text-slate-900">Points Awarded:</span> {report.pointsAwarded}
              </p>
              {verifiedDate ? (
                <p className="sm:col-span-2">
                  <span className="font-medium text-slate-900">Verified Date:</span>{' '}
                  {new Date(verifiedDate).toLocaleString()}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-700">
              <p>
                <span className="font-medium text-slate-900">Name:</span> {report.customerName}
              </p>
              <p className="mt-1">
                <span className="font-medium text-slate-900">Phone:</span> {report.customerPhone}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              {status === 'unverified' ? (
                <>
                  <Button onClick={() => setVerifyConfirmOpen(true)} disabled={verifyMutation.isPending}>
                    Verify
                  </Button>
                  <ConfirmDialog
                    open={verifyConfirmOpen}
                    onOpenChange={setVerifyConfirmOpen}
                    title="Verify Sale Report"
                    description="Verifying this sale report will mark it as verified. This action cannot be undone."
                    confirmLabel="Verify"
                    onConfirm={() => { setVerifyConfirmOpen(false); verifyMutation.mutate() }}
                    loading={verifyMutation.isPending}
                  />
                </>
              ) : null}

              {report.assetId ? (
                <span className="text-sm text-slate-500">
                  Linked asset: {report.assetId}
                </span>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
