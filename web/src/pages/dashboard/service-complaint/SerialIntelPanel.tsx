import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SectionCard } from './shared'
import type { ComplaintDetail } from './types'

interface Props { detail: ComplaintDetail }

export function SerialIntelPanel({ detail }: Props) {
  const [expandedSerials, setExpandedSerials] = useState<Set<string>>(new Set())

  const toggle = (lineId: string) =>
    setExpandedSerials((prev) => {
      const next = new Set(prev)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })

  return (
    <SectionCard title="Serial Intelligence">
      <div className="space-y-3">
        {detail.lines.map((line) => {
          const insight = detail.serialInsights?.find((s) => s.lineId === line.id && s.role === 'old')
          const replacementInsight = detail.serialInsights?.find((s) => s.lineId === line.id && s.role === 'replacement')
          const expanded = expandedSerials.has(line.id)

          return (
            <div key={line.id} className="rounded-lg border border-slate-200 overflow-hidden">
              <button
                type="button"
                className="w-full flex items-start justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                onClick={() => toggle(line.id)}
              >
                <div className="min-w-0">
                  <code className="text-sm font-mono font-semibold text-slate-900">
                    {line.serialNumber ?? 'Serial pending'}
                  </code>
                  <p className="text-xs text-slate-500 truncate">SKU: {line.sku || 'Not captured'}</p>
                  {line.serialNumber && insight?.resolved?.product ? (
                    <p className="text-xs text-slate-500 truncate">{insight.resolved.product.name}</p>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      {line.serialNumber ? 'No product match' : 'Add serial to resolve product history'}
                    </p>
                  )}
                </div>
                <svg
                  className={`h-4 w-4 text-slate-400 shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expanded ? (
                <div className="border-t border-slate-100 px-3 py-3 space-y-3 bg-slate-50">
                  {insight?.resolved?.product ? (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-slate-400 font-medium">SKU</p>
                        <code className="font-mono text-slate-700">{insight.resolved.product.sku}</code>
                      </div>
                      {insight.resolved.soldToOutlet ? (
                        <div>
                          <p className="text-slate-400 font-medium">Sold To</p>
                          <p className="text-slate-700">{insight.resolved.soldToOutlet.name}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {insight?.resolved?.salesChain?.length ? (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Sales Chain</p>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Order</TableHead>
                              <TableHead className="text-xs">Dispatched</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {insight.resolved.salesChain.map((chain) => (
                              <TableRow key={chain.dispatchId}>
                                <TableCell className="text-xs font-mono">{chain.orderNumber}</TableCell>
                                <TableCell className="text-xs">{new Date(chain.dispatchDate).toLocaleDateString()}</TableCell>
                                <TableCell>
                                  <Badge className={`border-0 text-xs ${
                                    chain.deliveryStatus === 'delivered'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : chain.deliveryStatus === 'in_transit'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {chain.deliveryStatus}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : null}

                  {line.replacementSerialNumber ? (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Replacement Serial</p>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono text-slate-700">{line.replacementSerialNumber}</code>
                        {replacementInsight?.resolved?.replacementConflict?.hasConflict ? (
                          <Badge className="bg-rose-100 text-rose-700 border-0 text-xs">Conflict</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">OK</Badge>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
