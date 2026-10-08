# Revoked ASK across processes

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that revoking an ASK permission invalidates the approved, unreleased
row, and that a second process still denies without reading context.

## Scope and non-goals

The parent stores an active relationship, the availability advertisement, and
effect ASK. It handles once, approves, revokes the permission, and handles
again. The child opens its own pools, sees the revoked permission and the
invalidated approval, and denies.

Advisory locks `81421001` through `81421005` are taken in ascending order.

Non-goals: opening PostgreSQL inside the node, a replay window, a listening
server, a product UI, and Issue #8, #10, #11, #12, or #13 acceptance.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "denies the revoked ASK from the restarted rows", `/1 passed/`,
  no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- Every handle in this probe returns `{ outcome: "unavailable" }`.
- Context reads stay 0 in both processes.
- The approval id is unchanged and its status stays `invalidated`.
- Audit order is approval/unavailable, decision/deny, decision/deny.
- The audit export has no interval, permission effect, approval id, or result
  field.
- Local verify without Docker skips both new tests.

## Context and affected components

`LocalAvailabilityNode` already awaits permission revocation and
`invalidateUnreleased`. This slice adds tests and this plan.

## Decisions and ADRs

No new ADR. The node still does not construct the PostgreSQL classes.

## Security and privacy considerations

A revoked permission is not an active ASK. The approved row cannot be
released after revocation. Denial stays `{ outcome: "unavailable" }`. The
audit rows do not carry the boolean, interval, or permission effect.

## Implementation sequence

1. Add the parent and child probes.
2. Review independently, then merge only with green required CI.

## Developer tests

`tests/integration/ask-revoke-restart.test.ts`
`tests/integration/ask-revoke-restart-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

No new Reserved Product Decision. The probe advances the injected clock by
one second per audit append so `recorded_at` order is deterministic. Docker
is not running locally.

## Progress

- [x] 2026-10-08 Add the revoked ASK two-process probe

## Discoveries and decision log

- 2026-10-08: A revoked snapshot is absent, so the later handle is DENY. The
  invalidation itself is the stored approval status, not an audit outcome.
- 2026-10-08: Retry `23505` on `pg_type_typname_nsp_index`. Parallel
  `CREATE TABLE IF NOT EXISTS` can lose that race. Any other error still
  fails the probe.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not treat the probe as restart-safe two-node acceptance.
