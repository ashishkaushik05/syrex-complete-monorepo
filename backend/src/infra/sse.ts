const connections = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>();
const encoder = new TextEncoder();

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

export function broadcastLocationUpdate(orgId: string, payload: unknown) {
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
