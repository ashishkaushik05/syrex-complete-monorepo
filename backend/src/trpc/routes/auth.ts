import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { apiError } from "../error";

const ACCESS_TOKEN_TTL_SECONDS = 900;
const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const RATE_LIMIT_WINDOW_MS = 1000 * 60 * 15;
const RATE_LIMIT_SWEEP_MS = 1000 * 60 * 5;
const RATE_LIMIT_STALE_MS = 1000 * 60 * 30;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set, ≥32 chars");
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const sessionTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  // Org the session operates under. Single-tenant: always DEFAULT_ORG_ID from env.
  orgId: z.string().nullable(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    userType: z.string(),
    roleId: z.string(),
    isFieldEnabled: z.boolean(),
    role: z.object({
      id: z.string(),
      name: z.string(),
      permissions: z.array(z.string())
    }),
    managedWarehouseId: z.string().nullable(),
    outletId: z.string().nullable()
  })
});

type JwtClaims = {
  sub: string;
  sid: string;
  exp: number;
};

type RateLimitBucket = {
  count: number;
  windowStart: number;
};

const loginRateLimit = new Map<string, RateLimitBucket>();
const refreshRateLimit = new Map<string, RateLimitBucket>();

const rateLimitSweeper = setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_STALE_MS;
  sweepRateLimitMap(loginRateLimit, cutoff);
  sweepRateLimitMap(refreshRateLimit, cutoff);
}, RATE_LIMIT_SWEEP_MS);
rateLimitSweeper.unref?.();

function sweepRateLimitMap(map: Map<string, RateLimitBucket>, cutoff: number) {
  for (const [key, entry] of map.entries()) {
    if (entry.windowStart < cutoff) {
      map.delete(key);
    }
  }
}

function enforceRateLimit(map: Map<string, RateLimitBucket>, key: string, max: number, nowMs = Date.now()) {
  const normalizedKey = key.trim().toLowerCase() || "unknown";
  const existing = map.get(normalizedKey);

  if (!existing || nowMs - existing.windowStart >= RATE_LIMIT_WINDOW_MS) {
    map.set(normalizedKey, { count: 1, windowStart: nowMs });
    return;
  }

  existing.count += 1;
  if (existing.count > max) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again later."
    });
  }
}

function getHmacKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function b64urlEncodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function b64urlDecodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function makeRandomBase64Url(bytes: number) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Buffer.from(buffer).toString("base64url");
}

export function makeRefreshToken(sessionId: string) {
  const secret = makeRandomBase64Url(32);
  return {
    secret,
    refreshToken: `${sessionId}.${secret}`
  };
}

export function parseRefreshToken(token: string): { sessionId: string; secret: string } | null {
  const firstDot = token.indexOf(".");
  if (firstDot <= 0 || firstDot === token.length - 1) {
    return null;
  }
  const sessionId = token.slice(0, firstDot);
  const secret = token.slice(firstDot + 1);
  if (!sessionId || !secret || secret.includes(".")) {
    return null;
  }
  return { sessionId, secret };
}

export async function hashRefreshSecret(secret: string) {
  return Bun.password.hash(secret, { algorithm: "bcrypt", cost: 12 });
}

async function verifyRefreshSecret(secret: string, hash: string) {
  try {
    return await Bun.password.verify(secret, hash);
  } catch {
    return false;
  }
}

export async function verifyPassword(storedHash: string, inputPassword: string) {
  try {
    return await Bun.password.verify(inputPassword, storedHash);
  } catch {
    return false;
  }
}

export async function signAccessToken(payload: { userId: string; sessionId: string }, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = b64urlEncodeJson({ alg: "HS256", typ: "JWT" });
  const claims: JwtClaims = {
    sub: payload.userId,
    sid: payload.sessionId,
    exp: nowSeconds + ACCESS_TOKEN_TTL_SECONDS
  };
  const body = b64urlEncodeJson(claims);
  const signingInput = `${header}.${body}`;
  const key = await getHmacKey();
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  const signature = Buffer.from(sigBytes).toString("base64url");
  return `${signingInput}.${signature}`;
}

export async function verifyAccessToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [headerB64, bodyB64, sigB64] = parts;
  const header = b64urlDecodeJson<{ alg: string; typ: string }>(headerB64);
  if (!header || header.alg !== "HS256" || header.typ !== "JWT") {
    return null;
  }

  const claims = b64urlDecodeJson<JwtClaims>(bodyB64);
  if (!claims || typeof claims.sub !== "string" || typeof claims.sid !== "string" || typeof claims.exp !== "number") {
    return null;
  }

  const signingInput = `${headerB64}.${bodyB64}`;
  const key = await getHmacKey();
  const isValid = await crypto.subtle.verify(
    "HMAC",
    key,
    Buffer.from(sigB64, "base64url"),
    new TextEncoder().encode(signingInput)
  );
  if (!isValid || claims.exp <= nowSeconds) {
    return null;
  }

  return {
    userId: claims.sub,
    sessionId: claims.sid,
    exp: claims.exp
  };
}

function refreshExpiryDate() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
}

function buildSessionUser(user: {
  id: string;
  email: string;
  name: string;
  userType: string;
  roleId: string;
  isFieldEnabled: boolean;
  role: { id: string; name: string; permissions: string[] };
  managedWarehouse: { id: string } | null;
  outlet: { id: string } | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    userType: user.userType,
    roleId: user.roleId,
    isFieldEnabled: user.isFieldEnabled,
    role: { id: user.role.id, name: user.role.name, permissions: user.role.permissions },
    managedWarehouseId: user.managedWarehouse?.id ?? null,
    outletId: user.outlet?.id ?? null
  };
}

