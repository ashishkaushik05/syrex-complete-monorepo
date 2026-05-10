import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { broadcastLocationUpdate } from "../../infra/sse";

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

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const locationPointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number(),
  recordedAt: z.string().datetime()
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
  maxPoints: z.number()
});

const activeAgentSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  shiftId: z.string(),
  shiftStartedAt: z.string(),
  lastPingAt: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable()
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const fieldLocationRouter = createTRPCRouter({
  ingest: perm("field:write")
    .input(
      z.object({
        locations: z.array(locationPointSchema).min(1).max(500)
      })
    )
    .output(z.object({ accepted: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const agentId = ctx.actor.id!;
      const orgId = ctx.actor.orgId;

      const shift = await ctx.prisma.shift.findFirst({
        where: { agentId, status: "active" },
        select: { id: true, orgId: true }
      });
      if (!shift) return { accepted: 0 };

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

      // Fan out last point to SSE connections
      const last = input.locations[input.locations.length - 1];
      broadcastLocationUpdate(shift.orgId, {
        agentId,
        shiftId: shift.id,
        lat: last.lat,
        lng: last.lng,
        accuracy: last.accuracy,
        recordedAt: last.recordedAt,
        receivedAt: new Date().toISOString()
      });
      if (orgId && orgId !== shift.orgId) {
        broadcastLocationUpdate(orgId, {
          agentId,
          shiftId: shift.id,
          lat: last.lat,
          lng: last.lng
        });
      }

      return { accepted: data.length };
    }),

  trail: perm("field:read")
    .input(
      z.object({
        shiftId: z.string().uuid(),
        simplifyTolerance: z.number().default(20),
        maxPoints: z.number().int().default(1200)
      })
    )
    .output(trailMetaSchema)
    .query(async ({ ctx, input }) => {
      const raw = await ctx.prisma.fieldLocation.findMany({
        where: { shiftId: input.shiftId },
        select: { lat: true, lng: true, recordedAt: true },
        orderBy: { recordedAt: "asc" }
      });

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
          maxPoints: input.maxPoints
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
        maxPoints: input.maxPoints
      };
    }),

  agentTrail: perm("field:read")
    .input(
      z.object({
        agentId: z.string().uuid(),
        date: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        simplifyTolerance: z.number().default(20),
        maxPoints: z.number().int().default(1200)
      })
    )
    .output(trailMetaSchema)
    .query(async ({ ctx, input }) => {
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
          recordedAt: Object.keys(timeWhere).length > 0 ? timeWhere : undefined
        },
        select: { lat: true, lng: true, recordedAt: true },
        orderBy: { recordedAt: "asc" }
      });

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
          maxPoints: input.maxPoints
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
        maxPoints: input.maxPoints
      };
    }),

  activeAgents: perm("field:read")
    .input(z.object({ orgId: z.string().optional() }))
    .output(z.array(activeAgentSchema))
    .query(async ({ ctx, input }) => {
      const orgId = input.orgId ?? ctx.actor.orgId;

      const activeShifts = await ctx.prisma.shift.findMany({
        where: {
          status: "active",
          orgId: orgId ?? undefined
        },
        select: {
          id: true,
          agentId: true,
          orgId: true,
          startedAt: true,
          agent: { select: { name: true } }
        }
      });

      const results = await Promise.all(
        activeShifts.map(async (shift) => {
          const lastLoc = await ctx.prisma.fieldLocation.findFirst({
            where: { shiftId: shift.id },
            select: { lat: true, lng: true, receivedAt: true },
            orderBy: { receivedAt: "desc" }
          });
          return {
            agentId: shift.agentId,
            agentName: shift.agent.name,
            shiftId: shift.id,
            shiftStartedAt: shift.startedAt.toISOString(),
            lastPingAt: lastLoc?.receivedAt.toISOString() ?? null,
            lat: lastLoc?.lat ?? null,
            lng: lastLoc?.lng ?? null
          };
        })
      );

      return results;
    })
});
