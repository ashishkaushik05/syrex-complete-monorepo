# Copilot Repository Instructions

Use this repository's AI governance workflow on every coding task.

## Required Documents
- `plan/ai-governance/decision-log/DECISION_PROTOCOL.md`
- `plan/ai-governance/decision-log/DECISION_TEMPLATE.md`
- `plan/ai-governance/decision-log/DECISION_LOG.md`

## Task Flow
1. Add or update decision entry before code changes.
2. Implement only within declared scope.
3. Update decision status to `completed`, `partial`, `blocked`, or `abandoned`.
4. For non-complete status, include explicit cleanup and conflict notes.

## Quality Rules
- Make decisions observable and auditable.
- Avoid parallel implementations and dead routes.
- If transition paths are required, document deprecation and cleanup owner.

## Done Definition
Code updates without decision-log updates are non-compliant.
