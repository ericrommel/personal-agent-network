# ASK releases on the last millisecond

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that an approved ASK still releases one millisecond before its
ten-minute lifetime, and that the same row cannot be spent again.

## Scope and non-goals

The parent stores an active relationship, the availability advertisement, and
effect ASK. It handles once at the origin and approves. The lifetime is ten
minutes from that pending insert. The child clock is one millisecond before
`expiresAt`. The interval starts eleven minutes after the origin, so it is
still future at that clock. The child releases once.

The follow-up handle is one second later, which is after `expiresAt`. Its
denial is the already released row. The release under test is the earlier
handle.

PR #86 already locks denial at the exact expiry instant. This probe does not
change that rule and does not mark the row `expired`.

Advisory locks `81421001` through `81421005` are taken in ascending order.
Schema creation retries only PostgreSQL `23505` on the row type.

Non-goals: opening PostgreSQL inside the node, a replay window, a listening
server, a product UI, and Issue #9, #10, #11, #12, or #13 acceptance.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "releases the ASK one millisecond before it expires", `/1 passed/`,
  no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- The stored `expiresAt` is the origin plus ten minutes.
- The releasing clock is that instant minus one millisecond. `now < expiresAt`
  is true. The interval start is still later.
- The first child handle returns `{ result: true }` and reads context once.
- The second handle returns `{ outcome: "unavailable" }` and does not read
  context again. The status stays `released`.
- Audit order is approval/unavailable, disclosure/released,
  approval/unavailable.
- The audit export has no interval, permission effect, approval id, or result
  field.
- Local verify without Docker skips both new tests.

## Context and affected components

Tests and this plan only. No production change.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. The comparison remains
`now < expiresAt`.

## Security and privacy considerations

The last millisecond inside the lifetime can disclose the boolean once.
A later handle does not disclose it again. The audit does not store the
boolean. Denial stays `{ outcome: "unavailable" }`.

## Implementation sequence

1. Add the parent and child probes.
2. Review independently, then merge only with green required CI.

## Developer tests

`tests/integration/ask-lifetime-boundary.test.ts`
`tests/integration/ask-lifetime-boundary-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

The injected clock is the audit `recordedAt`. Docker is not running locally.
The follow-up clock is intentionally past expiry so the single-use assertion
is not another expiry assertion.

## Progress

- [x] 2026-10-08 Add the last-millisecond two-process probe

## Discoveries and decision log

- 2026-10-08: `#askAuthorized` uses `now < expiresAt`. Equality is already
  denied by the expired-ASK probe. This probe locks the previous millisecond.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not treat the probe as restart-safe two-node acceptance.
