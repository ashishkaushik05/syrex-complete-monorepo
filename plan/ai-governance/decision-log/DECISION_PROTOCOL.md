# Decision Logging Protocol

## Purpose

Maintain implementation clarity and prevent partial or parallel behaviour paths.

## Required decision fields

Every decision entry records a unique ID, model, branch/commit, task, decision,
rationale, alternatives, exact scope, status, completion notes, impact/risk,
cleanup, dead paths, conflicting implementations, owner, and timestamp.

## Status rules

- `planned` or `in_progress` is recorded before implementation work begins.
- The same entry is updated to `completed`, `partial`, `blocked`, or `abandoned`.
- `partial` and `abandoned` entries must state what remains, dead paths,
  conflicting paths, cleanup, and an owner.

## Update rules

- Keep entries append-only. Add follow-up notes rather than silently rewriting
  an earlier decision.
- Do not create a second ID for the same implementation chunk unless its scope
  materially changes.
- A feature is not complete until its decision entry has its final status.
