# Batch 01 — JWT Auth Migration & Auth Hardening

> **Before you start:** append a `planned` entry to `plan/ai-governance/decision-log/DECISION_LOG.md` for this batch and update its status as you go. See `00-README.md`.

## Decision context
- **D-01:** Remove `x-actor-id` trust entirely from external requests. All callers must use Bearer tokens. Cron jobs run in-process via Prisma directly (no HTTP) so are unaffected. Machine-to-machine callers continue to use the existing `x-service-client-id` + `x-service-client-secret` pair.
- **D-02:** Replace opaque DB tokens with JWTs. Access token: 15 min. Refresh token: 30 days, stored as bcrypt hash in DB.
- **D-03:** No absolute session TTL. Refresh can extend indefinitely (the 15-min access window is the bound).
- **D-14 (new):** Refresh-token format is `<sessionId>.<secret>`, where `<secret>` is `base64url(crypto.getRandomValues(new Uint8Array(32)))`. Lookup is by `sessionId` (indexed PK), then `Bun.password.verify(secret, refreshTokenHash)`. This avoids the bcrypt-salt-breaks-findUnique problem.

## Files you will touch
- `backend/src/app.ts`
- `backend/src/trpc/trpc.ts` (C-17 audit log only — minimal change)
- `backend/src/trpc/context.ts`
- `backend/src/trpc/routes/auth.ts`
- `backend/src/trpc/routes/service-integrations.ts` (hash consistency only)
- `backend/scripts/dev-seed.ts`, `backend/scripts/demo-seed.ts` (re-hash all seeded passwords with bcrypt)
- `schema.prisma` — `AuthSession` model only (rename `refreshToken` → `refreshTokenHash`, drop `accessToken`)
- `backend/.env.example` — add `JWT_SECRET`

## Do NOT touch
Everything else. Other batches own all other files.

## Deploy impact (call out in the decision-log entry)
- **All existing sessions are invalidated** by this migration (old `accessToken`/`refreshToken` rows become useless). Every web and mobile user must log in again. There is no way to migrate existing tokens since old refresh tokens are plaintext-stored and have no `sessionId` prefix.

---

## Issues to fix

### [C-01] Remove `x-actor-id` trust in tRPC middleware
**File:** `backend/src/app.ts:27-43`

Current code sets `x-actor-id` only if it is not already present in the request. Any external client can send `x-actor-id: <uuid>` and bypass auth.

**Fix:**
- Delete the `if (!existingActorId)` short-circuit entirely.
- The middleware must ALWAYS extract the JWT from `Authorization: Bearer <jwt>` and verify it.
- On verification success: load `AuthSession` by `sessionId` from the JWT payload, check `revokedAt IS NULL` and `expiresAt > now()`. Set `x-actor-id` on the **mutated** request headers from `AuthSession.userId` — never from the raw inbound header.
- On any failure: do not set `x-actor-id`. Protected procedures will reject the request normally.
- In `context.ts`: continue reading `x-actor-id` from headers — the middleware-set value is what reaches the context builder. Add a comment that documents this invariant.

### [C-02] Same `x-actor-id` bypass on SSE route
**File:** `backend/src/app.ts:57-71`

The SSE route has its own inline Bearer/header check that trusts `x-actor-id` directly.

**Fix:**
- Extract the Bearer→actor resolution into a shared helper: `resolveActorFromBearer(c: Context): Promise<{ userId: string; sessionId: string } | null>`.
- Call this helper in both the tRPC middleware (C-01) and the SSE route. Neither code path reads `x-actor-id` from the raw request.

### [C-03] Switch to JWT — 15 min access, 30 day refresh
**Files:** `backend/src/trpc/routes/auth.ts`, `schema.prisma` (AuthSession only)

