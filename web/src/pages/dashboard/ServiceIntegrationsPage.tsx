import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type MachineClient = {
  id: string
  clientId: string
  name: string
  scopes: string[]
  status: 'active' | 'revoked'
  secretLast4: string
  expiresAt: string | null
  rotatedAt: string
  lastUsedAt: string | null
  createdById: string | null
  createdAt: string
}

const AVAILABLE_SCOPES = ['service.read', 'service.write', 'service.manage']

export function ServiceIntegrationsPage() {
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createScopes, setCreateScopes] = useState<string[]>(['service.read'])
  const [createExpiry, setCreateExpiry] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  // One-time secret display
  const [revealedSecret, setRevealedSecret] = useState<{ clientId: string; secret: string } | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['service-integrations-clients'] })

  const clientsQuery = useQuery<MachineClient[]>({
    queryKey: ['service-integrations-clients'],
    queryFn: async () => {
      const response = await api.get<{ data: { data: MachineClient[] } }>('/service/integrations/clients')
      const payload = response.data as any
      if (Array.isArray(payload?.data?.data)) return payload.data.data
      if (Array.isArray(payload?.data)) return payload.data
      return []
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!createName.trim()) throw new Error('Name is required')
      if (createScopes.length === 0) throw new Error('At least one scope is required')
      const response = await api.post<{ data: { data: { client: MachineClient; secret: string } } }>(
        '/service/integrations/clients',
        {
          name: createName.trim(),
          scopes: createScopes,
          expiresAt: createExpiry ? new Date(createExpiry).toISOString() : undefined,
        },
      )
      const payload = response.data as any
      return payload?.data?.data ?? payload?.data ?? payload
    },
    onSuccess: (result) => {
      invalidate()
      setCreateOpen(false)
      setCreateName('')
      setCreateScopes(['service.read'])
      setCreateExpiry('')
      setCreateError(null)
      if (result?.secret && result?.client?.clientId) {
        setRevealedSecret({ clientId: result.client.clientId, secret: result.secret })
      }
    },
    onError: (error) => {
      setCreateError(apiErrorMessage(error, 'Failed to create client'))
    },
  })

  const rotateMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const response = await api.post(`/service/integrations/clients/${clientId}/rotate`, {})
      const payload = response.data as any
      return payload?.data?.data ?? payload?.data ?? payload
    },
    onSuccess: (result) => {
      invalidate()
      if (result?.secret && result?.client?.clientId) {
        setRevealedSecret({ clientId: result.client.clientId, secret: result.secret })
      }
    },
  })

  const revokeMutation = useMutation({
    mutationFn: async (clientId: string) =>
      api.post(`/service/integrations/clients/${clientId}/revoke`, {}),
    onSuccess: invalidate,
  })

  function toggleScope(scope: string) {
    setCreateScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    )
  }

  const clients = clientsQuery.data ?? []

  return (
    <>
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Service Machine Clients</CardTitle>
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            New Client
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Machine credentials for external systems (test equipment, automated pipelines) to call service APIs.
          </p>

          {clientsQuery.isLoading ? <p className="text-sm text-slate-500">Loading clients...</p> : null}
          {clientsQuery.isError ? (
            <p className="text-sm text-red-600">
              {apiErrorMessage(clientsQuery.error, 'Unable to load clients.')}
            </p>
          ) : null}

          {!clientsQuery.isLoading && clients.length === 0 ? (
            <p className="text-sm text-slate-500">No machine clients yet.</p>
          ) : null}

          {clients.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Client ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scopes</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Secret (last 4)</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium text-slate-900">{client.name}</TableCell>
                      <TableCell>
                        <code className="text-xs font-mono text-slate-600">
                          {client.clientId.slice(0, 20)}…
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            client.status === 'active'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700'
                          }
                        >
                          {client.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {client.scopes.map((scope) => (
                            <Badge key={scope} variant="secondary" className="bg-slate-100 text-slate-600 text-xs">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {client.lastUsedAt ? timeAgo(client.lastUsedAt) : 'Never'}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {client.expiresAt ? new Date(client.expiresAt).toLocaleDateString() : 'Never'}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs font-mono text-slate-500">…{client.secretLast4}</code>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {client.status === 'active' ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={rotateMutation.isPending || revokeMutation.isPending}
                                onClick={() => rotateMutation.mutate(client.clientId)}
                              >
                                Rotate
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={rotateMutation.isPending || revokeMutation.isPending}
                                onClick={() => {
                                  if (confirm(`Revoke client "${client.name}"? This cannot be undone.`)) {
                                    revokeMutation.mutate(client.clientId)
                                  }
                                }}
                              >
                                Revoke
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">Revoked</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Create Client Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Machine Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Battery Test Machine A"
              />
            </div>
            <div className="space-y-2">
              <Label>Scopes</Label>
              <div className="space-y-2">
                {AVAILABLE_SCOPES.map((scope) => (
                  <label key={scope} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createScopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <code className="text-sm font-mono text-slate-700">{scope}</code>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Expiry Date (optional)</Label>
              <Input
                type="date"
                value={createExpiry}
                onChange={(e) => setCreateExpiry(e.target.value)}
              />
            </div>
            {createError ? <p className="text-sm text-red-600">{createError}</p> : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time Secret Display */}
      <Dialog open={Boolean(revealedSecret)} onOpenChange={() => setRevealedSecret(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Client Secret — Copy Now</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-amber-700 bg-amber-50 rounded-md p-3 border border-amber-200">
              This secret will not be shown again. Copy it now and store it securely.
            </p>
            {revealedSecret ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wide text-slate-500">Client ID</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs font-mono break-all">
                      {revealedSecret.clientId}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(revealedSecret.clientId)}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wide text-slate-500">Secret</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs font-mono break-all">
                      {revealedSecret.secret}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(revealedSecret!.secret)}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setRevealedSecret(null)}>
              I have copied the secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
