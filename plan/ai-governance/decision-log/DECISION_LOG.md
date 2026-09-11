# Repository Decision Log

Use `DECISION_TEMPLATE.md` for new entries.

---

## DEC-20260822-001
- Decision ID: `DEC-20260822-001`
- Model: `claude-code`
- Branch/Commit: `master@90c93fb`
- Task: `Prepare the VPS deployment for a client compatibility-inspection handoff: wipe the demo DB down to minimal dummy data, deploy the service-portal SPA (previously never deployed), and rotate the 3 seed-user passwords to a fresh set for the client.`
- Decision: `Write a new backend/scripts/minimal-seed.ts (3 users / 1 warehouse / 1 outlet / 3 products, keeping roles/RBAC/chart-of-accounts/service-form-templates intact) instead of trimming demo-seed.ts in place; force-reset the platform DB and run the new script with auto-generated passwords (no plaintext committed — script reads ADMIN_PASSWORD/WAREHOUSE_PASSWORD/OUTLET_PASSWORD env vars, falls back to crypto-random + prints once). Deployed service-portal/ as its own static SPA on a brand-new subdomain (service.strideit.syrexbatteries.in) with its own Cloudflare A record + Certbot cert + nginx vhost, proxying /trpc/ to the same syrex-api backend on :3002, rather than serving it as a sub-path of the existing dashboard domain.`
- Rationale: `Operator explicitly wants "very very little" dummy data (not the full 14-user/8-product demo-seed) and a fresh, never-before-shared credential set, since this environment (still in development) is being shown directly to a client on the operator's own servers — not handed to the client's infrastructure, so no external compatibility target exists to design against. service-portal/ is a separate Vite React app (customer-facing complaint portal, ServiceUser JWT auth) that has source in the repo and even a stale committed dist/, but was never wired into nginx or given a domain — it needed a full first-time deploy, not a redeploy. A dedicated subdomain (matching the existing per-service-subdomain convention already used for admin.strideit.in, watchsync.strideit.in, etc.) was chosen over a /portal/ path on strideit.syrexbatteries.in per operator's explicit choice, keeping the two SPAs' routing/build configs fully independent.`
- Alternatives Considered:
  - `Trim demo-seed.ts's existing arrays in place` — rejected; demo-seed.ts is relied on by db:prepare, db:test:prepare and CI, so shrinking it in place would silently change what every other flow seeds. A parallel minimal-seed.ts sharing the same role/permission/upsert helpers was safer and matches the repo's existing pattern of multiple special-purpose seed scripts (seed-chart-of-accounts.ts, seed-service-form-templates.ts).
  - `Serve service-portal at /portal/ on the existing strideit.syrexbatteries.in domain` — rejected per operator's explicit preference for a new subdomain, even though it required a DNS record + new Certbot cert instead of reusing the existing cert.
  - `Hardcode the new admin/warehouse/outlet passwords into the seed script` — rejected; committing plaintext client-facing credentials to git history is a standing leak. Script reads them from env vars at run time with a random fallback instead.
