import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { usePermission } from '@/context/PermissionContext'

type PermissionRow = {
  key: string
  group: string
  module: string
  action: string
  label: string
  description: string
  risk: 'low' | 'medium' | 'high'
}

function riskBadgeVariant(risk: PermissionRow['risk']) {
  if (risk === 'high') return 'destructive' as const
  return 'secondary' as const
}

export function PermissionsCatalogPage() {
  const { can } = usePermission()
  const canReadRoles = can('roles:read')
  const [query, setQuery] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')

  const catalogQuery = useQuery({
    queryKey: ['permissions-catalog-page', 'catalog'],
    enabled: canReadRoles,
    queryFn: async () => {
      const response = await api.get<{ data?: PermissionRow[] } | PermissionRow[]>('/permissions')
      const rows = Array.isArray(response.data) ? response.data : response.data?.data ?? []
      return rows
    },
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = catalogQuery.data ?? []
    return rows.filter((row) => {
      const moduleMatch = moduleFilter === 'all' || row.module === moduleFilter
      if (!moduleMatch) return false
      if (!q) return true
      return (
        row.key.toLowerCase().includes(q) ||
        row.group.toLowerCase().includes(q) ||
        row.module.toLowerCase().includes(q) ||
        row.action.toLowerCase().includes(q) ||
        row.label.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q)
      )
    })
  }, [catalogQuery.data, moduleFilter, query])

  const moduleOptions = useMemo(() => {
    return Array.from(new Set((catalogQuery.data ?? []).map((row) => row.module))).sort((a, b) =>
      a.localeCompare(b),
    )
  }, [catalogQuery.data])

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, PermissionRow[]>>()
    for (const row of filtered) {
      const groupRows = map.get(row.group) ?? new Map<string, PermissionRow[]>()
      const moduleRows = groupRows.get(row.module) ?? []
      moduleRows.push(row)
      groupRows.set(row.module, moduleRows)
      map.set(row.group, groupRows)
    }
    for (const [, modules] of map) {
      for (const [module, rows] of modules) {
        rows.sort((a, b) => a.key.localeCompare(b.key))
        modules.set(module, rows)
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([group, modules]) => [group, Array.from(modules.entries()).sort((a, b) => a[0].localeCompare(b[0]))] as const)
  }, [filtered])

  if (!canReadRoles) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Permissions Catalog</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">You need `roles:read` permission to view permission catalog.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Permissions Catalog</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Search by key/module/action/description"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={moduleFilter}
              onChange={(event) => setModuleFilter(event.target.value)}
            >
              <option value="all">All modules</option>
              {moduleOptions.map((module) => (
                <option key={module} value={module}>
                  {module}
                </option>
              ))}
            </select>
          </div>

          {catalogQuery.isLoading ? <p className="text-sm text-slate-600">Loading catalog...</p> : null}

          {!catalogQuery.isLoading && grouped.length === 0 ? (
            <p className="text-sm text-slate-600">No permissions match your search.</p>
          ) : null}

          <div className="space-y-4">
            {grouped.map(([group, moduleRows]) => (
              <div key={group} className="space-y-3 rounded border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-800">
                  {group}
                </div>
                <div className="space-y-3">
                  {moduleRows.map(([module, rows]) => (
                    <div key={module} className="rounded border border-slate-200">
                      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                        {module}
                      </div>
                      <div className="space-y-2 p-3">
                        {rows.map((row) => (
                          <div key={row.key} className="rounded border border-slate-100 bg-white p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-mono text-xs text-slate-700">{row.key}</p>
                              <Badge variant={riskBadgeVariant(row.risk)}>{row.risk}</Badge>
                            </div>
                            <p className="mt-1 text-sm font-medium text-slate-800">{row.label}</p>
                            <p className="mt-1 text-sm text-slate-700">{row.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
