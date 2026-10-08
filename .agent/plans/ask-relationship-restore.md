# Restored relationship spends an approved ASK

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that revoking a relationship does not spend or invalidate an approved
ASK, and that a later active relationship for the same ordered pair lets a
second process spend that approval once.

## Scope and non-goals

The parent stores an active relationship, the availability advertisement, and
effect ASK. It handles once, approves, revokes the relationship, and handles
again. The approval stays `approved` and context stays unread. The parent
then creates the relationship again. The store replaces the revoked pair with
a new active relationship id. The child spends the approval once.

PRQ-007 says a relationship does not decide in-flight invalidation. Permission
revoke does. This probe does not move that boundary.

The child clock is three seconds after the origin. The approval lifetime is
ten minutes. The interval starts one minute after the origin, so the spend is
inside the lifetime and the interval is still future.

Advisory locks `81421001` through `81421005` are taken in ascending order.
Schema creation retries only PostgreSQL `23505` on the row type.

Non-goals: opening PostgreSQL inside the node, invalidating approvals from
relationship revoke, a replay window, a listening server, a product UI, and
Issue #8, #10, #11, #12, or #13 acceptance.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "releases the restored relationship ASK from the restarted rows",
  `/1 passed/`, no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- The deny handle returns `{ outcome: "unavailable" }` and reads no context.
- The restored relationship id differs from the revoked id and stays active.
- The child returns `{ result: true }` once, reads context once, and a second
  handle returns unavailable without another context read.
- The approval ends `released`. A later release returns false.
- Audit order is approval/unavailable, decision/deny, disclosure/released,
  approval/unavailable.
- The audit export has no interval, permission effect, approval id, or result
  field.
- Local verify without Docker skips both new tests.

## Context and affected components

Tests and this plan only. No production change.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. Relationship revoke still does
not own in-flight approval invalidation.

## Security and privacy considerations

An approved ASK remains spendable when the same ordered pair is active again
inside the ten-minute lifetime. Denial while the pair is revoked stays
`{ outcome: "unavailable" }`. The released boolean is not stored in the audit.

## Implementation sequence

1. Add the parent and child probes.
2. Review independently, then merge only with green required CI.

## Developer tests

`tests/integration/ask-relationship-restore.test.ts`
`tests/integration/ask-relationship-restore-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

The injected clock advances so each availability audit has its own
`recordedAt`. Docker is not running locally. The pair key stays one row.
Create after revoke replaces that revoked row.

## Progress

- [x] 2026-10-08 Add the restored-relationship two-process probe

## Discoveries and decision log

- 2026-10-08: `INSERT ... ON CONFLICT` sets the new relationship id and
  `active` only when the stored status is `revoked`.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not treat the probe as restart-safe two-node acceptance.
