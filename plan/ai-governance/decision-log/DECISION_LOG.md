# Repository Decision Log

Use `DECISION_TEMPLATE.md` for every new entry.

---

## DEC-20260508-001
- Decision ID: `DEC-20260508-001`
- Model: `codex`
- Branch/Commit: `main@initial`
- Task: `Create AI governance system prompts + decision protocol`
- Decision: `Introduce standardized prompts and shared decision log protocol in plan/ai-governance`
- Rationale: `Multiple models will touch this codebase; shared traceability prevents mixed partial implementations and dead paths.`
- Alternatives Considered:
  - `Keep informal notes in PR text only` rejected because history becomes fragmented.
  - `Separate format per model` rejected because cross-model auditing becomes hard.
- Scope:
  - `plan/ai-governance/**`
- Status: `completed`
- Completion Notes:
  - Done: `Created protocol, template, and model-specific prompts.`
  - Not Done: `JSONL automation not yet added.`
- Impact/Risk:
  - `Slight process overhead for each coding task.`
- Cleanup Required:
  - `Add optional CI check that enforces decision log update for code changes.`
- Dead Paths Introduced: `none`
- Conflicting Implementations: `none`
- Next Cleanup Owner: `repo maintainers + next automation task`
- Owner Timestamp: `codex @ 2026-05-08T00:00:00Z`
- Follow-up Notes:
  - `Replace Branch/Commit placeholder with real git metadata when making future entries.`

---

## DEC-20260508-002
- Decision ID: `DEC-20260508-002`
- Model: `codex`
- Branch/Commit: `main@working`
- Task: `Implement real instruction files for Claude Code, Copilot CLI, Codex, and Gemini`
- Decision: `Use native repo-level files each CLI loads automatically (AGENTS.md, CLAUDE.md, GEMINI.md, .github/copilot-instructions.md)`
- Rationale: `This gives immediate enforcement in-tool, rather than keeping prompts only in planning docs.`
- Alternatives Considered:
  - `Keep prompts only under plan/` rejected because tools may not auto-load them.
  - `Use one file only` rejected because each CLI has its own preferred discovery mechanism.
- Scope:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `GEMINI.md`
  - `.github/copilot-instructions.md`
  - `plan/ai-governance/SETUP_VERIFIED.md`
- Status: `completed`
- Completion Notes:
  - Done: `Created and populated all runtime instruction files with shared decision-log requirements.`
  - Not Done: `No CI enforcement yet.`
- Impact/Risk:
  - `Slight chance of instruction drift across files if only one is edited later.`
- Cleanup Required:
  - `Add CI check to detect missing decision-log updates for code changes.`
- Dead Paths Introduced: `none`
- Conflicting Implementations: `none`
- Next Cleanup Owner: `repo maintainers`
- Owner Timestamp: `codex @ 2026-05-08T00:00:00Z`
- Follow-up Notes:
  - `Web validation captured in plan/ai-governance/SETUP_VERIFIED.md.`

---

## DEC-20260508-003
- Decision ID: `DEC-20260508-003`
- Model: `copilot-cli`
- Branch/Commit: `not-a-git-repo@working-tree`
- Task: `Define phased backend implementation plan with frontend sync gates`
- Decision: `Adopt a 7-phase backend rollout (Phase 0-6) with mandatory frontend stop-point alignment at the end of every phase and document explicit sync rules in the API plan.`
- Rationale: `Backend and frontend were at risk of drifting if implementation continued without contract freeze checkpoints. Phase gates force contract stabilization and predictable integration windows.`
- Alternatives Considered:
  - `Proceed module-by-module without sync gates` rejected because frontend would repeatedly rework against shifting endpoints.
  - `Single big-bang integration at end` rejected because defects and contract mismatches would be discovered too late.
- Scope:
  - `plan/api_development_plan.md`
  - `plan/ai-governance/decision-log/DECISION_LOG.md`
- Status: `completed`
- Completion Notes:
  - Done: `Replaced milestone-only rollout with phased plan including explicit frontend alignment stop points and added frontend/backend sync rules.`
  - Not Done: `No code implementation started yet; this decision only governs execution plan and coordination checkpoints.`
- Impact/Risk:
  - `Adds process gates that may slow raw backend velocity but reduces integration churn and rework.`
  - `Requires strict discipline to keep phase contracts frozen once handed to frontend.`
- Cleanup Required:
  - `When implementation starts, open a new decision entry per phase execution chunk and update final status with actual outcomes.`
- Dead Paths Introduced: `none`
- Conflicting Implementations: `none`
- Next Cleanup Owner: `copilot-cli during implementation kickoff`
- Owner Timestamp: `copilot-cli @ 2026-05-08T10:30:51Z`
- Follow-up Notes:
  - `Phase 0 should be executed first to lock shared API contract conventions before auth/master-data implementation.`

---

## DEC-20260508-004
- Decision ID: `DEC-20260508-004`
- Model: `codex`
- Branch/Commit: `master@7565941`
- Task: `Implement Phase 0 foundation scaffold and contract conventions`
- Decision: `Create a backend foundation using Bun + Hono + tRPC + Zod + Prisma with shared error/context and health probes.`
- Rationale: `Phase 0 requires a frozen baseline API surface and conventions before module work starts.`
- Alternatives Considered:
  - `Start directly with module APIs` rejected because cross-cutting contract conventions would drift.
  - `Skip Prisma wiring until Phase 1` rejected because database readiness is part of foundation reliability.
