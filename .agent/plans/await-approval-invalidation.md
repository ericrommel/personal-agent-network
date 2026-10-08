# Await approval invalidation

Status: In Progress
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Make permission revoke await `invalidateUnreleased` so a later asynchronous
approval store cannot be started and ignored.

## Scope and non-goals

`UnreleasedApprovalPort.invalidateUnreleased` may return void or a Promise.
`SkillPermissionService` awaits it after the permission row is revoked. A
synchronous in-memory approval service still works, because awaiting a
non-Promise is valid.

This change does not pass `PostgresApprovalStore` into `ApprovalService` or
`LocalAvailabilityNode`. `ApprovalService` stays synchronous. Doing both in
one change would also edit the node while PR #68 edits that file.

Out of scope: replay windows, HTTP, the CLI, and Issue #13 acceptance. No new
ADR.

## Requirements and acceptance criteria

A revoked permission still invalidates pending and approved rows for that
ordered pair. If invalidation throws or returns a rejected Promise, revoke
returns `SKILL_PERMISSION_DEPENDENCY_FAILED` and the permission row stays
revoked. Revoke does not resolve while the returned Promise is pending.

## Decisions and ADRs

No new ADR. D4 already requires invalidation of unreleased approvals on
revoke. A fire-and-forget call would miss that decision.

## Security and privacy considerations

The port is still an in-process trusted dependency. Remote input cannot call
it. Failure after the row is revoked stays fail-closed for the caller and
does not restore the permission.

## Developer tests

`tests/unit/modules/permissions/skill-permission.test.ts`

## QE and acceptance verification

Independent review is required before merge. This plan does not accept Issue
#8 or Issue #11 beyond their existing process-local slices.

## Validation commands

`npm.cmd run verify`

## Progress

- [x] 2026-10-08 Await the port and cover a rejected and a delayed Promise

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI is
green. Do not check a Human Product Owner box.
