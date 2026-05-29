# Batch 09 — Infrastructure, User Management & Hardening

> **Before you start:** append a `planned` entry to `plan/ai-governance/decision-log/DECISION_LOG.md` for this batch and update its status as you go. See `00-README.md`.
>
> **Run after Batch 01 and Batch 08** — needs JWT auth in place (CORS lockdown) and `UserInvitation` model removed (route deletion).

## Decision context
- **D-09:** Stay single-instance for SSE.
- **D-11:** Soft-delete everywhere — `users.remove` must soft-delete.
- **D-12:** Delete the invitations route file and remove from the router.

## Files you will touch
- `backend/src/app.ts` — security headers, CORS, body limit
- `backend/src/index.ts` — graceful shutdown timeout, DB startup check with retry
- `backend/src/infra/sse.ts` — memory leak fix + single-instance documentation
- `backend/src/infra/db/prisma.ts` — connection pool, log level, DATABASE_URL validation
- `backend/src/trpc/context.ts` — `x-request-id` hardening
- `backend/src/trpc/routes/users.ts` — soft-delete, changePassword current-password verification
- `backend/src/trpc/routes/invitations.ts` — DELETE the file
- Router index (`backend/src/trpc/router.ts` or equivalent) — remove invitations import + registration
- `backend/scripts/dev-seed.ts`, `backend/scripts/demo-seed.ts` — gate predictable passwords behind `NODE_ENV === "development"`
- `CLAUDE.md` — update the dev seed users table if password policy changes (only if you change `admin123` etc. for production seeds)

## Do NOT touch
`auth.ts` — Batch 01. Field routes — Batches 05/06. Service routes — Batch 04. `schema.prisma` — Batch 08.

---

## Issues to fix

### [H-08] Security headers + CORS
**File:** `backend/src/app.ts`

```typescript
app.use("*", async (c, next) => {
  await next();
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  c.header("X-Frame-Options", "DENY");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-XSS-Protection", "0");
});

import { cors } from "hono/cors";
app.use("/trpc/*", cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:5173"],
  // x-actor-id is DELIBERATELY OMITTED here. After Batch 01, this header is set
  // server-side from the verified JWT; clients must not send it.
  allowHeaders: ["Content-Type", "Authorization", "x-org-id", "x-request-id"],
  allowMethods: ["GET", "POST", "OPTIONS"],
  credentials: false,
}));
```

If a client in the field somehow still sends `x-actor-id`, Hono will strip it on the CORS preflight and the post-Batch-01 middleware will not trust it anyway. Defense in depth.

Add `ALLOWED_ORIGINS` to `.env.example` (comma-separated; web/mobile origin list).

### [H-09] Request body size limit
**File:** `backend/src/app.ts`

```typescript
import { bodyLimit } from "hono/body-limit";
app.use("/trpc/*", bodyLimit({ maxSize: 5 * 1024 * 1024 })); // 5 MB
```

### [C-15] SSE connection memory leak + single-instance doc
**File:** `backend/src/infra/sse.ts`

```typescript
// SSE connections are stored in-process. This implementation is intentionally
// single-instance only (per D-09). Do not scale this service horizontally without
// replacing this Map with a Redis pub/sub (or equivalent) implementation.

type SseEntry = {
  controller: ReadableStreamDefaultController<Uint8Array>;
  createdAt: number;
};

const connections = new Map<string, Set<SseEntry>>();

// Sweep connections older than 12 hours every 10 minutes.
// 12h matches the longest plausible field shift; healthy heartbeat-failure paths
// already evict earlier, so this is the last-resort cleanup.
setInterval(() => {
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  for (const [orgId, set] of connections) {
    for (const entry of set) {
      if (entry.createdAt < cutoff) {
        try { entry.controller.close(); } catch { /* already closed */ }
        set.delete(entry);
      }
    }
    if (set.size === 0) connections.delete(orgId);
  }
}, 10 * 60 * 1000);
```

Update `addSseConnection` to take a `controller` and wrap into an `SseEntry { controller, createdAt: Date.now() }`. Update `removeSseConnection` to accept the entry (or the controller — look it up).
Update the SSE route in `app.ts` to pass/track the entry.

### [C-19] DB pool, log level, DATABASE_URL validation
**File:** `backend/src/infra/db/prisma.ts`

```typescript
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const poolSize = process.env.DB_POOL_SIZE ?? "20";
const urlWithPool = `${process.env.DATABASE_URL}${
  process.env.DATABASE_URL.includes("?") ? "&" : "?"
}connection_limit=${poolSize}&pool_timeout=30`;

export const prisma = new PrismaClient({
  datasources: { db: { url: urlWithPool } },
  log: process.env.LOG_QUERIES === "true" ? ["query", "warn", "error"] : ["warn", "error"],
});
```
Add `DB_POOL_SIZE` and `LOG_QUERIES` to `.env.example`.
**L-03** is resolved by this change.

### [M-14] Graceful shutdown timeout
**File:** `backend/src/index.ts`

```typescript
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? "30000", 10);
```
Apply in the SIGTERM/SIGINT handler.

### [M-15] DB health check on startup with retry
**File:** `backend/src/index.ts`