- Scope:
  - `backend/package.json`
  - `backend/tsconfig.json`
  - `backend/.env.example`
  - `backend/src/index.ts`
  - `backend/src/app.ts`
  - `backend/src/config/env.ts`
  - `backend/src/infra/logger.ts`
  - `backend/src/infra/db/prisma.ts`
  - `backend/src/trpc/context.ts`
  - `backend/src/trpc/trpc.ts`
  - `backend/src/trpc/error.ts`
  - `backend/src/trpc/router.ts`
  - `backend/src/trpc/routes/system.ts`
  - `plan/ai-governance/decision-log/DECISION_LOG.md`
- Status: `completed`
- Completion Notes:
  - Done: `Implemented backend Phase 0 scaffold with Bun/Hono server, /health and /ready endpoints, tRPC router bootstrap, request context (requestId/actor/org placeholders), shared error taxonomy mapping, contract-conventions procedure (pagination/decimal/timezone/error codes), env validation, logger, Prisma singleton wiring, and dependency/typecheck setup.`
  - Not Done: `No feature-module routes yet (expected for Phase 0); DATABASE_URL-backed runtime readiness was not executed against a live database in this pass.`
- Impact/Risk:
  - `Initial conventions may need adjustment when first feature modules integrate.`
  - `Prisma client generation depends on environment/database setup.`
- Cleanup Required:
  - `Run Prisma generation/migration and perform live /ready smoke test once database environment is provisioned.`
- Dead Paths Introduced: `none`
- Conflicting Implementations: `none`
- Next Cleanup Owner: `codex or next implementing model during Phase 1 kickoff`
- Owner Timestamp: `codex @ 2026-05-08T10:37:21Z`
- Follow-up Notes:
  - `Will update same entry to final status after implementation and verification.`
  - `Verification performed: bun install + strict typecheck passed in backend workspace.`

---

## DEC-20260508-005
- Decision ID: `DEC-20260508-005`
- Model: `codex`
- Branch/Commit: `master@7565941`
- Task: `Finalize Phase 0 frontend alignment gate artifacts`
- Decision: `Add a dedicated Phase 0 contract freeze artifact with frozen procedure list, request/response snapshots, and error shape conventions.`
- Rationale: `Phase 0 is only complete when frontend has stable contract artifacts, not just server scaffolding.`
- Alternatives Considered:
  - `Rely on source code only` rejected because it increases integration ambiguity for frontend.
  - `Defer artifacts to Phase 1` rejected because phase gate criteria require these outputs now.
- Scope:
  - `plan/phase-gates/PHASE_0_CONTRACT_FREEZE.md`
  - `plan/phase-gates/snapshots/phase0_system_conventions.json`
  - `plan/ai-governance/decision-log/DECISION_LOG.md`
- Status: `completed`
- Completion Notes:
  - Done: `Created Phase 0 contract freeze artifact with frozen procedure list, endpoint payloads, tRPC error-shape requirement, pagination contract, datetime/decimal conventions, and a JSON response snapshot for system.conventions. Re-verified backend typecheck after artifacts were added.`
  - Not Done: `Live runtime smoke call to /health,/ready,system.conventions is not executed in this pass because no DB/runtime env was started.`
- Impact/Risk:
  - `If artifact drifts from code, frontend may integrate incorrect assumptions.`
- Cleanup Required:
  - `Keep artifact updated whenever Phase 0 contract surface changes.`
- Dead Paths Introduced: `none`
- Conflicting Implementations: `none`
- Next Cleanup Owner: `next implementing model during Phase 1 kickoff`
- Owner Timestamp: `codex @ 2026-05-08T10:39:04Z`
- Follow-up Notes:
  - `Will finalize status after file creation and typecheck verification.`
  - `Phase 0 gate artifacts now present under plan/phase-gates/.`

---

## DEC-20260508-006
- Decision ID: `DEC-20260508-006`
- Model: `codex`
- Branch/Commit: `master@7565941`
- Task: `Set up and execute live Phase 0 smoke validation, then commit Phase 0`
- Decision: `Add reproducible local smoke script (with local Postgres bootstrap) and run checks for /health, /ready, and system.conventions before committing Phase 0.`
- Rationale: `Phase 0 runtime verification should be executable by any developer and captured in-repo.`
- Alternatives Considered:
  - `Manual one-off commands only` rejected because they are not repeatable.
  - `Skip live checks and commit` rejected because user explicitly requested setup and execution.
- Scope:
  - `backend/scripts/phase0-smoke.sh`
  - `backend/src/infra/db/prisma.ts`
  - `backend/.env.example`
  - `schema.prisma`
  - `plan/phase-gates/PHASE_0_CONTRACT_FREEZE.md`
  - `plan/ai-governance/decision-log/DECISION_LOG.md`
- Status: `completed`
- Completion Notes:
  - Done: `Added executable Phase 0 smoke script that bootstraps local Postgres in Docker, generates Prisma client from a temporary in-backend schema copy, starts the API, and validates live responses for /health, /ready, and /trpc/system.conventions. Updated schema datasource URL binding for Prisma generation and updated contract-freeze doc with the smoke command. Fixed Prisma init logging to preserve strict typecheck compatibility.`
  - Not Done: `None for Phase 0 runtime validation scope.`
- Impact/Risk:
  - `Script relies on Docker availability for local Postgres bootstrap.`
- Cleanup Required:
  - `Keep the smoke script aligned if server endpoint paths or bootstrapping behavior change.`
- Dead Paths Introduced: `none`
- Conflicting Implementations: `none`
- Next Cleanup Owner: `codex`
- Owner Timestamp: `codex @ 2026-05-08T10:42:36Z`
- Follow-up Notes:
  - `Will update same entry with final status and validation outcomes.`
  - `Validation output: health={"status":"ok"}, ready={"status":"ready"}, system.conventions returned frozen contract payload.`
