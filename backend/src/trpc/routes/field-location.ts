import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { broadcastLocationUpdate } from "../../infra/sse";
import { apiError } from "../error";
import type { TrpcContext } from "../context";
import {
  assertCanReadAgent,
  assertFieldEnabled,
  resolveReadOrgId,
  validateLocationPoint
} from "./field-helpers";

// ---------------------------------------------------------------------------
// M-04: in-memory sliding-window rate limiter for location ingest.
// Keyed by `${agentId}:${shiftId}`. Cap: INGEST_RATE_LIMIT points per window.
// Single-instance only (D-09); resets are best-effort. Stale buckets are
// swept every 5 min. Tests can call resetIngestBucket() to clear state.
// ---------------------------------------------------------------------------
const INGEST_RATE_WINDOW_MS = 60_000;
const INGEST_RATE_LIMIT = 2_000;
const ingestBuckets = new Map<string, number[]>();

function ingestKey(agentId: string, shiftId: string) {
  return `${agentId}:${shiftId}`;
}

function checkIngestRate(
  agentId: string,
  shiftId: string,
  incoming: number
): boolean {
  const key = ingestKey(agentId, shiftId);
  const now = Date.now();
  const cutoff = now - INGEST_RATE_WINDOW_MS;
  const bucket = ingestBuckets.get(key) ?? [];
  // Drop expired timestamps
  let firstFresh = 0;
  while (firstFresh < bucket.length && bucket[firstFresh] < cutoff) firstFresh++;
  const fresh = firstFresh === 0 ? bucket : bucket.slice(firstFresh);
  if (fresh.length + incoming > INGEST_RATE_LIMIT) {
    ingestBuckets.set(key, fresh);
    return false;
  }
  for (let i = 0; i < incoming; i++) fresh.push(now);
  ingestBuckets.set(key, fresh);
  return true;
}

export function resetIngestBucket(agentId: string, shiftId: string) {
  ingestBuckets.delete(ingestKey(agentId, shiftId));
}

// Sweep stale buckets every 5 min. Skip when running under tests.
if (
  typeof process === "undefined" ||
  (process.env.NODE_ENV !== "test" && !process.env.BUN_TEST)
) {
  setInterval(() => {
    const cutoff = Date.now() - INGEST_RATE_WINDOW_MS;
    for (const [key, bucket] of ingestBuckets) {
      let firstFresh = 0;
      while (firstFresh < bucket.length && bucket[firstFresh] < cutoff)
        firstFresh++;
      if (firstFresh === bucket.length) {
        ingestBuckets.delete(key);
      } else if (firstFresh > 0) {
        ingestBuckets.set(key, bucket.slice(firstFresh));
      }
    }
  }, 5 * 60_000).unref?.();
}

// ---------------------------------------------------------------------------
// Trail math helpers
// ---------------------------------------------------------------------------

function haversineMetres(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function perpendicularDistMetres(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const meanLatRad = (((a.lat + b.lat + p.lat) / 3) * Math.PI) / 180;
  const kx = Math.cos(meanLatRad) * 111_320;
  const ky = 110_540;
  const px = p.lng * kx;
  const py = p.lat * ky;
  const ax = a.lng * kx;
  const ay = a.lat * ky;
  const bx = b.lng * kx;
  const by = b.lat * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return haversineMetres(p, a);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const nx = ax + t * dx;
  const ny = ay + t * dy;
  return Math.sqrt((px - nx) ** 2 + (py - ny) ** 2);
}

function rdp<T extends { lat: number; lng: number }>(
  pts: T[],
  tolerance: number
): T[] {
  // M-01: surgical guard against stack overflow on very large trails.
  // For >50k points, evenly downsample to ~10k before recursing. The DB
  // already caps reads at 50k, but we keep this defensive in case callers
  // pass larger arrays (tests, future endpoints).
  if (pts.length > 50_000) {
    const step = Math.ceil(pts.length / 10_000);
    pts = pts.filter((_, i) => i % step === 0);
  }
  if (pts.length <= 2) return pts;
  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicularDistMetres(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist <= tolerance)
    return [pts[0], pts[pts.length - 1]];
  return [
    ...rdp(pts.slice(0, maxIdx + 1), tolerance),
    ...rdp(pts.slice(maxIdx), tolerance).slice(1)
  ];
}

function downsample<T>(pts: T[], maxPoints: number): T[] {
  if (pts.length <= maxPoints) return pts;
  const result: T[] = [pts[0]];
  const step = (pts.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(pts[Math.round(i * step)]);
  }
  result.push(pts[pts.length - 1]);
  return result;
}

function totalDistanceMetres(pts: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += haversineMetres(pts[i - 1], pts[i]);
  }
  return Math.round(total);
}

