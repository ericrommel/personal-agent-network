# Withdrawn advertisement denies an approved ASK

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that withdrawing the availability advertisement denies an already
approved ASK across a second process, without reading context.

## Scope and non-goals

The parent stores an active relationship, the availability advertisement, and
effect ASK. It handles once, approves, withdraws that advertisement, and
handles again. The child sees the withdrawn advertisement and the still
approved row, then denies.

Advertisement withdraw does not call `invalidateUnreleased`. This probe does
not add that call. It records the current next-read denial. A later product
decision could still require invalidation. This change does not make that
decision.

The child clocks are one and two seconds after the origin. The lifetime is
ten minutes. The interval starts one minute after the origin.

Advisory locks `81421001` through `81421005` are taken in ascending order.
Schema creation retries only PostgreSQL `23505` on the row type.

Non-goals: opening PostgreSQL inside the node, invalidating approvals from
advertisement withdraw, a replay window, a listening server, a product UI,
and Issue #8, #10, #11, #12, or #13 acceptance.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "denies through the withdrawn advertisement from the restarted
  rows", `/1 passed/`, no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- Every handle returns `{ outcome: "unavailable" }`. Context reads stay 0.
- The approval stays `approved` and is not spent.
- The stored advertisement status is `withdrawn`. The relationship and the
  ASK permission stay active.
- Audit order is approval/unavailable, decision/deny, decision/deny.
- The audit export has no interval, permission effect, approval id, or result
  field.
- Local verify without Docker skips both new tests.

## Context and affected components

Tests and this plan only. No production change.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. Permission revoke remains the
path that invalidates unreleased approvals.

## Security and privacy considerations

An approved ASK is not sufficient while the current advertisement read is not
exactly true. Denial stays `{ outcome: "unavailable" }`. The audit stays
minimized.

## Implementation sequence

1. Add the parent and child probes.
2. Review independently, then merge only with green required CI.

## Developer tests

`tests/integration/ask-advertisement-withdraw.test.ts`
`tests/integration/ask-advertisement-withdraw-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

The injected clock advances one second per audit append. Docker is not
running locally. Whether advertisement withdraw should also invalidate the
approval is not decided here.

## Progress

- [x] 2026-10-08 Add the withdrawn-advertisement two-process probe

## Discoveries and decision log

- 2026-10-08: Policy requires the advertisement read to be exactly true.
  Withdrawal makes the next decision DENY before context is read.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not treat the probe as restart-safe two-node acceptance.
