# Audit restart probe

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that one minimized deny audit row written by the node survives a
second OS process.

## Scope and non-goals

The parent handles one availability request with no relationship, advertisement,
or permission. The public response is `{ outcome: "unavailable" }`. Context is
not read. The node appends through an injected `PostgresAuditLog`. A spawned
vitest process opens its own pool and reads exactly one `decision` / `deny`
event for `req-audit-restart`, with no availability boolean, interval, or
permission effect.

The existing audit integration test holds advisory lock `81421003` for the
same table.

Non-goals: constructing PostgreSQL inside the node, approval or permission or
advertisement restart probes, a replay window, a listening server, and Issue
#12 or Issue #13 acceptance. This is not two-node MVP evidence.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "reads the denied audit row after restart", `/1 passed/`, no
  skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- Local verify without Docker skips both new tests.

## Decisions and ADRs

No new ADR. The node still does not construct `PostgresAuditLog`.

## Security and privacy considerations

D6 minimization: the restarted row has only kind, id, recordedAt, category,
requestId, and outcome. Denial stays `{ outcome: "unavailable" }`. A failed
append is not what this probe covers. The clock is inside the 30-day window.

## Developer tests

`tests/integration/audit-restart.test.ts`
`tests/integration/audit-restart-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. Do not check Engineering
Accepted. GitHub Actions is the live database evidence.

## Validation commands

`npm.cmd run verify`

## Progress

- [x] 2026-10-08 Add the two-process audit read probe and the shared lock

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not check a Human Product Owner box.
