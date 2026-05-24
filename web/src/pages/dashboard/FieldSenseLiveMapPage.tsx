import { useEffect, useRef, useState, Component } from 'react'
import type { ReactNode } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { MapPin, Navigation, Radio, Signal, Users, X } from 'lucide-react'
import { openFieldSenseStream, trpcQuery } from '@/lib/api'

type ActiveAgent = {
  agentId: string
  agentName: string
  shiftId: string
  shiftStartedAt: string
  lastPingAt: string | null
  lat: number | null
  lng: number | null
}

type TrailPoint = {
  lat: number
  lng: number
  recordedAt: string
}

type Visit = {
  id: string
  lat: number
  lng: number
  description: string | null
  recordedAt: string
}

type Stop = {
  id: string
  agentId: string
  shiftId: string
  lat: number
  lng: number
  reason: string | null
  notes: string | null
  startedAt: string
  endedAt: string | null
}

type TrailMeta = {
  points: TrailPoint[]
  rawPointCount: number
  totalDistanceMeters: number
  durationSeconds: number | null
  startedAt: string | null
  endedAt: string | null
}

type AgentWithDetail = ActiveAgent & {
  trail?: TrailMeta
  visits?: Visit[]
  stops?: Stop[]
  trailLoading?: boolean
}

type LiveState = {
  [agentId: string]: { lat: number; lng: number; recordedAt: string }
}


const AGENT_COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#3b82f6', '#84cc16']

