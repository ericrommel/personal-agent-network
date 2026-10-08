# Expired ASK denies across processes

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that an approved ASK past its ten-minute lifetime is denied by a
second process, without reading context and without spending the row.

## Scope and non-goals

The parent stores an active relationship, the availability advertisement, and
effect ASK. It handles once at the origin clock and approves. The approval
lifetime is ten minutes from that pending insert. The requested interval
starts eleven minutes after the origin, so it is still future when the child
clock equals the expiry instant. The child denies. The row stays `approved`.

`ApprovalService.release` on an expired approved row already returns false
and does not rewrite the status. This probe does not change that behavior.

Advisory locks `81421001` through `81421005` are taken in ascending order.
Schema creation retries only PostgreSQL `23505` on the row type.

Non-goals: opening PostgreSQL inside the node, marking the row `expired`, a
replay window, a listening server, a product UI, and Issue #9, #10, #11, #12,
or #13 acceptance.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "denies the expired ASK from the restarted rows", `/1 passed/`,
  no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- The stored `expiresAt` is the origin plus ten minutes.
- The child clock is that same instant. `now < expiresAt` is false.
- The interval is `[origin + 11 minutes, origin + 11 minutes + 1 hour)`.
- Every handle returns `{ outcome: "unavailable" }`. Context reads stay 0.
- The approval stays `approved` and is not spent. A direct release at the
  child clock returns false and leaves the status `approved`.
- Audit order is approval/unavailable, then approval/unavailable.
- The audit export has no interval, permission effect, approval id, or result
  field.
- Local verify without Docker skips both new tests.

## Context and affected components

Tests and this plan only. No production change.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. The ten-minute lifetime is the
resolved approval rule. The handler returns unavailable when the boolean is
null, and it does not call release on that path.

## Security and privacy considerations

An approved ASK is not sufficient at or after `expiresAt`. Context stays
unread. Denial stays `{ outcome: "unavailable" }`. The audit stays minimized
and does not record the expiry instant as an availability interval.

## Implementation sequence

1. Add the parent and child probes.
2. Review independently, then merge only with green required CI.

## Developer tests

`tests/integration/ask-expired-restart.test.ts`
`tests/integration/ask-expired-restart-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

The injected clock is the audit `recordedAt`. Docker is not running locally.
A child clock of origin plus ten minutes against an origin-plus-one-minute
window would mix expiry with the future-only rule. This probe does not do
that.

## Progress

- [x] 2026-10-08 Add the expired-ASK two-process probe

## Discoveries and decision log

- 2026-10-08: `#askAuthorized` requires `now < expiresAt` before any context
  read. `approvalMatches` does not check expiry, so the handler reaches
  `queryAvailability`, receives null, and returns unavailable without release.
- 2026-10-08: The lifetime is fixed when the pending row is inserted. Approve
  does not extend it.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not treat the probe as restart-safe two-node acceptance.
