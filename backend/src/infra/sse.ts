const connections = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>();
const encoder = new TextEncoder();
let broadcastCount = 0;
let lastBroadcastAt: Date | null = null;

// Test-only observable log of broadcasts. Production code never reads this;
// tests assert cross-org broadcast leakage (C-11) by inspecting it.
export const broadcasts: Array<{ orgId: string; payload: unknown }> = [];
export function resetBroadcasts() {
  broadcasts.length = 0;
  broadcastCount = 0;
  lastBroadcastAt = null;
}

export function addSseConnection(
  key: string,
  ctrl: ReadableStreamDefaultController<Uint8Array>
) {
  if (!connections.has(key)) connections.set(key, new Set());
  connections.get(key)!.add(ctrl);
}

export function removeSseConnection(
  key: string,
  ctrl: ReadableStreamDefaultController<Uint8Array>
) {
  const set = connections.get(key);
  if (set) {
    set.delete(ctrl);
    if (set.size === 0) connections.delete(key);
  }
}

export function getSseConnectionStats(): {
  orgCount: number;
  totalConnections: number;
  broadcastCount: number;
  lastBroadcastAt: string | null;
} {
  let total = 0;
  for (const set of connections.values()) total += set.size;
  return {
    orgCount: connections.size,
    totalConnections: total,
    broadcastCount,
    lastBroadcastAt: lastBroadcastAt?.toISOString() ?? null
  };
}

export function broadcastLocationUpdate(orgId: string, payload: unknown) {
  broadcastCount += 1;
  lastBroadcastAt = new Date();
  broadcasts.push({ orgId, payload });
  const data = encoder.encode(
    `event: location-update\ndata: ${JSON.stringify(payload)}\n\n`
  );
  for (const ctrl of connections.get(orgId) ?? []) {
    try {
      ctrl.enqueue(data);
    } catch (err) {
      console.warn(`[sse] enqueue failed for org=${orgId}, removing connection:`, err);
      removeSseConnection(orgId, ctrl);
    }
  }
  for (const ctrl of connections.get("*") ?? []) {
    try {
      ctrl.enqueue(data);
    } catch (err) {
      console.warn(`[sse] enqueue failed for org=*, removing connection:`, err);
      removeSseConnection("*", ctrl);
    }
  }
}
