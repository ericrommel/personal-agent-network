# Process-local budget resets in a second process

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that an ALLOW permission discloses a boolean with no approval row, that
the eighth caller read succeeds, and that the ninth read in that same process
returns unavailable without another context read. A second process then
discloses once. The budget does not survive in PostgreSQL.

## Scope and non-goals

The parent stores an active relationship, the availability advertisement, and
effect ALLOW. It handles the same request eight times, then once more. The
child loads those rows and handles once. No approval row is created.

The interval starts one minute after the origin. Every clock in this probe is
at most nine seconds after the origin.

Non-goals: a durable budget store, a replay window, a listening server, a
product UI, and Issue #10 or #13 acceptance.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "releases one boolean from the restarted rows", `/1 passed/`,
  no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- Eight parent handles return `{ result: true }` and read context eight times.
- The ninth parent handle returns `{ outcome: "unavailable" }` and does not
  read context.
- The child returns `{ result: true }` and reads context once.
- `approval_records` stays empty.
- The audit export has no interval, permission effect, approval id, or result
  field.
- Local verify without Docker skips both new tests.

## Context and affected components

Tests and this plan only. No production change.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. D5 already says the budgets are
process-local. This probe does not choose a replay window. Repeated ALLOW
reads are the budget rule, not a network replay cache.

## Security and privacy considerations

Budget exhaustion stays `{ outcome: "unavailable" }`. The boolean is not
stored in the audit. A restarted process does not inherit the exhausted
budget, which is the current in-memory behavior.

## Implementation sequence

1. Add the parent and child probes.
2. Review independently, then merge only with green required CI.

## Developer tests

`tests/integration/allow-budget-restart.test.ts`
`tests/integration/allow-budget-restart-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

The injected clock advances one second for each handle so each audit row has
its own `recordedAt`. Docker is not running locally. The caller budget is 8.

## Progress

- [x] 2026-10-08 Add the process-local budget two-process probe

## Discoveries and decision log

- 2026-10-08: `readAuthorizedBoolean` consumes the budget before it reads
  context. A failed consume does not read context.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not treat the probe as restart-safe two-node acceptance.
