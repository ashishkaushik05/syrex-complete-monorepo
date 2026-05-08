# AI Governance Pack

This folder standardizes how all AI agents work in this repository.

## Goals
- Every implementation decision is visible.
- Partial work is explicitly marked.
- Abandoned routes are documented so they can be cleaned.
- No parallel conflicting implementations without traceability.

## Folder Layout
- `prompts/`: system prompts for each model.
- `decision-log/`: shared decision protocol, template, and repository decision log.

## Required Workflow (All Models)
1. Read `decision-log/DECISION_PROTOCOL.md` before coding.
2. Before writing code, create a `planned` or `in_progress` decision entry.
3. After coding, update the same entry to `completed`, `partial`, `blocked`, or `abandoned`.
4. If partial/abandoned, include exact cleanup actions and impacted files/routes.

## Non-Negotiable Rule
If a model changes code without a decision log entry, that work is considered non-compliant and must be reviewed before merge.