```typescript
let connected = false;
for (let i = 0; i < 3; i++) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    connected = true;
    break;
  } catch (err) {
    console.warn(`DB health check failed (attempt ${i + 1}/3):`, err);
    if (i < 2) await new Promise((r) => setTimeout(r, 1000));
  }
}
if (!connected) {
  console.error("Database unreachable after 3 attempts — exiting");
  process.exit(1);
}
console.log("Database connection verified");
```
This avoids hard-killing `bun dev` on a transient hiccup.

### [L-02] `x-request-id` hardening
**File:** `backend/src/trpc/context.ts`

```typescript
const serverRequestId = crypto.randomUUID();
const clientRequestId = readHeader(c, "x-request-id"); // for log correlation only

return {
  requestId: serverRequestId,
  // ...
};
```
In `logger.ts` (or wherever request entries are written), include `clientRequestId` as a side channel — but never use it as `requestId` in error responses.

### [H-04] `users.remove` — soft-delete + guards
**File:** `backend/src/trpc/routes/users.ts:236-258`

```typescript
if (input.id === ctx.actor.id) {
  throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete your own account" });
}

// Block removal of the last active super-admin.
// Role.permissions is String[] (verified in schema.prisma:178), so `has: "*"` is the correct query.
const adminCount = await ctx.prisma.user.count({
  where: { isActive: true, role: { permissions: { has: SUPER_ADMIN_PERMISSION } } },
});
const target = await ctx.prisma.user.findUnique({
  where: { id: input.id },
  select: { isActive: true, role: { select: { permissions: true } } },
});
if (
  target?.isActive &&
  target.role.permissions.includes(SUPER_ADMIN_PERMISSION) &&
  adminCount <= 1
) {
  throw new TRPCError({ code: "CONFLICT", message: "Cannot remove the last active super-admin" });
}

await ctx.prisma.$transaction(async (tx) => {
  await tx.user.update({ where: { id: input.id }, data: { isActive: false } });
  await tx.authSession.updateMany({
    where: { userId: input.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
});
```

### [H-03] `users.changePassword` — require current password for self
**File:** `backend/src/trpc/routes/users.ts:219-234`

Verified shape: `changePasswordSchema` already takes `{ id: string().uuid(), ... }` and is guarded by `perm(P.users.write)`. The admin path (changing someone else's password) is intended. Add the self-service current-password verification:

```typescript
const changePasswordSchema = z.object({
  id: z.string().uuid(),
  newPassword: z.string().min(8),
  currentPassword: z.string().optional(),
});

// inside the mutation:
if (input.id === ctx.actor.id) {
  if (!input.currentPassword) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "currentPassword required when changing your own password" });
  }
  const me = await ctx.prisma.user.findUniqueOrThrow({
    where: { id: input.id },
    select: { passwordHash: true },
  });
  const ok = await Bun.password.verify(input.currentPassword, me.passwordHash);
  if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "Current password is incorrect" });
}
// Admin changing another user's password — no current-password check; rely on perm.
// Log the event so admin resets are auditable.
```

### [D-12] Delete invitations route
1. Delete `backend/src/trpc/routes/invitations.ts`.
2. Remove the import + `invitations` key from the tRPC router merge (`router.ts`).
3. Re-run `grep -rn "invitations" backend/` and resolve every remaining hit (or hand each to the appropriate batch if owned elsewhere).

### [L-01] Seed script password hygiene
**Files:** `backend/scripts/dev-seed.ts`, `backend/scripts/demo-seed.ts`

```typescript
const isDev = process.env.NODE_ENV !== "production";
const password = isDev ? "admin123" : crypto.randomUUID().slice(0, 16); // analogous per-user
const hash = await Bun.password.hash(password, { algorithm: "bcrypt", cost: 12 });
// ... use hash when creating users
if (isDev) {
  console.log(`Seeded ${email} with password ${password}`);
} else {
  console.log(`Seeded ${email} — credentials emitted via secrets store, not stdout`);
}
```
`demo-seed.ts` must NOT print credentials JSON in production.
Update `CLAUDE.md` only if you change the dev passwords (you should not — keep `admin123`/`outlet123`/`warehouse123` for dev to match documented expectations).

---

## Validation checklist
- [ ] `bun run typecheck` passes
- [ ] `GET /trpc/auth.me` response includes `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`
- [ ] CORS preflight does NOT advertise `x-actor-id` as an allowed header
- [ ] POST body over 5 MB returns 413
- [ ] Server exits with error if `DATABASE_URL` is not set
- [ ] Server retries DB connection 3× before exiting on startup
- [ ] `users.remove` on a valid user sets `isActive: false` and revokes all sessions
- [ ] `users.remove` on own account returns `BAD_REQUEST`
- [ ] `users.remove` on the last active super-admin returns `CONFLICT`
- [ ] `users.changePassword` on own account without `currentPassword` returns `BAD_REQUEST`
- [ ] `users.changePassword` on own account with wrong `currentPassword` returns `FORBIDDEN`
- [ ] `invitations.*` routes 404 (route file deleted, router updated)
- [ ] `grep -rn "invitations" backend/` returns zero hits
- [ ] SSE stale-connection sweep logged every 10 minutes; 12h-old connections evicted
- [ ] Dev seed still produces `admin@syrex.local / admin123` etc. with bcrypt-hashed `passwordHash`
- [ ] Regression tests cover H-03 (self-service current-password), H-04 (last-admin guard), L-02 (x-request-id ignored from client)
