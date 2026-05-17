import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
  soldToOutlet: {
    id: string
    name: string
    outletCode: string | null
  } | null
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
  replacementConflict: {
    hasConflict: boolean
    usedInComplaintIds: string[]
  }
  events: Array<{
    id: string
    eventType: string
    entityType: string
    entityId: string
    eventAt: string
    createdAt: string
  }>
}

export function ServiceSerialsPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SerialResolveResult | null>(null)
  const [queriedSerial, setQueriedSerial] = useState('')

  async function handleLookup() {
    const serial = searchInput.trim()
    if (!serial) return
    setLoading(true)
    setError(null)
    setResult(null)
    setQueriedSerial(serial)
    try {
      const response = await api.get<{ data: { data: SerialResolveResult } }>('/service/serials', {
        params: { q: serial },
      })
      const payload = response.data as any
      setResult(payload?.data?.data ?? payload?.data ?? null)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to resolve serial'))
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') handleLookup()
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Serial Number Lookup</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter serial number (e.g. SN-1234-ABC)"
              className="max-w-md"
            />
            <Button type="button" onClick={handleLookup} disabled={loading || !searchInput.trim()}>
              {loading ? 'Looking up...' : 'Lookup'}
            </Button>
          </div>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <>
          {/* Product + Outlet */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Product</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Serial</p>
                  <code className="font-mono font-semibold text-slate-900">{result.serial}</code>
                  <p className="text-xs text-slate-400">Normalized: {result.normalizedSerial}</p>
                </div>
                {result.product ? (
                  <>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Product</p>
                      <p className="font-medium text-slate-900">{result.product.name}</p>
                      <p className="text-xs text-slate-500">SKU: {result.product.sku}</p>
                    </div>
                    {result.product.brandName || result.product.categoryName ? (
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Category / Brand</p>
                        <p className="text-slate-700">
                          {result.product.categoryName ?? '—'} / {result.product.brandName ?? '—'}
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-slate-400">Product not found in catalog</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Sold To Outlet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {result.soldToOutlet ? (
                  <div className="space-y-1">
                    <p className="font-medium text-slate-900">{result.soldToOutlet.name}</p>
                    {result.soldToOutlet.outletCode ? (
                      <p className="text-xs text-slate-500">Code: {result.soldToOutlet.outletCode}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-slate-400">No outlet record found</p>
                )}
                {result.replacementConflict.hasConflict ? (
                  <div className="mt-3">
                    <Badge className="bg-rose-100 text-rose-700">Replacement Conflict</Badge>
                    <p className="mt-1 text-xs text-rose-600">
                      This serial is already used as a replacement in{' '}
                      {result.replacementConflict.usedInComplaintIds.length} complaint(s).
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {/* Sales Chain */}
          {result.salesChain.length > 0 ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Sales Chain</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Dispatch Date</TableHead>
                        <TableHead>Delivery Status</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Outlet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.salesChain.map((chain) => (
                        <TableRow key={chain.dispatchId}>
                          <TableCell className="font-mono text-sm">{chain.orderNumber}</TableCell>
                          <TableCell className="text-sm">
                            {new Date(chain.dispatchDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                chain.deliveryStatus === 'delivered'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : chain.deliveryStatus === 'in_transit'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-slate-100 text-slate-700'
                              }
                            >
                              {chain.deliveryStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{chain.invoiceNumber ?? '—'}</TableCell>
                          <TableCell className="text-sm">{chain.outletName ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Complaint Links */}
          {result.complaintLinks.length > 0 ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Complaint Links</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Complaint</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.complaintLinks.map((link) => (
                      <TableRow key={link.lineId}>
                        <TableCell className="font-mono text-sm">{link.complaintNumber}</TableCell>
                        <TableCell>
                          <Badge className="bg-slate-100 text-slate-700">{link.complaintStatus}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              link.role === 'replacement_serial'
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-slate-100 text-slate-700'
                            }
                          >
                            {link.role === 'replacement_serial' ? 'Replacement' : 'Original'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              navigate(`/dashboard/service/complaints/${link.complaintId}`)
                            }
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {/* Event Timeline */}
          {result.events.length > 0 ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Serial Event Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.events.map((event) => (
                    <div key={event.id} className="flex gap-3 rounded-lg border border-slate-100 p-3 text-sm">
                      <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-teal-400" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-900">
                            {event.eventType.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(event.eventAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {event.entityType}: {event.entityId}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {result.salesChain.length === 0 &&
          result.complaintLinks.length === 0 &&
          result.events.length === 0 ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500">
                  Serial <code className="font-mono">{queriedSerial}</code> has no sales history or complaint
                  links in the system.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
