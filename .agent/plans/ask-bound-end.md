# Different end does not spend an approved ASK

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that a second process cannot spend an approved ASK by sending the same
request id with a different end. The stored end stays. Context is not read.
The exact stored interval can still be spent once.

## Scope and non-goals

The parent stores an active relationship, the availability advertisement, and
effect ASK. It handles once and approves. The child sends one mismatched end,
then the stored interval, then the stored interval again.

The mismatched end is two hours, still inside the D5 window. Every clock is
at most four seconds after the origin. The interval starts one minute later.
The approval expires ten minutes after the origin.

Non-goals: a replay window, a listening server, a product UI, changing the
stored end, and Issue #11 or #13 acceptance.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "keeps the stored end and spends the exact request once",
  `/1 passed/`, no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- The mismatched handle returns `{ outcome: "unavailable" }` and reads no
  context. The approval stays `approved` with the original end.
- The exact handle returns `{ result: true }` once. The next exact handle
  does not read context again.
- The audit export has no interval, permission effect, approval id, or result
  field.
- Local verify without Docker skips both new tests.

## Context and affected components

Tests and this plan only. No production change. `sameApprovalBinding` treats
a different end as a conflict, so the stored row is not replaced.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. D4 already binds the approval
to the exact request. This probe does not choose a replay window.

## Security and privacy considerations

The public denial stays `{ outcome: "unavailable" }`. The conflict does not
disclose the stored end. The released boolean is not stored in the audit.

## Implementation sequence

1. Add the parent and child probes.
2. Review independently, then merge only with green required CI.

## Developer tests

`tests/integration/ask-bound-end.test.ts`
`tests/integration/ask-bound-end-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

The injected clock advances so each availability audit has its own
`recordedAt`. Docker is not running locally.

## Progress

- [x] 2026-10-08 Add the different-end two-process probe

## Discoveries and decision log

- 2026-10-08: `decideInsert` returns conflict when the end differs. The
  existing approved row stays stored.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not treat the probe as restart-safe two-node acceptance.
