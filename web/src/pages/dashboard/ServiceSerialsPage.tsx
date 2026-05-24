import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ServiceStatusBadge } from '@/components/service/ServiceStatusBadge'
import type { ComplaintStatus } from '@/components/service/ServiceStatusBadge'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'

type SerialResolveResult = {
  serial: string
  normalizedSerial: string
  product: {
    id: string
    name: string
    sku: string
    categoryName: string | null
    brandName: string | null
  } | null
  soldToOutlet: { id: string; name: string; outletCode: string | null } | null
  salesChain: Array<{
    orderId: string
    orderNumber: string
    dispatchId: string
    dispatchDate: string
    deliveryStatus: string
    invoiceId: string | null
    invoiceNumber: string | null
    outletId: string | null
    outletName: string | null
  }>
  complaintLinks: Array<{
    complaintId: string
    complaintNumber: string
    complaintStatus: string
    role: 'old_serial' | 'replacement_serial'
    lineId: string
  }>
  replacementConflict: { hasConflict: boolean; usedInComplaintIds: string[] }
  events: Array<{
    id: string
    eventType: string
    entityType: string
    entityId: string
    eventAt: string
    createdAt: string
  }>
}

function DeliveryBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    delivered:  'bg-emerald-100 text-emerald-700',
    in_transit: 'bg-blue-100 text-blue-700',
    pending:    'bg-amber-100 text-amber-700',
  }
  return (
    <Badge className={`border-0 text-xs ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

export function ServiceSerialsPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [submittedSerial, setSubmittedSerial] = useState('')

  // FP-049: use useQuery instead of manual state + async function
  const resultQuery = useQuery<SerialResolveResult | null>({
    queryKey: ['serviceSerials', 'resolve', submittedSerial],
    queryFn: async () => {
      if (!submittedSerial) return null
      const response = await api.get('/service/serials', { params: { q: submittedSerial } })
      const p = response.data as any
      return p?.data?.data ?? p?.data ?? null
    },
    enabled: Boolean(submittedSerial),
    staleTime: 60_000,
  })

  const loading = resultQuery.isFetching
  const error = resultQuery.isError ? apiErrorMessage(resultQuery.error, 'Failed to resolve serial') : null
  const result = resultQuery.data ?? null
  const queriedSerial = submittedSerial

  function handleLookup() {
    const serial = searchInput.trim()
    if (!serial) return
    setSubmittedSerial(serial)
  }

  return (
    <div className="space-y-4">
      {/* Search card */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Serial Intelligence</CardTitle>
          <p className="text-sm text-slate-500 mt-0.5">
            Look up any serial number to trace its product, sales history, and complaint links.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 max-w-lg">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLookup() }}
              placeholder="Enter serial number, e.g. SN-1234-ABC"
              className="font-mono"
            />
            <Button
              type="button"
              onClick={handleLookup}
              disabled={loading || !searchInput.trim()}
              className="bg-teal-600 hover:bg-teal-700 text-white shrink-0"
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Looking up…
                </span>
              ) : 'Lookup'}
            </Button>
          </div>
          {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        </CardContent>
      </Card>

      {/* Results */}
      {result ? (
        <div className="space-y-4">
          {/* Conflict banner */}
          {result.replacementConflict.hasConflict ? (
            <div className="flex items-center gap-3 rounded-xl border border-rose-300 bg-rose-50 px-5 py-3 text-rose-700">
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold">Replacement Conflict Detected</p>
                <p className="text-xs mt-0.5">
                  This serial is used as a replacement in {result.replacementConflict.usedInComplaintIds.length} complaint(s).
                </p>
              </div>
            </div>
          ) : null}

          {/* Product + Outlet row */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Product</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Serial</p>
                  <code className="text-base font-mono font-bold text-slate-900">{result.serial}</code>
                  <p className="text-xs text-slate-400 mt-0.5">Normalized: <code className="font-mono">{result.normalizedSerial}</code></p>
                </div>
                {result.product ? (
                  <>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Product Name</p>
                      <p className="text-sm font-semibold text-slate-900">{result.product.name}</p>
                      <code className="text-xs font-mono text-slate-500">{result.product.sku}</code>
                    </div>
                    {result.product.categoryName || result.product.brandName ? (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Brand / Category</p>
                        <p className="text-sm text-slate-700">
                          {result.product.brandName ?? '—'} / {result.product.categoryName ?? '—'}
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
                    Product not found in catalog
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Outlet</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-3">
                {result.soldToOutlet ? (
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{result.soldToOutlet.name}</p>
                    {result.soldToOutlet.outletCode ? (
                      <p className="text-xs text-slate-500 mt-0.5">Code: <code className="font-mono">{result.soldToOutlet.outletCode}</code></p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">No outlet record found</p>
                )}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Complaint Links</p>
                  {result.complaintLinks.length === 0 ? (
                    <p className="text-sm text-slate-400 mt-1">No complaint links</p>
                  ) : (
                    <p className="text-sm font-semibold text-slate-900 mt-1">{result.complaintLinks.length} complaint{result.complaintLinks.length !== 1 ? 's' : ''}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sales chain */}
          {result.salesChain.length > 0 ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sales Chain</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-xs">Order</TableHead>
                        <TableHead className="text-xs">Dispatch Date</TableHead>
                        <TableHead className="text-xs">Delivery</TableHead>
                        <TableHead className="text-xs">Invoice</TableHead>
                        <TableHead className="text-xs">Outlet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.salesChain.map((chain) => (
                        <TableRow key={chain.dispatchId}>
                          <TableCell className="font-mono text-sm font-semibold text-slate-800">{chain.orderNumber}</TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {new Date(chain.dispatchDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell><DeliveryBadge status={chain.deliveryStatus} /></TableCell>
                          <TableCell className="text-sm font-mono text-slate-600">{chain.invoiceNumber ?? '—'}</TableCell>
                          <TableCell className="text-sm text-slate-600">{chain.outletName ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Complaint links */}
          {result.complaintLinks.length > 0 ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Complaint Links</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="space-y-2">
                  {result.complaintLinks.map((link) => (
                    <div key={link.lineId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <code className="font-mono text-sm font-semibold text-slate-800">{link.complaintNumber}</code>
                        <ServiceStatusBadge status={link.complaintStatus as ComplaintStatus} size="sm" />
                        <Badge className={`border-0 text-xs ${link.role === 'replacement_serial' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                          {link.role === 'replacement_serial' ? 'Replacement' : 'Original'}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/dashboard/service/complaints/${link.complaintId}`)}
                        className="shrink-0 text-xs"
                      >
                        View →
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Event timeline */}
          {result.events.length > 0 ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Serial Event Timeline</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="space-y-0">
                  {result.events.map((event, idx) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-2.5 w-2.5 rounded-full bg-teal-500 ring-2 ring-white shrink-0 mt-1" />
                        {idx < result.events.length - 1 ? <div className="w-px flex-1 bg-slate-200 min-h-[1.5rem]" /> : null}
                      </div>
                      <div className="pb-3 flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-800">
                            {event.eventType.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">
                            {new Date(event.eventAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{event.entityType}: {event.entityId}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Empty state */}
          {result.salesChain.length === 0 && result.complaintLinks.length === 0 && result.events.length === 0 ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="px-5 py-10 text-center text-slate-400">
                <p className="text-sm">
                  Serial <code className="font-mono text-slate-600">{queriedSerial}</code> has no sales history, complaint links, or events in the system.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
