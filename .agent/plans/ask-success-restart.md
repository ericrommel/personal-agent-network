# Approved ASK release across processes

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe one approved ASK through the node handle path when the relationship,
advertisement, permission, approval, and audit rows live in PostgreSQL and a
second process spends the approval.

## Scope and non-goals

The parent grants an active relationship, advertises the availability skill,
stores effect ASK, handles once, and approves the pending row. Context is not
read. The child opens its own pools, releases that same request once, reads
context once, and a later handle on either process stays unavailable.

Advisory locks `81421001` through `81421005` match the existing table tests
and are taken in ascending order.

Non-goals: opening PostgreSQL inside the node, a replay window, a listening
server, a product UI, and Issue #8, #9, #10, #11, #12, or #13 acceptance.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "releases the approved ASK once from the restarted rows",
  `/1 passed/`, no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- The public release is `{ result: true }`. Every other handle in this probe
  is `{ outcome: "unavailable" }`.
- Context reads stay 0 in the parent and move from 0 to 1 only on the child's
  successful release.
- Audit rows, in clock order, are approval/unavailable, disclosure/released,
  approval/unavailable, then the parent's later approval/unavailable.
- The audit export has no interval, permission effect, approval id, or result
  field.
- Local verify without Docker skips both new tests.

## Context and affected components

`LocalAvailabilityNode` already accepts injected stores. This slice adds
tests and this plan. It does not change production behavior.

## Decisions and ADRs

No new ADR. The node still does not construct the PostgreSQL classes. The
replay window stays unchosen.

## Security and privacy considerations

ASK reaches context only after the stored approval is approved and unexpired.
Release is single-use. A delivered boolean is not retracted. Denial stays
`{ outcome: "unavailable" }`. The audit rows do not carry the boolean,
interval, or permission effect.

## Implementation sequence

1. Add the parent and child probes.
2. Review independently, then merge only with green required CI.

## Developer tests

`tests/integration/ask-success-restart.test.ts`
`tests/integration/ask-success-restart-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not cite a skipped local run as that evidence. Do not
check a Human Product Owner box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

No new Reserved Product Decision. Equal audit timestamps would not preserve
handle order because ids are random, so the probe advances the injected clock
by one second per append. Docker is not running locally; the quality job is
the live SQL evidence.

## Progress

- [x] 2026-10-08 Add the approved ASK two-process probe

## Discoveries and decision log

- 2026-10-08: Keep this probe on the success path. The composed deny probe
  already covers a revoked relationship.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not treat the probe as restart-safe two-node acceptance.