async function resolveOrgIdForShiftRead(ctx: TrpcContext, shiftId: string) {
  if (ctx.actor.orgId) return resolveReadOrgId(ctx);
  const shift = await ctx.prisma.shift.findUnique({
    where: { id: shiftId },
    select: { agentId: true, orgId: true }
  });
  if (!shift) throw apiError("NOT_FOUND", "Shift not found");
  assertCanReadAgent(ctx, shift.agentId);
  return shift.orgId;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const locationPointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number(),
  recordedAt: z.string().datetime()
});

const ingestV2PointSchema = z.object({
  clientPointId: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number(),
  recordedAt: z.string(),
  capturedAt: z.string().optional(),
  altitude: z.number().optional(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  source: z.string().optional(),
  isMocked: z.boolean().optional(),
  platform: z.string().optional(),
  appVersion: z.string().optional()
});

const ingestV2AckSchema = z.object({
  serverShiftId: z.string().nullable(),
  clientShiftId: z.string(),
  accepted: z.array(z.string()),
  duplicates: z.array(z.string()),
  rejected: z.array(
    z.object({
      clientPointId: z.string(),
      reason: z.string()
    })
  ),
  retryable: z.boolean()
});

const trailPointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  recordedAt: z.string()
});

const trailMetaSchema = z.object({
  points: z.array(trailPointSchema),
  rawPointCount: z.number(),
  returnedPointCount: z.number(),
  reducedByTolerance: z.boolean(),
  reducedByMaxPoints: z.boolean(),
  totalDistanceMeters: z.number(),
  durationSeconds: z.number().nullable(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  simplifyTolerance: z.number(),
  maxPoints: z.number(),
  truncated: z.boolean()
});

const activeAgentSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  shiftId: z.string(),
  shiftStartedAt: z.string(),
  lastPingAt: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  health: z
    .object({
      deviceId: z.string().nullable(),
      platform: z.string().nullable(),
      appVersion: z.string().nullable(),
      pendingQueueDepth: z.number().nullable(),
      lastCapturedAt: z.string().nullable(),
      lastReceivedAt: z.string().nullable(),
      lastSyncAttemptAt: z.string().nullable(),
      lastSyncErrorCode: z.string().nullable()
    })
    .nullable()
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const fieldLocationRouter = createTRPCRouter({
  ingest: perm(P.field.write)
    .input(
      z.object({
        locations: z.array(locationPointSchema).min(1).max(500)
      })
    )
    .output(z.object({ accepted: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const agentId = ctx.actor.id!;
      await assertFieldEnabled(ctx.prisma, agentId);
      const orgId = ctx.actor.orgId;

      const shift = await ctx.prisma.shift.findFirst({
        where: { agentId, status: "active", orgId: orgId ?? undefined },
        select: { id: true, orgId: true }
      });
      if (!shift) return { accepted: 0 };

      // M-04: per-(agent,shift) rate limit
      if (!checkIngestRate(agentId, shift.id, input.locations.length)) {
        throw apiError(
          "TOO_MANY_REQUESTS",
          "Ingest rate limit exceeded for this shift"
        );
      }

      const data = input.locations.map((l) => ({
        agentId,
        shiftId: shift.id,
        orgId: shift.orgId,
        lat: l.lat,
        lng: l.lng,
        accuracy: l.accuracy,
        recordedAt: new Date(l.recordedAt),
        receivedAt: new Date()
      }));

      await ctx.prisma.fieldLocation.createMany({ data });

      // C-11: Broadcast ONLY to shift.orgId. Previously a second broadcast went
      // to the attacker-controlled `x-org-id` header (now `ctx.actor.orgId`),
      // which leaked location data across orgs whenever the header diverged
      // from the shift's true org. `shift.orgId` is the single source of truth.
      const last = input.locations[input.locations.length - 1];
      broadcastLocationUpdate(shift.orgId, {
        orgId: shift.orgId,
        agentId,
        shiftId: shift.id,
        lat: last.lat,
        lng: last.lng,
        accuracy: last.accuracy,
        recordedAt: last.recordedAt,
        receivedAt: new Date().toISOString()
      });

      return { accepted: data.length };
    }),

  ingestV2: perm(P.field.write)
    .input(
      z.object({
        clientShiftId: z.string().min(1),
        shiftId: z.string().uuid().optional(),
        deviceId: z.string().optional(),
        points: z.array(ingestV2PointSchema).min(1).max(500)
      })
    )
    .output(ingestV2AckSchema)
    .mutation(async ({ ctx, input }) => {
      const agentId = ctx.actor.id!;
      await assertFieldEnabled(ctx.prisma, agentId);

      // Prefer orgId from x-org-id header; if absent, infer it from the shift
      // so mobile clients that don't send the header still work.
      let orgId = ctx.actor.orgId;
      if (!orgId) {
        const hint = await ctx.prisma.shift.findFirst({
          where: { agentId, clientShiftId: input.clientShiftId },
          select: { orgId: true }
        });
        if (!hint) {
          return {
            serverShiftId: null,
            clientShiftId: input.clientShiftId,
            accepted: [],
            duplicates: [],
            rejected: [],
            retryable: true
          };
        }
        orgId = hint.orgId;
      }

      const shift = input.shiftId
        ? await ctx.prisma.shift.findFirst({
            where: {
              id: input.shiftId,
              orgId,
              agentId,
              clientShiftId: input.clientShiftId
            },
            select: { id: true, orgId: true, agentId: true, clientShiftId: true }
          })
        : await ctx.prisma.shift.findUnique({
            where: {
              orgId_agentId_clientShiftId: {
                orgId,
                agentId,
                clientShiftId: input.clientShiftId
              }
            },
            select: { id: true, orgId: true, agentId: true, clientShiftId: true }
          });

      if (!shift) {
        return {
          serverShiftId: null,
          clientShiftId: input.clientShiftId,
          accepted: [],
          duplicates: [],
          rejected: [],
          retryable: true
        };
      }

      // M-04: per-(agent,shift) rate limit
      if (!checkIngestRate(agentId, shift.id, input.points.length)) {
        throw apiError(
          "TOO_MANY_REQUESTS",
          "Ingest rate limit exceeded for this shift"
        );
      }

      const rejected: Array<{ clientPointId: string; reason: string }> = [];
      const validPoints: Array<{
        clientPointId: string;
        lat: number;
        lng: number;
        accuracy: number;
        recordedAt: Date;
        capturedAt: Date | null;
        altitude?: number;
        speed?: number;
        heading?: number;
        source?: string;
        isMocked?: boolean;
        platform?: string;
        appVersion?: string;
      }> = [];

      const seenInBatch = new Set<string>();
      for (const point of input.points) {
        if (seenInBatch.has(point.clientPointId)) {
          rejected.push({
            clientPointId: point.clientPointId,
            reason: "DUPLICATE_IN_BATCH"
          });
          continue;
        }
        seenInBatch.add(point.clientPointId);

        const validation = validateLocationPoint(point);
        if (!validation.ok) {
          rejected.push({
            clientPointId: point.clientPointId,
            reason: validation.reason
          });
          continue;
        }

        validPoints.push({
          ...point,
          recordedAt: validation.recordedAt,
          capturedAt: validation.capturedAt
        });
      }

      const validIds = validPoints.map((point) => point.clientPointId);
      const existing = validIds.length
        ? await ctx.prisma.fieldLocation.findMany({
            where: {
              orgId,
              agentId,
              clientPointId: { in: validIds }
            },
            select: {
              clientPointId: true,
              lat: true,
              lng: true,
              accuracy: true,
              recordedAt: true,
              receivedAt: true
            }
          })
        : [];
      const existingIds = new Set(
        existing
          .map((point) => point.clientPointId)
          .filter((id): id is string => Boolean(id))
      );

      const toInsert = validPoints.filter(
        (point) => !existingIds.has(point.clientPointId)
      );
      if (toInsert.length > 0) {
        await ctx.prisma.fieldLocation.createMany({
          data: toInsert.map((point) => ({
            agentId,
            shiftId: shift.id,
            orgId,
            clientPointId: point.clientPointId,
            clientShiftId: input.clientShiftId,
            lat: point.lat,
            lng: point.lng,
            accuracy: point.accuracy,
            recordedAt: point.recordedAt,
            capturedAt: point.capturedAt,
            altitude: point.altitude,
            speed: point.speed,
            heading: point.heading,
            source: point.source,
            isMocked: point.isMocked,
            platform: point.platform,
            appVersion: point.appVersion,
            receivedAt: new Date()
          })),
          skipDuplicates: true
        });
      }

      const persisted = validIds.length
        ? await ctx.prisma.fieldLocation.findMany({
            where: {
              orgId,
              agentId,
              clientPointId: { in: validIds }
            },
            select: {
              clientPointId: true,
              lat: true,
              lng: true,
              accuracy: true,
              recordedAt: true,
              receivedAt: true
            }
          })
        : [];
      const persistedIds = new Set(
        persisted
          .map((point) => point.clientPointId)
          .filter((id): id is string => Boolean(id))
      );

      const accepted = toInsert
        .map((point) => point.clientPointId)
        .filter((id) => persistedIds.has(id));
      const acceptedSet = new Set(accepted);
      const duplicates = [
        ...new Set([
          ...existingIds,
          ...validIds.filter((id) => persistedIds.has(id) && !acceptedSet.has(id))
        ])
      ];

      if (input.deviceId) {
        const newestCapturedAt = validPoints.reduce<Date | null>((latest, point) => {
          const candidate = point.capturedAt ?? point.recordedAt;
          if (!latest || candidate.getTime() > latest.getTime()) return candidate;
          return latest;
        }, null);
        await ctx.prisma.fieldSyncStatus.upsert({
          where: {
            orgId_agentId_deviceId: {
              orgId,
              agentId,
              deviceId: input.deviceId
            }
          },
          create: {
            orgId,
            agentId,
            deviceId: input.deviceId,
            shiftId: shift.id,
            clientShiftId: input.clientShiftId,
            lastCapturedAt: newestCapturedAt,
            lastReceivedAt: new Date(),
            lastSyncAttemptAt: new Date()
          },
          update: {
            shiftId: shift.id,
            clientShiftId: input.clientShiftId,
            lastCapturedAt: newestCapturedAt ?? undefined,
            lastReceivedAt: new Date(),
            lastSyncAttemptAt: new Date(),
            lastSyncErrorCode: null
          }
        });
      }

      const broadcastCandidate =
        persisted
          .filter((point) => acceptedSet.has(point.clientPointId ?? ""))
          .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0] ??
        persisted.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];

      if (broadcastCandidate) {
        broadcastLocationUpdate(orgId, {
          orgId,
          agentId,
          shiftId: shift.id,
          lat: broadcastCandidate.lat,
          lng: broadcastCandidate.lng,
          accuracy: broadcastCandidate.accuracy,
          recordedAt: broadcastCandidate.recordedAt.toISOString(),
          receivedAt: broadcastCandidate.receivedAt.toISOString()
        });
      }

      return {
        serverShiftId: shift.id,
        clientShiftId: input.clientShiftId,
        accepted,
        duplicates,
        rejected,
        retryable: false
      };
    }),

  trail: perm(P.field.read)
    .input(
      z.object({
        shiftId: z.string().uuid(),
        simplifyTolerance: z.number().min(1).max(500).default(20),
        maxPoints: z.number().int().default(1200)
      })
    )
    .output(trailMetaSchema)
    .query(async ({ ctx, input }) => {
      const orgId = await resolveOrgIdForShiftRead(ctx, input.shiftId);
      const raw = await ctx.prisma.fieldLocation.findMany({
        where: {
          shiftId: input.shiftId,
          shift: { orgId }
        },
        select: { lat: true, lng: true, recordedAt: true },
        orderBy: { recordedAt: "asc" },
        take: 50_000
      });

      const truncated = raw.length >= 50_000;
      const rawCount = raw.length;
      if (rawCount === 0) {
        return {
          points: [],
          rawPointCount: 0,
          returnedPointCount: 0,
          reducedByTolerance: false,
          reducedByMaxPoints: false,
          totalDistanceMeters: 0,
          durationSeconds: null,
          startedAt: null,
          endedAt: null,
          simplifyTolerance: input.simplifyTolerance,
          maxPoints: input.maxPoints,
          truncated: false
        };
      }

      const simplified = rdp(raw, input.simplifyTolerance);
      const reducedByTolerance = simplified.length < rawCount;

      const final = downsample(simplified, input.maxPoints);
      const reducedByMaxPoints = final.length < simplified.length;

      const startedAt = raw[0].recordedAt;
      const endedAt = raw[raw.length - 1].recordedAt;
      const durationSeconds = Math.round(
        (endedAt.getTime() - startedAt.getTime()) / 1000
      );

      return {
        points: final.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          recordedAt: p.recordedAt.toISOString()
        })),
        rawPointCount: rawCount,
        returnedPointCount: final.length,
        reducedByTolerance,
        reducedByMaxPoints,
        totalDistanceMeters: totalDistanceMetres(final),
        durationSeconds,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        simplifyTolerance: input.simplifyTolerance,
        maxPoints: input.maxPoints,
        truncated
      };
    }),

  agentTrail: perm(P.field.read)
    .input(
      z.object({
        agentId: z.string().uuid(),
        date: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        simplifyTolerance: z.number().min(1).max(500).default(20),
        maxPoints: z.number().int().default(1200)
      })
    )
    .output(trailMetaSchema)
    .query(async ({ ctx, input }) => {
      assertCanReadAgent(ctx, input.agentId);
      const orgId = resolveReadOrgId(ctx);

      // Verify agent has activity in this org (User model has no direct orgId field;
      // org isolation is enforced via shift ownership)
      const agentInOrg = await ctx.prisma.shift.findFirst({
        where: { agentId: input.agentId, orgId },
        select: { id: true }
      });
      if (!agentInOrg) {
        throw apiError("FORBIDDEN", "Agent not in your organization");
      }

      let timeWhere: { gte?: Date; lt?: Date } = {};
      if (input.date) {
        timeWhere = {
          gte: new Date(`${input.date}T00:00:00.000Z`),
          lt: new Date(`${input.date}T23:59:59.999Z`)
        };
      } else {
        if (input.from) timeWhere.gte = new Date(input.from);
        if (input.to) timeWhere.lt = new Date(input.to);
      }

      const raw = await ctx.prisma.fieldLocation.findMany({
        where: {
          agentId: input.agentId,
          orgId,
          recordedAt: Object.keys(timeWhere).length > 0 ? timeWhere : undefined
        },
        select: { lat: true, lng: true, recordedAt: true },
        orderBy: { recordedAt: "asc" },
        take: 50_000
      });

      const truncated = raw.length >= 50_000;
      const rawCount = raw.length;
      if (rawCount === 0) {
        return {
          points: [],
          rawPointCount: 0,
          returnedPointCount: 0,
          reducedByTolerance: false,
          reducedByMaxPoints: false,
          totalDistanceMeters: 0,
          durationSeconds: null,
          startedAt: null,
          endedAt: null,
          simplifyTolerance: input.simplifyTolerance,
          maxPoints: input.maxPoints,
          truncated: false
        };
      }

      const simplified = rdp(raw, input.simplifyTolerance);
      const reducedByTolerance = simplified.length < rawCount;
      const final = downsample(simplified, input.maxPoints);
      const reducedByMaxPoints = final.length < simplified.length;

      const startedAt = raw[0].recordedAt;
      const endedAt = raw[raw.length - 1].recordedAt;

      return {
        points: final.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          recordedAt: p.recordedAt.toISOString()
        })),
        rawPointCount: rawCount,
        returnedPointCount: final.length,
        reducedByTolerance,
        reducedByMaxPoints,
        totalDistanceMeters: totalDistanceMetres(final),
        durationSeconds: Math.round(
          (endedAt.getTime() - startedAt.getTime()) / 1000
        ),
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        simplifyTolerance: input.simplifyTolerance,
        maxPoints: input.maxPoints,
        truncated
      };
    }),

  activeAgents: perm(P.field.read)
    .input(
      z.object({
        orgId: z.string().optional(),
        // L-13: cap result size; default 100, hard max 200
        limit: z.number().int().min(1).max(200).default(100)
      })
    )
    .output(
      z.object({
        agents: z.array(activeAgentSchema),
        hasMore: z.boolean()
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = resolveReadOrgId(ctx, input.orgId);

      const activeShifts = await ctx.prisma.shift.findMany({
        where: {
          status: "active",
          orgId: orgId ?? undefined,
          // M-06: hide deactivated users from active-agents views
          agent: { isActive: true }
        },
        select: {
          id: true,
          agentId: true,
          orgId: true,
          startedAt: true,
          agent: { select: { name: true } }
        },
        take: input.limit
      });

      if (activeShifts.length === 0) return { agents: [], hasMore: false };

      const shiftIds = activeShifts.map((s) => s.id);
      const agentIds = activeShifts.map((s) => s.agentId);

      // Batch-fetch all last locations per shift (one query)
      const allLocations = await ctx.prisma.fieldLocation.findMany({
        where: { shiftId: { in: shiftIds } },
        select: { shiftId: true, lat: true, lng: true, receivedAt: true },
        orderBy: { receivedAt: "desc" }
      });
      // Keep only the most recent per shiftId
      const lastLocByShift = new Map<
        string,
        { lat: number; lng: number; receivedAt: Date }
      >();
      for (const loc of allLocations) {
        if (!lastLocByShift.has(loc.shiftId)) {
          lastLocByShift.set(loc.shiftId, {
            lat: loc.lat,
            lng: loc.lng,
            receivedAt: loc.receivedAt
          });
        }
      }

      // Batch-fetch all sync statuses per agent (one query)
      const allSyncStatuses = await ctx.prisma.fieldSyncStatus.findMany({
        where: {
          orgId: orgId ?? undefined,
          agentId: { in: agentIds }
        },
        select: {
          agentId: true,
          deviceId: true,
          platform: true,
          appVersion: true,
          pendingQueueDepth: true,
          lastCapturedAt: true,
          lastReceivedAt: true,
          lastSyncAttemptAt: true,
          lastSyncErrorCode: true,
          updatedAt: true
        },
        orderBy: { updatedAt: "desc" }
      });
      // Keep only the most recent per agentId
      const healthByAgent = new Map<
        string,
        (typeof allSyncStatuses)[number]
      >();
      for (const status of allSyncStatuses) {
        if (!healthByAgent.has(status.agentId)) {
          healthByAgent.set(status.agentId, status);
        }
      }

      const agents = activeShifts.map((shift) => {
        const lastLoc = lastLocByShift.get(shift.id) ?? null;
        const health = healthByAgent.get(shift.agentId) ?? null;
        return {
          agentId: shift.agentId,
          agentName: shift.agent.name,
          shiftId: shift.id,
          shiftStartedAt: shift.startedAt.toISOString(),
          lastPingAt: lastLoc?.receivedAt.toISOString() ?? null,
          lat: lastLoc?.lat ?? null,
          lng: lastLoc?.lng ?? null,
          health: health
            ? {
                deviceId: health.deviceId,
                platform: health.platform,
                appVersion: health.appVersion,
                pendingQueueDepth: health.pendingQueueDepth,
                lastCapturedAt: health.lastCapturedAt?.toISOString() ?? null,
                lastReceivedAt: health.lastReceivedAt?.toISOString() ?? null,
                lastSyncAttemptAt:
                  health.lastSyncAttemptAt?.toISOString() ?? null,
                lastSyncErrorCode: health.lastSyncErrorCode
              }
            : null
        };
      });
      // L-13: hasMore is true when we hit the page cap exactly
      return { agents, hasMore: agents.length === input.limit };
    })
});
