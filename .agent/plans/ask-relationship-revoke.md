# Revoked relationship denies an approved ASK

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that a revoked relationship denies an already approved ASK across a
second process, without reading context.

## Scope and non-goals

The parent stores an active relationship, the availability advertisement, and
effect ASK. It handles once, approves, revokes the relationship, and handles
again. The child sees the revoked relationship and the still-approved row,
then denies.

PRQ-007 says relationship revoke guarantees the next local read. This probe
does not make relationship revoke invalidate the approval row.

Advisory locks `81421001` through `81421005` are taken in ascending order.

Non-goals: opening PostgreSQL inside the node, a replay window, a listening
server, a product UI, and Issue #9, #10, #11, #12, or #13 acceptance.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "denies through the revoked relationship from the restarted rows",
  `/1 passed/`, no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- Every handle returns `{ outcome: "unavailable" }`. Context reads stay 0.
- The approval stays `approved` and is not spent.
- Audit order is approval/unavailable, decision/deny, decision/deny.
- The audit export has no interval, permission effect, approval id, or result
  field.
- Local verify without Docker skips both new tests.

## Context and affected components

Tests and this plan only. No production change.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. Relationship revoke still does
not own in-flight approval invalidation.

## Security and privacy considerations

An approved ASK is not sufficient while the current relationship read is not
active. Denial stays `{ outcome: "unavailable" }`. The audit stays minimized.

## Implementation sequence

1. Add the parent and child probes.
2. Review independently, then merge only with green required CI.

## Developer tests

`tests/integration/ask-relationship-revoke.test.ts`
`tests/integration/ask-relationship-revoke-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

The injected clock advances one second per audit append. Docker is not
running locally.

## Progress

- [x] 2026-10-08 Add the revoked-relationship two-process probe

## Discoveries and decision log

- 2026-10-08: Policy denies before release when the relationship is already
  revoked, so the approval row stays approved and unspent.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not treat the probe as restart-safe two-node acceptance.
