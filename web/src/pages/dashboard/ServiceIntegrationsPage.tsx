import { useEffect, useRef, useState } from 'react'
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

const AVAILABLE_SCOPES = [
  { value: 'service.read',   label: 'service.read',   desc: 'Read complaints, test reports, and form submissions' },
  { value: 'service.write',  label: 'service.write',  desc: 'Submit form data and test results' },
  { value: 'service.manage', label: 'service.manage', desc: 'Full management access including assignments and closures' },
]

export function ServiceIntegrationsPage() {
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createScopes, setCreateScopes] = useState<string[]>(['service.read'])
  const [createExpiry, setCreateExpiry] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  const [revealedSecret, setRevealedSecret] = useState<{ clientId: string; secret: string } | null>(null)
  const [copiedField, setCopiedField] = useState<'clientId' | 'secret' | null>(null)

  // FC-023: rotate confirmation dialog
  const [confirmRotateId, setConfirmRotateId] = useState<string | null>(null)
  // FC-028: revoke confirmation dialog
  const [confirmRevokeClient, setConfirmRevokeClient] = useState<{ clientId: string; name: string } | null>(null)
  // FC-024: per-row pending tracking
  const [rotatingId, setRotatingId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  // FC-027: cleanup clipboard timer on unmount
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['service-integrations-clients'] })

  const clientsQuery = useQuery<MachineClient[]>({
    queryKey: ['service-integrations-clients'],
    queryFn: async () => {
      const response = await api.get('/service/integrations/clients')
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
      const response = await api.post('/service/integrations/clients', {
        name: createName.trim(),
        scopes: createScopes,
        expiresAt: createExpiry ? new Date(createExpiry).toISOString() : undefined,
      })
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
      setRotatingId(null)
      invalidate()
      if (result?.secret && result?.client?.clientId) {
        setRevealedSecret({ clientId: result.client.clientId, secret: result.secret })
      }
    },
    onError: () => setRotatingId(null),
  })

  const revokeMutation = useMutation({
    mutationFn: async (clientId: string) =>
      api.post(`/service/integrations/clients/${clientId}/revoke`, {}),
    onSuccess: () => { setRevokingId(null); invalidate() },
    onError: () => setRevokingId(null),
  })

  function toggleScope(scope: string) {
    setCreateScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    )
  }

  async function copyToClipboard(text: string, field: 'clientId' | 'secret') {
    try {
      await navigator.clipboard.writeText(text)
      if (timerRef.current) clearTimeout(timerRef.current)
      setCopiedField(field)
      timerRef.current = setTimeout(() => setCopiedField(null), 2000)
    } catch {
      // clipboard write failed — silently ignore
    }
  }

  const clients = clientsQuery.data ?? []
  const activeCount = clients.filter((c) => c.status === 'active').length

  return (
    <>
      <div className="space-y-4">
        {/* Stats row */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total Clients</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">
                {clientsQuery.isLoading ? '—' : clients.length}
              </p>
            </CardContent>
          </Card>
          <Card className="border-emerald-100 bg-emerald-50 shadow-sm">
            <CardContent className="px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">Active</p>
              <p className="mt-1 text-3xl font-bold text-emerald-900">
                {clientsQuery.isLoading ? '—' : activeCount}
              </p>
            </CardContent>
          </Card>
          <Card className="border-rose-100 bg-rose-50 shadow-sm">
            <CardContent className="px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-500">Revoked</p>
              <p className="mt-1 text-3xl font-bold text-rose-900">
                {clientsQuery.isLoading ? '—' : clients.length - activeCount}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Clients table */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3 pt-5 px-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Machine Clients</CardTitle>
                <p className="text-sm text-slate-500 mt-0.5">
                  Credentials for test equipment, automated pipelines, and external systems.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setCreateOpen(true)}
                className="bg-teal-600 hover:bg-teal-700 text-white shrink-0"
              >
                + New Client
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {clientsQuery.isLoading ? (
              <div className="flex items-center gap-3 py-8 text-slate-400 justify-center">
                <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-sm">Loading clients…</span>
              </div>
            ) : clientsQuery.isError ? (
              <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
                <p className="text-sm">{apiErrorMessage(clientsQuery.error, 'Unable to load clients.')}</p>
              </div>
            ) : clients.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700">No machine clients yet</p>
                <p className="text-xs text-slate-400 max-w-[280px]">
                  Create a client to allow external systems like test equipment or automation pipelines to access the service API.
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  className="mt-1 bg-teal-600 hover:bg-teal-700 text-white"
                >
                  Create First Client
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {clients.map((client) => (
                  <div
                    key={client.id}
                    className={`rounded-xl border px-4 py-3.5 ${client.status === 'active' ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-70'}`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800">{client.name}</span>
                          <Badge className={`border-0 text-xs ${client.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {client.status}
                          </Badge>
                        </div>
                        <div className="mt-1.5 flex items-center gap-4 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">ID</span>
                            <code className="text-[10px] font-mono text-slate-500">{client.clientId.slice(0, 24)}…</code>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Secret</span>
                            <code className="text-[10px] font-mono text-slate-500">••••{client.secretLast4}</code>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Last used</span>
                            <span className="text-[10px] text-slate-500">{client.lastUsedAt ? timeAgo(client.lastUsedAt) : 'Never'}</span>
                          </div>
                          {client.expiresAt ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Expires</span>
                              <span className="text-[10px] text-slate-500">{new Date(client.expiresAt).toLocaleDateString()}</span>
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {client.scopes.map((scope) => (
                            <code key={scope} className="text-[10px] font-mono bg-indigo-50 text-indigo-600 rounded px-1.5 py-0.5">
                              {scope}
                            </code>
                          ))}
                        </div>
                      </div>
                      {client.status === 'active' ? (
                        <div className="flex gap-2 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={rotatingId === client.clientId || revokingId === client.clientId}
                            onClick={() => setConfirmRotateId(client.clientId)}
                            className="text-xs"
                          >
                            {rotatingId === client.clientId ? 'Rotating…' : 'Rotate Secret'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={rotatingId === client.clientId || revokingId === client.clientId}
                            onClick={() => setConfirmRevokeClient({ clientId: client.clientId, name: client.name })}
                            className="text-xs border-rose-200 text-rose-600 hover:bg-rose-50"
                          >
                            {revokingId === client.clientId ? 'Revoking…' : 'Revoke'}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 shrink-0 self-center">Revoked {timeAgo(client.rotatedAt)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage guide */}
        <Card className="border-slate-200 bg-slate-50 shadow-sm">
          <CardContent className="px-5 py-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">API Authentication</p>
            <div className="space-y-2">
              <p className="text-xs text-slate-600">
                Machine clients authenticate using HTTP Basic Auth. Pass <code className="font-mono bg-slate-100 px-1 rounded">clientId</code> as username
                and the generated <code className="font-mono bg-slate-100 px-1 rounded">secret</code> as password.
              </p>
              <div className="rounded-md bg-slate-900 px-4 py-3">
                <code className="text-xs font-mono text-slate-300 leading-relaxed">
                  Authorization: Basic {'{'}base64(clientId:secret){'}'}
                </code>
              </div>
              <p className="text-[10px] text-slate-400">
                The secret is shown only once at creation or rotation. Store it securely in your system's secret manager.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Client Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Machine Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">
                Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Battery Test Machine A"
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">
                Scopes <span className="text-rose-500">*</span>
              </Label>
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                {AVAILABLE_SCOPES.map((scope) => (
                  <label key={scope.value} className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createScopes.includes(scope.value)}
                      onChange={() => toggleScope(scope.value)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-teal-600"
                    />
                    <div>
                      <code className="text-xs font-mono text-slate-800">{scope.label}</code>
                      <p className="text-[10px] text-slate-500 mt-0.5">{scope.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Expiry Date <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Input
                type="date"
                value={createExpiry}
                onChange={(e) => setCreateExpiry(e.target.value)}
              />
              <p className="text-[10px] text-slate-400">Leave blank for a non-expiring client.</p>
            </div>

            {createError ? (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{createError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setCreateOpen(false); setCreateError(null) }}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !createName.trim() || createScopes.length === 0}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {createMutation.isPending ? 'Creating…' : 'Create Client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FC-023: Rotate Secret Confirmation */}
      <Dialog open={Boolean(confirmRotateId)} onOpenChange={() => setConfirmRotateId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rotate Client Secret?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700">
              <svg className="h-5 w-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-sm">
                Rotating the secret will <strong>immediately invalidate the current secret</strong>. All systems using this client will stop working until updated. Are you sure?
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRotateId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                if (confirmRotateId) {
                  setRotatingId(confirmRotateId)
                  rotateMutation.mutate(confirmRotateId)
                }
                setConfirmRotateId(null)
              }}
            >
              Rotate Secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FC-028: Revoke Client Confirmation */}
      <Dialog open={Boolean(confirmRevokeClient)} onOpenChange={() => setConfirmRevokeClient(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke Client?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
              <svg className="h-5 w-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-sm">
                Revoke <strong>"{confirmRevokeClient?.name}"</strong>? This cannot be undone. All systems using this client will lose access immediately.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRevokeClient(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => {
                if (confirmRevokeClient) {
                  setRevokingId(confirmRevokeClient.clientId)
                  revokeMutation.mutate(confirmRevokeClient.clientId)
                }
                setConfirmRevokeClient(null)
              }}
            >
              Revoke Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time Secret Display */}
      <Dialog open={Boolean(revealedSecret)} onOpenChange={() => setRevealedSecret(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Client Secret — Save Now</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700">
              <svg className="h-5 w-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-sm font-medium">This secret is shown only once. Copy and store it in your secret manager before closing.</p>
            </div>

            {revealedSecret ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Client ID</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono break-all text-slate-700">
                      {revealedSecret.clientId}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(revealedSecret!.clientId, 'clientId')}
                      className={`shrink-0 text-xs ${copiedField === 'clientId' ? 'border-emerald-300 text-emerald-600' : ''}`}
                    >
                      {copiedField === 'clientId' ? '✓ Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Secret</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-mono break-all text-rose-800">
                      {revealedSecret.secret}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(revealedSecret!.secret, 'secret')}
                      className={`shrink-0 text-xs ${copiedField === 'secret' ? 'border-emerald-300 text-emerald-600' : ''}`}
                    >
                      {copiedField === 'secret' ? '✓ Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => setRevealedSecret(null)}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              I've saved the secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
