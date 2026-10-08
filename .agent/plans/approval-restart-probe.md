# Approval restart probe

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that one approved approval row survives a second OS process and can
be released only once.

## Scope and non-goals

The parent process writes an approved row through `LocalAvailabilityNode`
and `PostgresApprovalStore`. A spawned vitest process opens its own pool,
releases that request id once, and a second release returns false. The
parent then sees `released` and cannot release it again.

`postgres-approval-store` integration coverage holds advisory lock
`81421002` for the same table so the two files cannot truncate each other.

Non-goals: wiring the node to open PostgreSQL itself, audit or permission
or advertisement restart probes, a replay window, a listening server, and
Issue #11 or Issue #13 acceptance. This probe is not two-node MVP evidence.
The default in-memory store still drops on restart.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent spawns vitest and
  requires output containing "releases the restarted approval once",
  `/1 passed/`, no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- Local verify without Docker skips both new tests.

## Decisions and ADRs

No new ADR. The node still does not construct `PostgresApprovalStore`.

## Security and privacy considerations

The child discloses no availability boolean. Release stays single-use. The
clock is inside the 10-minute window, so this probe does not change expiry
persistence. Errors redact the database URL.

## Developer tests

`tests/integration/approval-restart.test.ts`
`tests/integration/approval-restart-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. Do not check Engineering
Accepted. GitHub Actions is the live database evidence. A skipped local run
is not that evidence.

## Validation commands

`npm.cmd run verify`

## Progress

- [x] 2026-10-08 Add the two-process approval release probe and the shared lock

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not check a Human Product Owner box.
