# Composed restart probe

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that one node, using an injected PostgreSQL relationship store and
an injected PostgreSQL audit log, still denies after a second process, and
that the minimized deny row is still there.

## Scope and non-goals

The parent revokes a relationship, handles one request, and appends through
the audit port. The public response is `{ outcome: "unavailable" }`. Context
is not read. The child opens its own pools, sees the revoked row and that
audit event, handles a second request the same way, and appends a second
minimized deny.

Advisory locks `81421001` and `81421003` match the existing relationship and
audit tests.

Non-goals: opening PostgreSQL inside the node, a replay window, a listening
server, and Issue #9, Issue #12, or Issue #13 acceptance.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "sees the revoked relationship and the minimized deny",
  `/1 passed/`, no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- Local verify without Docker skips both new tests.

## Decisions and ADRs

No new ADR. The node still does not construct the PostgreSQL classes.

## Security and privacy considerations

Denial stays `{ outcome: "unavailable" }`. The audit rows have no availability
boolean or interval. A revoked relationship does not grant access.

## Developer tests

`tests/integration/composed-restart.test.ts`
`tests/integration/composed-restart-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box.

## Validation commands

`npm.cmd run verify`

## Progress

- [x] 2026-10-08 Add the composed two-process probe

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green.
