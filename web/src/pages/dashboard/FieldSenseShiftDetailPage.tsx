import { useEffect, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { ArrowLeft, MapPin, Navigation, Radio, Route, Timer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { trpcQuery } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type Shift = {
  id: string
  agentId: string
  startedAt: string
  endedAt: string | null
  startType: 'auto' | 'manual'
  endType: 'auto' | 'manual' | 'extended' | null
  status: 'active' | 'completed'
}

type TrailPoint = { lat: number; lng: number; recordedAt: string }

type TrailMeta = {
  points: TrailPoint[]
  rawPointCount: number
  totalDistanceMeters: number
  durationSeconds: number | null
  startedAt: string | null
  endedAt: string | null
}

type Visit = {
  id: string
  lat: number
  lng: number
  description: string | null
  outletId: string | null
  recordedAt: string
}

type Stop = {
  id: string
  lat: number
  lng: number
  reason: string | null
  notes: string | null
  startedAt: string
  endedAt: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDuration(startedAt: string, endedAt: string | null, durationSeconds: number | null): string {
  if (durationSeconds !== null) {
    const h = Math.floor(durationSeconds / 3600)
    const m = Math.floor((durationSeconds % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }
  const end = endedAt ? new Date(endedAt) : new Date()
  const secs = Math.floor((end.getTime() - new Date(startedAt).getTime()) / 1000)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return `${h}h ${m}m`
}

function fmtDistance(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
  return `${Math.round(meters)} m`
}

// ── Map fit-bounds helper ──────────────────────────────────────────────────────

function FitBounds({ points }: { points: TrailPoint[] }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || points.length === 0) return
    fitted.current = true
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15)
    } else {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [points, map])
  return null
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
            {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
          </div>
          <div className="rounded-lg bg-slate-50 p-2 text-slate-400">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function FieldSenseShiftDetailPage() {
  const { id: shiftId } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()

  // Shift data + agent name may be passed via navigation state from the list page
  const stateShift = (location.state as { shift?: Shift; agentName?: string } | null)
  const shift: Shift | undefined = stateShift?.shift
  const agentName: string = stateShift?.agentName ?? 'Unknown Agent'

  const trailQuery = useQuery({
    queryKey: ['field-trail', shiftId],
    queryFn: () => trpcQuery<TrailMeta>('fieldLocation.trail', { shiftId, simplifyTolerance: 3 }),
    enabled: !!shiftId,
  })

  const visitsQuery = useQuery({
    queryKey: ['field-visits-shift', shiftId],
    queryFn: () => trpcQuery<Visit[]>('fieldVisits.forShift', { shiftId }),
    enabled: !!shiftId,
  })

  const stopsQuery = useQuery({
    queryKey: ['field-stops-shift', shiftId],
    queryFn: () => trpcQuery<Stop[]>('fieldStops.list', { shiftId, limit: 200 }),
    enabled: !!shiftId,
  })

  const trail = trailQuery.data
  const visits = visitsQuery.data ?? []
  const stops = stopsQuery.data ?? []

  const mapPoints = trail?.points ?? []
  const defaultCenter: [number, number] = [20.5937, 78.9629]

  const isLoading = trailQuery.isLoading || visitsQuery.isLoading || stopsQuery.isLoading

  return (
    <div className="space-y-5">
      {/* Back + header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="mt-0.5 h-8 w-8 p-0 text-slate-500"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold text-slate-900">{agentName}</h1>
            {shift && (
              shift.status === 'active' ? (
                <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Active
                </Badge>
              ) : (
                <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">Completed</Badge>
              )
            )}
            {shift?.startType === 'auto' && (
              <Badge className="bg-cyan-100 text-cyan-700 hover:bg-cyan-100">Auto-start</Badge>
            )}
          </div>
          {shift && (
            <p className="text-sm text-slate-500">
              {fmtDate(shift.startedAt)} · {fmtTime(shift.startedAt)}
              {shift.endedAt ? ` – ${fmtTime(shift.endedAt)}` : ' (ongoing)'}
            </p>
          )}
        </div>
      </div>

      {/* Metrics */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<Timer className="h-5 w-5" />}
            label="Duration"
            value={shift ? fmtDuration(shift.startedAt, shift.endedAt, trail?.durationSeconds ?? null) : '—'}
          />
          <StatCard
            icon={<Route className="h-5 w-5" />}
            label="Distance"
            value={trail ? fmtDistance(trail.totalDistanceMeters) : '—'}
            sub={trail ? `${trail.rawPointCount} GPS points` : undefined}
          />
          <StatCard
            icon={<MapPin className="h-5 w-5" />}
            label="Visits"
            value={String(visits.length)}
          />
          <StatCard
            icon={<Radio className="h-5 w-5" />}
            label="Stops"
            value={String(stops.length)}
            sub={stops.filter(s => !s.endedAt).length > 0 ? `${stops.filter(s => !s.endedAt).length} ongoing` : undefined}
          />
        </div>
      )}

      {/* Map */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Navigation className="h-4 w-4 text-cyan-500" />
            Shift Trail
            <span className="ml-auto flex items-center gap-3 text-xs font-normal text-slate-400">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-500" /> Trail
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" /> Visit
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> Stop
              </span>
            </span>
          </CardTitle>
        </CardHeader>
        <div className="h-[420px]">
          {trailQuery.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
            </div>
          ) : (
            <MapContainer
              center={defaultCenter}
              zoom={5}
              style={{ height: '100%', width: '100%' }}
              zoomControl
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {mapPoints.length > 0 && <FitBounds points={mapPoints} />}
              {mapPoints.length > 1 && (
                <Polyline
                  positions={mapPoints.map((p) => [p.lat, p.lng])}
                  pathOptions={{ color: '#06b6d4', weight: 4, opacity: 0.8 }}
                />
              )}
              {/* Start marker */}
              {mapPoints.length > 0 && (
                <CircleMarker
                  center={[mapPoints[0].lat, mapPoints[0].lng]}
                  radius={8}
                  pathOptions={{ fillColor: '#10b981', fillOpacity: 1, color: 'white', weight: 2 }}
                >
                  <Popup><div className="text-xs font-semibold">Shift Start<br />{fmtTime(mapPoints[0].recordedAt)}</div></Popup>
                </CircleMarker>
              )}
              {/* End marker */}
              {mapPoints.length > 1 && (
                <CircleMarker
                  center={[mapPoints[mapPoints.length - 1].lat, mapPoints[mapPoints.length - 1].lng]}
                  radius={8}
                  pathOptions={{ fillColor: shift?.status === 'active' ? '#06b6d4' : '#6366f1', fillOpacity: 1, color: 'white', weight: 2 }}
                >
                  <Popup>
                    <div className="text-xs font-semibold">
                      {shift?.status === 'active' ? 'Last Known Position' : 'Shift End'}
                      <br />{fmtTime(mapPoints[mapPoints.length - 1].recordedAt)}
                    </div>
                  </Popup>
                </CircleMarker>
              )}
              {/* Visits */}
              {visits.map((v) => (
                <CircleMarker
                  key={v.id}
                  center={[v.lat, v.lng]}
                  radius={7}
                  pathOptions={{ fillColor: '#f97316', fillOpacity: 1, color: 'white', weight: 2 }}
                >
                  <Popup>
                    <div className="max-w-[160px]">
                      <p className="text-xs font-semibold text-slate-700">Visit</p>
                      {v.description && <p className="mt-0.5 text-xs text-slate-500">{v.description}</p>}
                      <p className="mt-1 text-[11px] text-slate-400">{fmtTime(v.recordedAt)}</p>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
              {/* Stops */}
              {stops.map((s) => (
                <CircleMarker
                  key={s.id}
                  center={[s.lat, s.lng]}
                  radius={6}
                  pathOptions={{ fillColor: '#ef4444', fillOpacity: 0.9, color: 'white', weight: 2 }}
                >
                  <Popup>
                    <div className="max-w-[160px]">
                      <p className="text-xs font-semibold text-slate-700">Stop</p>
                      {s.reason && <p className="mt-0.5 text-xs text-slate-500">{s.reason}</p>}
                      <p className="mt-1 text-[11px] text-slate-400">
                        {fmtTime(s.startedAt)}{s.endedAt ? ` – ${fmtTime(s.endedAt)}` : ' (ongoing)'}
                      </p>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          )}
        </div>
      </Card>

      {/* Visits table */}
      <Card>
        <CardHeader className="border-b px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <MapPin className="h-4 w-4 text-orange-500" />
            Visits ({visits.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {visitsQuery.isLoading ? (
            <div className="space-y-2 p-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : visits.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-400">No visits logged for this shift.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Coordinates</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visits.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="tabular-nums text-slate-600">{fmtTime(v.recordedAt)}</TableCell>
                    <TableCell className="text-slate-700">{v.description ?? <span className="text-slate-400">—</span>}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-400">
                      {v.lat.toFixed(5)}, {v.lng.toFixed(5)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Stops table */}
      <Card>
        <CardHeader className="border-b px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Radio className="h-4 w-4 text-red-500" />
            Stops ({stops.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {stopsQuery.isLoading ? (
            <div className="space-y-2 p-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : stops.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-400">No stops recorded for this shift.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Ended</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stops.map((s) => {
                  const durSecs = s.endedAt
                    ? Math.floor((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)
                    : null
                  const durStr = durSecs !== null
                    ? durSecs < 60 ? `${durSecs}s` : `${Math.floor(durSecs / 60)}m ${durSecs % 60}s`
                    : 'Ongoing'
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="tabular-nums text-slate-600">{fmtTime(s.startedAt)}</TableCell>
                      <TableCell className="tabular-nums text-slate-500">
                        {s.endedAt ? fmtTime(s.endedAt) : <span className="text-orange-500">Ongoing</span>}
                      </TableCell>
                      <TableCell className="tabular-nums text-slate-600">{durStr}</TableCell>
                      <TableCell className="text-slate-700">{s.reason ?? <span className="text-slate-400">—</span>}</TableCell>
                      <TableCell className="text-slate-500">{s.notes ?? <span className="text-slate-400">—</span>}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
