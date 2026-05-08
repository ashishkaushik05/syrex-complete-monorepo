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
