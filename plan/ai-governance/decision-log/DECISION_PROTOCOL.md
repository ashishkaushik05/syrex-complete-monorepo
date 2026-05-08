# Decision Logging Protocol

## Purpose
Maintain implementation clarity across Codex, Claude Code, Copilot CLI, and Gemini so unfinished or divergent paths can be detected and cleaned early.

## Log File
Primary log file:
- `plan/ai-governance/decision-log/DECISION_LOG.md`

Optional machine-readable mirror:
- `plan/ai-governance/decision-log/DECISION_LOG.jsonl`

## Required Fields Per Decision
Every entry must include:
- `Decision ID`: unique id (`DEC-YYYYMMDD-###`).
- `Model`: `codex | claude-code | copilot-cli | gemini`.
- `Branch/Commit`: active branch and commit hash at decision time.
- `Task`: short statement of what is being implemented.
- `Decision`: what was chosen.
- `Rationale`: why this choice was made.
- `Alternatives Considered`: rejected options and reason.
- `Scope`: exact files/modules/routes intended to change.
- `Status`: `planned | in_progress | completed | partial | blocked | abandoned`.
- `Completion Notes`: what is done vs not done.
- `Impact/Risk`: side effects or possible regressions.
- `Cleanup Required`: explicit cleanup actions if partial/abandoned.
- `Owner Timestamp`: model + ISO timestamp.

## Status Rules
- `completed`: all scoped changes implemented and consistent.
- `partial`: some scoped changes implemented; some missing.
- `blocked`: cannot continue due to dependency/info/tooling.
- `abandoned`: approach intentionally dropped; specify rollback/cleanup.

## Partial/Abandoned Mandatory Additions
If status is `partial` or `abandoned`, include:
- `Dead Paths Introduced`: list of temporary routes/files/flags.
- `Conflicting Implementations`: any overlap with old/new logic.
- `Next Cleanup Owner`: who should clean it and when.

## Update Rules
- Do not create a second decision id for the same implementation chunk unless scope materially changes.
- Update existing entry when state moves from `in_progress` -> final status.
- Keep entries append-only; corrections are added as follow-up notes, not silent edits.

## Review Gate
PR is not ready unless every changed feature area has at least one `completed` decision entry or an explicit `partial/blocked` entry with cleanup instructions.
