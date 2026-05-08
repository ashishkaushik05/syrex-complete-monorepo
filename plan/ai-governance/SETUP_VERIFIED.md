# Verified Setup Mapping (Web-Checked)

Last verified: `2026-05-08`

## Claude Code
- Official method: project `CLAUDE.md` (or `--append-system-prompt`).
- Implemented file: `CLAUDE.md` at repository root.

## Copilot CLI
- Official method: `.github/copilot-instructions.md` and agent files like `AGENTS.md`; docs also allow `CLAUDE.md` / `GEMINI.md` at repo root.
- Implemented files:
  - `.github/copilot-instructions.md`
  - `AGENTS.md`

## Codex
- Official method: `AGENTS.md` (Codex docs: Custom instructions with AGENTS.md).
- Implemented file: `AGENTS.md` at repository root.

## Gemini CLI
- Official method: `GEMINI.md` context files (root/global hierarchy). Optional full system override via `GEMINI_SYSTEM_MD`.
- Implemented file: `GEMINI.md` at repository root.

## Shared Governance Binding
All instruction files point models to:
- `plan/ai-governance/decision-log/DECISION_PROTOCOL.md`
- `plan/ai-governance/decision-log/DECISION_LOG.md`