async function loadUserForSession(ctx: any, userId: string) {
  return ctx.prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      userType: true,
      roleId: true,
      isFieldEnabled: true,
      role: { select: { id: true, name: true, permissions: true } },
      isActive: true,
      managedWarehouse: { select: { id: true } },
      outlet: { select: { id: true } }
    }
  });
}

export const authRouter = createTRPCRouter({
  login: publicProcedure.input(loginSchema).output(sessionTokenSchema).mutation(async ({ ctx, input }) => {
    enforceRateLimit(loginRateLimit, input.email, 10);

    const user = await ctx.prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        userType: true,
        roleId: true,
        isFieldEnabled: true,
        role: { select: { id: true, name: true, permissions: true } },
        isActive: true,
        managedWarehouse: { select: { id: true } },
        outlet: { select: { id: true } }
      }
    });

    if (!user || !user.isActive) {
      throw apiError("UNAUTHORIZED", "Invalid credentials");
    }

    const isValidPassword = await verifyPassword(user.passwordHash, input.password);
    if (!isValidPassword) {
      throw apiError("UNAUTHORIZED", "Invalid credentials");
    }

    const sessionId = crypto.randomUUID();
    const created = makeRefreshToken(sessionId);
    const refreshTokenHash = await hashRefreshSecret(created.secret);

    await ctx.prisma.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash,
        expiresAt: refreshExpiryDate()
      },
    });
    const accessToken = await signAccessToken({ userId: user.id, sessionId });

    return {
      accessToken,
      refreshToken: created.refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      orgId: process.env.DEFAULT_ORG_ID ?? null,
      user: buildSessionUser(user)
    };
  }),

  refresh: publicProcedure.input(refreshSchema).output(sessionTokenSchema).mutation(async ({ ctx, input }) => {
    enforceRateLimit(refreshRateLimit, ctx.sourceIp ?? "unknown", 20);

    const parsed = parseRefreshToken(input.refreshToken);
    if (!parsed) {
      throw apiError("UNAUTHORIZED", "Invalid refresh token");
    }

    const session = await ctx.prisma.authSession.findUnique({
      where: { id: parsed.sessionId },
      select: { id: true, userId: true, refreshTokenHash: true, expiresAt: true, revokedAt: true }
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw apiError("UNAUTHORIZED", "Invalid refresh token");
    }

    const isValidSecret = await verifyRefreshSecret(parsed.secret, session.refreshTokenHash);
    if (!isValidSecret) {
      throw apiError("UNAUTHORIZED", "Invalid refresh token");
    }

    const user = await loadUserForSession(ctx, session.userId);
    if (!user || !user.isActive) {
      throw apiError("UNAUTHORIZED", "Invalid refresh context");
    }

    const rotated = makeRefreshToken(session.id);
    const rotatedHash = await hashRefreshSecret(rotated.secret);

    await ctx.prisma.authSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: rotatedHash,
        expiresAt: refreshExpiryDate()
      }
    });

    const accessToken = await signAccessToken({ userId: user.id, sessionId: session.id });

    return {
      accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      orgId: process.env.DEFAULT_ORG_ID ?? null,
      user: buildSessionUser(user)
    };
  }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const sessionId = ctx.actor.sessionId;
    if (!sessionId) {
      throw apiError("UNAUTHORIZED", "Missing session context");
    }

    await ctx.prisma.authSession.updateMany({
      where: {
        id: sessionId,
        userId: ctx.actor.id!,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });
    return { ok: true };
  }),

  me: protectedProcedure
    .output(
      z.object({
        id: z.string(),
        email: z.string().email(),
        name: z.string(),
        userType: z.string(),
        roleId: z.string(),
        role: z.object({
          id: z.string(),
          name: z.string(),
          permissions: z.array(z.string())
        }),
        isActive: z.boolean(),
        isFieldEnabled: z.boolean(),
        managedWarehouseId: z.string().nullable(),
        outletId: z.string().nullable()
      })
    )
    .query(async ({ ctx }) => {
      const actorId = ctx.actor.id;
      if (!actorId) {
        throw apiError("UNAUTHORIZED", "Missing actor context");
      }
      const [user, outlet] = await Promise.all([
        ctx.prisma.user.findUnique({
          where: { id: actorId },
          select: {
            id: true,
            email: true,
            name: true,
            userType: true,
            roleId: true,
            role: { select: { id: true, name: true, permissions: true } },
            isActive: true,
            isFieldEnabled: true,
            managedWarehouse: { select: { id: true } }
          }
        }),
        ctx.prisma.outlet.findUnique({
          where: { userId: actorId },
          select: { id: true }
        })
      ]);
      if (!user) {
        throw apiError("NOT_FOUND", "User not found");
      }
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        userType: user.userType,
        roleId: user.roleId,
        role: { id: user.role.id, name: user.role.name, permissions: user.role.permissions },
        isActive: user.isActive,
        isFieldEnabled: user.isFieldEnabled,
        managedWarehouseId: user.managedWarehouse?.id ?? null,
        outletId: outlet?.id ?? null
      };
    })
});

export const __authTestUtils = {
  resetRateLimits() {
    loginRateLimit.clear();
    refreshRateLimit.clear();
  },
  enforceRateLimit,
  ACCESS_TOKEN_TTL_SECONDS
};