- Scope:
  - `backend/scripts/minimal-seed.ts` (new), `backend/package.json` (new `db:seed:minimal` script) — committed to master as `90c93fb`
  - VPS (`45.195.159.172`, ssh alias `ssh_strideit`): Cloudflare DNS A record `service.strideit.syrexbatteries.in` → `45.195.159.172` (zone `syrexbatteries.in`, proxied: false, matching `strideit.syrexbatteries.in`'s existing record), `/etc/nginx/sites-available/service.strideit.syrexbatteries.in` (new vhost, root `service-portal/dist`, `/trpc/` proxied to `127.0.0.1:3002`), Certbot cert for the new subdomain, `service-portal/.env` (`VITE_API_URL=https://service.strideit.syrexbatteries.in`) + fresh `bun install` + `bun run build`, `platform` DB (force-reset + `db:seed:minimal` rerun with freshly generated passwords), ownership of `/srv/syrex-api` reset to `ashish:ashish` after root-run seed/build steps.
- Status: `completed`
- Completion Notes:
  - Done: `DNS record created and publicly resolving (confirmed via 1.1.1.1 and Cloudflare's own authoritative nameservers) within minutes; Certbot issued and nginx deployed the cert; service-portal built against the new domain and serving 200 with /trpc proxying correctly to the backend (confirmed via curl --resolve since the VPS's own two upstream resolvers hadn't picked up the new record symmetrically — one of its two configured resolvers, 134.209.144.72, was still returning nothing at last check, while 103.212.121.134 and Cloudflare's own NS resolved it fine; pre-existing resolver quirk unrelated to this change, does not affect real-world client access). DB force-reset + minimal-seed completed cleanly; verified with a real auth.login call using the new admin password. syrex-api restarted after the reset and /health + /ready both confirmed ok/ready.`
  - Not Done: `Did not create any ServiceUser (customer) accounts for the portal — RegisterPage.tsx implies self-registration is the intended flow, so none were pre-seeded. Did not add the new subdomain's DNS record or nginx vhost to any infra-as-code / documentation beyond this entry — if the VPS is rebuilt, this decision entry is the only record.`
  - Not Done: `New credentials (admin/warehouse/outlet, freshly generated by the seed script) were relayed to the operator directly in the chat response, not stored anywhere else — operator should move them to a password manager and rotate again once the client's inspection window is over, since this is a bare-minimum demo dataset, not intended to persist as a long-lived credential set.`
- Impact/Risk: `platform DB was force-reset a second time in as many days; safe because it was confirmed to hold only the previous session's demo-seed data with zero real usage. The new minimal dataset (3 users, 1 warehouse, 1 outlet, 3 products) is intentionally much smaller than demo-seed.ts's — anyone re-running db:prepare/db:seed (the full demo-seed) after this will silently overwrite/add back the larger dataset, which is expected but worth remembering if the client session needs to be reset back to minimal again (rerun db:reset + db:seed:minimal, not db:prepare).`
- Cleanup Required: `Same three items already flagged in DEC-20260821-001 (auto-deploy webhook, health-check monitoring, .env.example CI drift check) plus: decide whether service.strideit.syrexbatteries.in is a permanent fixture or should be torn down (DNS record + nginx vhost + cert) once the client's inspection is done, since it currently has zero authentication in front of it beyond the app's own login screens.`
- Dead Paths Introduced: `none`
- Conflicting Implementations: `none`
- Next Cleanup Owner: `n/a — flagged for whoever owns VPS ops / client relationship`
- Owner Timestamp: `claude-code @ 2026-08-22T04:45:00Z`

---

## DEC-20260821-001
- Decision ID: `DEC-20260821-001`
- Model: `claude-code`
- Branch/Commit: `master@4d9fe22`
- Task: `Check VPS deploy freshness and bring it to latest master; discovered a live production outage in the process.`
- Decision: `Restore syrex-api to production on a new port (3002) instead of reclaiming 3000, fix its DATABASE_URL (was pointed at a dead port 5434 — the real DB is on the native postgres cluster at 5432), force-reset+reseed the schema instead of hand-patching 48 commits of drift, and generate missing JWT_SECRET/SERVICE_PORTAL_JWT_SECRET. Reasons: port 3000 is now held by an unrelated hermes-gateway.service (Telegram/WhatsApp bridge, started 2026-08-10) that the operator wants left alone; the original syrex-api.service unit file no longer exists (deleted after the last stop on 2026-07-04) so it had to be recreated from scratch; the DB the app was configured to use didn't exist anymore; the data in the actual DB was confirmed pure demo-seed (0 audit logs, 0 field visits, exactly demo-seed.ts's canned record counts, all 10 users sharing one createdAt timestamp) so a schema-drift-by-drift hand patch (guessing FK values like a billing-profile id) was riskier than a clean reset+reseed.`
- Rationale: `strideit.syrexbatteries.in was serving stale code (commit 21bb80d, 2026-05-28 — 48 commits behind) AND syrex-api had not run at all since 2026-07-04: its systemd unit was gone, and nginx's proxy_pass :3000 for /health, /ready, /trpc, /api, /field, /field/live-stream was silently hitting hermes-gateway instead. The deploy webhook (port 9001) is also gone — port 9001 is now MinIO's console — so scripts/deploy.sh has not been auto-triggered since early July either. Once the process was runnable again, DATABASE_URL (port 5434, nothing listening) and two required JWT secrets (absent from backend/.env entirely) were also blocking — this .env had silently drifted out of sync with what the app now requires, independent of the outage.`
- Alternatives Considered:
  - `Stop/move hermes-gateway off 3000 and keep syrex-api on 3000` — rejected per operator instruction; hermes-gateway is presumed to be independently in use.
  - `Leave the outage as discovered and only report it` — rejected; operator asked to fix it once port choice was confirmed.
  - `Hand-patch each new required column prisma db push rejected on (uqc, hsnCode, gstRate, transferValue, then goods_receipts.sourceBillingProfileId FK, ...)` — rejected mid-way and replaced with force-reset+reseed once the data was confirmed to be non-production demo seed; guessing FK/business values column-by-column across 48 commits was strictly worse than reseeding from the canonical demo-seed.ts.
- Scope:
  - `scripts/deploy.sh` (health check now reads PORT from backend/.env instead of a hardcoded 3000; header comment corrected re: broken webhook auto-trigger) — committed to master as fa46cd7
  - VPS (`45.195.159.172`, ssh alias `ssh_strideit` in `~/.zshrc`, run as `ashish` with NOPASSWD sudo): `backend/.env` (PORT/API_PORT → 3002, DATABASE_URL port 5434 → 5432, added JWT_SECRET + SERVICE_PORTAL_JWT_SECRET), new `/etc/systemd/system/syrex-api.service`, `/etc/nginx/sites-available/strideit.syrexbatteries.in` proxy_pass targets → 127.0.0.1:3002, `platform` database on the native postgres cluster (schema force-reset + `bun run db:seed` rerun)
- Status: `completed`
- Completion Notes:
  - Done: `Recreated syrex-api.service (User=ashish, WorkingDirectory=/srv/syrex-api/backend, ExecStart=bun run src/index.ts), moved it to port 3002, repointed nginx, fixed DATABASE_URL, force-reset+reseeded the platform DB against current schema.prisma, generated fresh JWT secrets, redeployed latest master (fa46cd7) via scripts/deploy.sh — its own health-check step now passes automatically. Verified /health and /ready return ok through the public domain, confirmed hermes-gateway on :3000 is untouched and still healthy.`
  - Not Done: `Did not restore the auto-deploy webhook receiver (port 9001) — deploys are manual until that's rebuilt or Coolify is adopted for this service. Did not investigate/clean up the orphaned syrex-api:latest Docker image/container (unpublished, port 3001) — confirmed unrelated (it's a completely different Express/Clerk/Razorpay project sharing the "syrex-api" name, serving api.syrexbatteries.in via a separate Caddy+Cloudflare-Tunnel stack, DB named "syrex" not "platform"). Did not flip NODE_ENV to production (still "development" as found) — doing so requires DEFAULT_ORG_ID/CORS_ORIGINS/OBJECT_STORAGE_* that aren't set and was out of scope for a freshness fix.`
- Impact/Risk: `Production API was fully unreachable via its intended path (nginx → 3000 → hermes-gateway) for ~7 weeks before this fix; customer-facing /trpc, /api, /field routes should now work again. Port move to 3002 and the DB port fix are manual, undocumented-elsewhere config choices — if the VPS is rebuilt, this decision entry is the only record of why. The platform DB was force-reset: only demo-seed data existed (verified before resetting), so no real data was lost, but this means the DB no longer has whatever manual poking happened between 2026-06-06 and now (none detected).`
- Cleanup Required: `Rebuild an auto-deploy trigger (webhook receiver or self-hosted GitHub Actions runner) so this doesn't silently drift again; consider health-check monitoring/alerting on strideit.syrexbatteries.in/health so a future outage is caught immediately instead of after months; consider committing a non-secret .env.example diff check into CI so a required env var added to code doesn't silently break the next deploy the way JWT_SECRET/SERVICE_PORTAL_JWT_SECRET did here.`
- Dead Paths Introduced: `none`
- Conflicting Implementations: `none`
- Next Cleanup Owner: `n/a — flagged for whoever owns VPS ops`
- Owner Timestamp: `claude-code @ 2026-08-21T19:41:00Z`

## DEC-20260820-001
- Decision ID: `DEC-20260820-001`
- Model: `codex`
- Branch/Commit: `master@4d9fe22`
- Task: `Plan WhatsApp client handling and status updates for the service module`
- Decision: `Use the existing ServiceComplaint state and ServiceComplaintActivity history as the sole source of customer-visible service events. Plan a durable, provider-agnostic WhatsApp outbox and webhook adapter, delivered in stages: outbound status updates first, authenticated inbound self-service and human handoff second, and conversational complaint intake only after the first two stages are stable.`
- Rationale: `The service module already captures the complete complaint lifecycle and exposes a customer-safe portal projection. A new bot-specific complaint state or direct provider calls from service mutations would duplicate behaviour, lose retries/auditability, and risk inconsistent customer messages.`
- Alternatives Considered:
  - `Call the WhatsApp provider directly from complaint routes` rejected because a provider outage could fail or delay the primary service workflow and no durable retry/audit record would exist.
  - `Build a free-form AI complaint bot first` rejected because identity, consent, template approvals, human handoff, and deterministic status updates must be reliable before natural-language automation is introduced.
  - `Keep the portal as the only customer channel` rejected because WhatsApp can proactively close the status-update gap while the portal remains the detailed and authenticated source of truth.
- Scope:
  - `plan/WHATSAPP_SERVICE_BOT_PLAN.md`
  - `plan/ai-governance/decision-log/DECISION_PROTOCOL.md`
  - `plan/ai-governance/decision-log/DECISION_TEMPLATE.md`
  - `plan/ai-governance/decision-log/DECISION_LOG.md`
  - `Future implementation candidates: schema.prisma; backend/src/trpc/routes/service-shared.ts; backend/src/trpc/routes/service-assignments.ts; backend/src/trpc/routes/service-complaints.ts; backend/src/trpc/routes/service-tests.ts; backend/src/trpc/routes/service-warranty.ts; backend/src/trpc/routes/service-portal.ts; backend/src/index.ts; backend/src/infra/whatsapp/**; backend/src/cron/**; backend/src/app.ts; web/src/pages/dashboard/**`
- Status: `completed`
- Completion Notes:
  - Done: `Inspected the complaint lifecycle, activity/event writers, service portal projection, customer contact fields, existing notification model, runtime cron support, and provider integration gap.`
  - Done: `Created a phased implementation blueprint with canonical event mapping, data model, API/webhook boundaries, security/consent rules, rollout gates, and acceptance criteria.`
  - Not Done: `No schema, backend, portal, web, or provider integration code was changed. Provider onboarding, template copy approval, business policy review, and product-owner choices remain prerequisites to implementation.`
- Impact/Risk: `Documentation-only. The plan intentionally makes the existing service timeline canonical; a future implementation must preserve transactionality, idempotency, tenant isolation, customer consent, and portal authentication.`
- Cleanup Required: `Before implementation, confirm the WhatsApp Business account/provider, sender number, target countries/languages, support ownership and hours, opt-in source, template copy, and the product decision for third-party complainant notifications.`
- Dead Paths Introduced: `none`
- Conflicting Implementations: `none`
- Next Cleanup Owner: `service product and engineering owners before Phase 1`
- Owner Timestamp: `codex @ 2026-08-20T06:51:47Z`