function agentColor(index: number) {
  return AGENT_COLORS[index % AGENT_COLORS.length]
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDistance(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${meters} m`
}

function timeAgo(iso: string | null) {
  if (!iso) return 'Never'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function AgentMarkers({
  agents,
  livePositions,
  colorMap,
  selectedId,
  onSelect,
}: {
  agents: AgentWithDetail[]
  livePositions: LiveState
  colorMap: Map<string, string>
  selectedId: string | null
  onSelect: (agent: AgentWithDetail) => void
}) {
  return (
    <>
      {agents.map((agent) => {
        const live = livePositions[agent.agentId]
        const lat = live?.lat ?? agent.lat
        const lng = live?.lng ?? agent.lng
        if (lat === null || lng === null) return null
        const color = colorMap.get(agent.agentId) ?? '#06b6d4'
              return (
          <CircleMarker
            key={agent.agentId}
            center={[lat, lng]}
            radius={12}
            pathOptions={{
              fillColor: selectedId === agent.agentId ? '#f97316' : color,
              fillOpacity: 1,
              color: 'white',
              weight: 3,
            }}
            eventHandlers={{ click: () => onSelect(agent) }}
          >
            <Popup>
              <div className="text-sm font-semibold">{agent.agentName}</div>
            </Popup>
          </CircleMarker>
        )
      })}
    </>
  )
}

function FitBoundsOnAgents({ agents, livePositions }: { agents: ActiveAgent[]; livePositions: LiveState }) {
  const map = useMap()
  const prevCountRef = useRef(0)

  useEffect(() => {
    if (agents.length === 0) return
    // Only re-fit when the agent count increases (new agents joined)
    if (agents.length <= prevCountRef.current) {
      prevCountRef.current = agents.length
      return
    }
    prevCountRef.current = agents.length

    const points = agents
      .map((a) => {
        const live = livePositions[a.agentId]
        return { lat: live?.lat ?? a.lat, lng: live?.lng ?? a.lng }
      })
      .filter((p): p is { lat: number; lng: number } => p.lat !== null && p.lng !== null)
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14)
    } else {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]))
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [agents, livePositions, map])

  return null
}

class MapErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full text-red-500">
          Map failed to load. Please refresh.
        </div>
      )
    }
    return this.props.children
  }
}

export function FieldSenseLiveMapPage() {
  const [agents, setAgents] = useState<AgentWithDetail[]>([])
  const [livePositions, setLivePositions] = useState<LiveState>({})
  const [selectedAgent, setSelectedAgent] = useState<AgentWithDetail | null>(null)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const trailRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedAgentRef = useRef<AgentWithDetail | null>(null)

  const colorMap = useRef<Map<string, string>>(new Map())

  // Keep ref in sync so the SSE callback can read latest selected agent
  useEffect(() => { selectedAgentRef.current = selectedAgent }, [selectedAgent])

  const refreshSelectedTrail = (shiftId: string) => {
    if (trailRefreshTimer.current) clearTimeout(trailRefreshTimer.current)
    trailRefreshTimer.current = setTimeout(async () => {
      try {
        const trailMeta = await trpcQuery<TrailMeta>('fieldLocation.trail', { shiftId, simplifyTolerance: 5 })
        setSelectedAgent((prev) =>
          prev?.shiftId === shiftId ? { ...prev, trail: trailMeta } : prev,
        )
      } catch { /* ignore — stale trail is better than crashing */ }
    }, 500)
  }

  useEffect(() => {
    setLoading(true)
    trpcQuery<ActiveAgent[]>('fieldLocation.activeAgents', {})
      .then((data) => {
        data.forEach((agent, i) => {
          if (!colorMap.current.has(agent.agentId)) {
            colorMap.current.set(agent.agentId, agentColor(i))
          }
        })
        setAgents(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err?.response?.data?.error?.message ?? 'Failed to load agents')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    abortRef.current = controller

    openFieldSenseStream((payload) => {
      setConnected(true)
      setLivePositions((prev) => ({
        ...prev,
        [payload.agentId]: { lat: payload.lat, lng: payload.lng, recordedAt: payload.recordedAt ?? payload.receivedAt },
      }))
      setAgents((prev) =>
        prev.map((a) =>
          a.agentId === payload.agentId
            ? { ...a, lat: payload.lat, lng: payload.lng, lastPingAt: payload.recordedAt ?? payload.receivedAt }
            : a,
        ),
      )
      const sel = selectedAgentRef.current
      if (sel && sel.agentId === payload.agentId) {
        refreshSelectedTrail(sel.shiftId)
      }
    }, controller.signal)

    return () => { controller.abort() }
  }, [])

  const handleSelectAgent = async (agent: AgentWithDetail) => {
    const capturedAgentId = agent.agentId // Capture at call time to avoid stale closure
    setSelectedAgent({ ...agent, trailLoading: true })
    try {
      const [trailMeta, visitsData, stopsData] = await Promise.all([
        trpcQuery<TrailMeta>('fieldLocation.trail', { shiftId: agent.shiftId, simplifyTolerance: 5 }),
        trpcQuery<Visit[]>('fieldVisits.forShift', { shiftId: agent.shiftId }),
        trpcQuery<Stop[]>('fieldStops.list', { shiftId: agent.shiftId, limit: 100 }),
      ])
      setSelectedAgent((prev) =>
        prev?.agentId === capturedAgentId
          ? { ...prev, trail: trailMeta, visits: visitsData, stops: stopsData, trailLoading: false }
          : prev,
      )
    } catch {
      setSelectedAgent((prev) =>
        prev?.agentId === capturedAgentId ? { ...prev, trailLoading: false } : prev,
      )
    }
  }

  const defaultCenter: [number, number] = [20.5937, 78.9629]

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col gap-3">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-slate-900">Live Map</h1>
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-slate-500" />
            <span className="text-sm text-slate-600">
              {agents.length} agent{agents.length !== 1 ? 's' : ''} active
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`}
          />
          <span className="text-xs text-slate-500">{connected ? 'Live' : 'Connecting…'}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="relative flex flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Map */}
        <div className="flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
            </div>
          ) : (
            <MapErrorBoundary>
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
              <FitBoundsOnAgents agents={agents} livePositions={livePositions} />
              <AgentMarkers
                agents={agents}
                livePositions={livePositions}
                colorMap={colorMap.current}
                selectedId={selectedAgent?.agentId ?? null}
                onSelect={handleSelectAgent}
              />
              {/* Selected agent trail */}
              {selectedAgent?.trail?.points && selectedAgent.trail.points.length > 1 && (
                <Polyline
                  positions={selectedAgent.trail.points.map((p) => [p.lat, p.lng])}
                  pathOptions={{ color: '#06b6d4', weight: 3, opacity: 0.8 }}
                />
              )}
              {/* Selected agent visits */}
              {selectedAgent?.visits?.map((visit) => (
                <CircleMarker
                  key={visit.id}
                  center={[visit.lat, visit.lng]}
                  radius={7}
                  pathOptions={{ fillColor: '#f97316', fillOpacity: 1, color: 'white', weight: 2 }}
                >
                  <Popup>
                    <div className="max-w-[180px]">
                      <div className="text-xs font-semibold text-slate-700">Visit</div>
                      {visit.description && (
                        <div className="mt-0.5 text-xs text-slate-500">{visit.description}</div>
                      )}
                      <div className="mt-1 text-[11px] text-slate-400">
                        {new Date(visit.recordedAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
              {/* Selected agent stops */}
              {selectedAgent?.stops?.map((stop) => (
                <CircleMarker
                  key={stop.id}
                  center={[stop.lat, stop.lng]}
                  radius={5}
                  pathOptions={{ fillColor: '#ef4444', fillOpacity: 0.9, color: 'white', weight: 2 }}
                >
                  <Popup>
                    <div className="max-w-[180px]">
                      <div className="text-xs font-semibold text-slate-700">Stop</div>
                      {stop.reason && (
                        <div className="mt-0.5 text-xs text-slate-500">{stop.reason}</div>
                      )}
                      <div className="mt-1 text-[11px] text-slate-400">
                        {new Date(stop.startedAt).toLocaleTimeString()}
                        {stop.endedAt ? ` → ${new Date(stop.endedAt).toLocaleTimeString()}` : ' (ongoing)'}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
            </MapErrorBoundary>
          )}
        </div>

        {/* Agent list panel (left overlay) */}
        {agents.length > 0 && !selectedAgent && (
          <div className="absolute left-3 top-3 z-[1000] w-52 space-y-1.5 rounded-lg border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Active Agents
            </p>
            {agents.map((agent) => {
              const live = livePositions[agent.agentId]
              const hasPos = (live?.lat ?? agent.lat) !== null
              return (
                <button
                  key={agent.agentId}
                  type="button"
                  onClick={() => handleSelectAgent(agent)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: colorMap.current.get(agent.agentId) ?? '#06b6d4' }}
                  />
                  <span className="flex-1 truncate font-medium text-slate-800">{agent.agentName}</span>
                  {hasPos ? (
                    <Signal className="h-3 w-3 shrink-0 text-emerald-500" />
                  ) : (
                    <Signal className="h-3 w-3 shrink-0 text-slate-300" />
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Selected agent detail panel */}
        {selectedAgent && (
          <div className="absolute right-3 top-3 z-[1000] w-64 rounded-lg border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: colorMap.current.get(selectedAgent.agentId) ?? '#06b6d4' }}
                />
                <span className="font-semibold text-slate-900">{selectedAgent.agentName}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAgent(null)}
                className="rounded p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-slate-50 px-2 py-1.5">
                  <p className="text-[10px] text-slate-400">Shift started</p>
                  <p className="text-xs font-medium text-slate-700">
                    {new Date(selectedAgent.shiftStartedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 px-2 py-1.5">
                  <p className="text-[10px] text-slate-400">Last seen</p>
                  <p className="text-xs font-medium text-slate-700">
                    {timeAgo(livePositions[selectedAgent.agentId]?.recordedAt ?? selectedAgent.lastPingAt)}
                  </p>
                </div>
              </div>
              {selectedAgent.trailLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                </div>
              ) : selectedAgent.trail ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-cyan-50 px-2 py-1.5">
                      <p className="text-[10px] text-cyan-600">Distance</p>
                      <p className="text-xs font-semibold text-cyan-700">
                        {formatDistance(selectedAgent.trail.totalDistanceMeters)}
                      </p>
                    </div>
                    <div className="rounded-md bg-cyan-50 px-2 py-1.5">
                      <p className="text-[10px] text-cyan-600">Duration</p>
                      <p className="text-xs font-semibold text-cyan-700">
                        {formatDuration(selectedAgent.trail.durationSeconds)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-orange-500" />
                    <span className="text-xs text-slate-600">
                      {selectedAgent.visits?.length ?? 0} visit{(selectedAgent.visits?.length ?? 0) !== 1 ? 's' : ''}
                    </span>
                    <Radio className="ml-auto h-3.5 w-3.5 text-red-400" />
                    <span className="text-xs text-slate-600">
                      {selectedAgent.stops?.length ?? 0} stop{(selectedAgent.stops?.length ?? 0) !== 1 ? 's' : ''}
                    </span>
                    <Navigation className="ml-auto h-3.5 w-3.5 text-cyan-500" />
                    <span className="text-xs text-slate-600">
                      {selectedAgent.trail.points.length} trail pts
                      {selectedAgent.trail.rawPointCount > selectedAgent.trail.points.length && (
                        <span className="ml-1 text-slate-400">
                          ({selectedAgent.trail.rawPointCount} raw)
                        </span>
                      )}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {!loading && agents.length === 0 && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="text-center">
              <Radio className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">No agents on shift right now</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