**Current problems:**
- `tokenExpiryDate()` returns 30 days for both tokens.
- `expiresIn: 900` (15 min) is returned to clients but the server accepts the access token for 30 days.
- `revokedAt` is set on logout but never checked at request time (today's middleware looks up by `accessToken` and re-checks, but the auth.refresh path resets `revokedAt: null` — see new bug below).

**Schema changes (`AuthSession`):**
```prisma
model AuthSession {
  id               String    @id @default(uuid())
  userId           String
  refreshTokenHash String    // bcrypt of the <secret> portion of the refresh token
  expiresAt        DateTime  // refresh-token expiry: now() + 30d, reset on each rotation
  revokedAt        DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([expiresAt])
  @@map("auth_sessions")
}
```
Drop `accessToken` and `refreshToken` columns. Add `refreshTokenHash`. Do **not** add `absoluteIssuedAt` — D-03 says no absolute TTL.

**Implementation:**
1. Add JWT library. Bun ships `Bun.password` for bcrypt; for JWT use `jose` (zero-dep, edge-safe) or `jsonwebtoken`. Pick `jose` — actively maintained, no node-core deps.
2. `JWT_SECRET` env var required. Validate at module load in `auth.ts`: `if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET must be set, ≥32 chars")`. Add to `.env.example`.
3. **Access token:** signed JWT (`HS256`), payload `{ sub: userId, sid: sessionId }`, `exp = now + 900s`. Not stored in DB.
4. **Refresh token:** opaque string of the form `${session.id}.${secret}` where `secret = base64url(32 random bytes)`. Only the bcrypt hash of `secret` is stored, in `AuthSession.refreshTokenHash`. The full refresh token is returned to the client exactly once (on login and on each rotation).
5. **Auth middleware (`app.ts`)** — implemented inside `resolveActorFromBearer`:
   - Read `Authorization: Bearer <jwt>` header.
   - Verify JWT signature (`jose.jwtVerify`). On failure → return `null`.
   - Load `AuthSession` by `sid` from payload. If `revokedAt !== null` or `expiresAt <= now()` → return `null`.
   - Return `{ userId, sessionId }`.
6. **`auth.login`:**
   - Verify password (post-H-05 fix).
   - Create `AuthSession` row with `refreshTokenHash = bcrypt(secret)`, `expiresAt = now + 30d`.
   - Sign JWT with `sid = session.id`.
   - Return `{ accessToken: <jwt>, refreshToken: "<sessionId>.<secret>", expiresIn: 900, user }`.
7. **`auth.refresh`:**
   - Parse `refreshToken` as `<sessionId>.<secret>`. If split fails → `UNAUTHORIZED`.
   - `findUnique` `AuthSession` by `sessionId`. If missing → `UNAUTHORIZED`.
   - **If `revokedAt !== null` → `UNAUTHORIZED`. DO NOT set `revokedAt: null` to "revive" the session.** (Fixes the rotation bug below.)
   - If `expiresAt <= now()` → `UNAUTHORIZED`.
   - `Bun.password.verify(secret, refreshTokenHash)`. On failure → `UNAUTHORIZED`.
   - Rotate: generate new `secret`, update `refreshTokenHash`, set `expiresAt = now + 30d`, keep `revokedAt = null`. Issue new JWT.
   - Return new pair.
8. **`auth.logout`:** set `revokedAt = now()` on the session. JWT remains valid until its 15-min expiry — acceptable for short-lived access tokens.
9. Response shape unchanged: `{ accessToken, refreshToken, expiresIn: 900, user }`.

### [C-03-bis] Rotation must not revive revoked sessions
**File:** `backend/src/trpc/routes/auth.ts:140-148`

Today's `auth.refresh` does `data: { ..., revokedAt: null }` — a stolen refresh token can re-activate a logged-out session. The implementation in C-03 above already prohibits this. Call it out in the decision-log entry explicitly.

### [C-17] Service-client audit log must not record spoofable actor
**File:** `backend/src/trpc/trpc.ts:122-136`

Once C-01 lands, `ctx.actor.id` is null for service-credential calls (machine clients don't have a user actor). The current audit-log create uses `actorId: ctx.actor.id` which would now always be null.

**Fix:**
- Change the audit-log create to `actorId: null` explicitly (and add a comment: "machine-client auth has no user actor; use serviceClientId for attribution").
- The `serviceClientId` is already on the parent record, so the audit row remains attributable.

### [H-05] Remove plaintext password fallback
**File:** `backend/src/trpc/routes/auth.ts:43-48`

**Fix:**
- Delete the `return storedHash === inputPassword` branch.
- If `Bun.password.verify` throws or returns false, login fails.
- Any user with a non-hashed password must be reset by an admin. The seed scripts must be updated to write bcrypt hashes (see dev-seed coordination below).

### [H-07] Rate limiting on login and refresh
**File:** `backend/src/trpc/routes/auth.ts`

**Fix:**
- In-memory sliding-window rate limiter (single-instance per D-09).
- `auth.login`: max 10 attempts per email per 15 min → throw `TOO_MANY_REQUESTS`.
- `auth.refresh`: max 20 per source IP per 15 min. Read IP from `c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"`.
- `Map<string, { count: number, windowStart: number }>`; sweep entries with `windowStart` older than 30 min every 5 min via `setInterval`.

### [M-08] Consistent bcrypt params for service client secrets
**File:** `backend/src/trpc/routes/service-integrations.ts:86`

**Fix:** change `Bun.password.hash(secret)` to `Bun.password.hash(secret, { algorithm: "bcrypt", cost: 12 })`. One line.

### Dev-seed coordination (required, do not skip)
**Files:** `backend/scripts/dev-seed.ts`, `backend/scripts/demo-seed.ts`

After H-05, login with an unhashed password is impossible. The current seeds may write plaintext.

**Fix:**
- In both scripts, replace any plaintext write with `await Bun.password.hash(plaintext, { algorithm: "bcrypt", cost: 12 })`.
- Keep the same plaintext **values** (`admin123`, `outlet123`, `warehouse123` — documented in `CLAUDE.md`) so dev login still works. Batch 09 will gate predictable passwords behind `NODE_ENV === "development"`.
- After this change, run `bun run db:prepare` to verify dev users can log in.

---

## Validation checklist
- [ ] `bun run typecheck` passes
- [ ] `auth.login` returns a JWT-shaped access token (3 dot-separated base64url segments)
- [ ] `auth.login` returns a refresh token shaped `<uuid>.<base64url>`
- [ ] `auth.refresh` rotates the refresh token AND issues a new JWT
- [ ] `auth.refresh` on a revoked session returns `UNAUTHORIZED` and does NOT re-activate the session
- [ ] `auth.logout` sets `revokedAt`; subsequent requests with the same JWT are accepted until 15-min expiry — by design
- [ ] Sending `x-actor-id: <any-uuid>` with no Bearer is treated as unauthenticated
- [ ] SSE endpoint rejects requests without a valid Bearer JWT
- [ ] Service-client audit log writes `actorId: null` for machine-client calls
- [ ] Dev login with `admin@syrex.local / admin123` succeeds after re-seeding
- [ ] 11th failed login on the same email within 15 min returns `TOO_MANY_REQUESTS`
- [ ] At least one vitest/bun-test regression test exists for C-01, C-03, C-03-bis, H-05, H-07
