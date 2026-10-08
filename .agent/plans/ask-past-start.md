# Past interval start does not spend an approved ASK

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that a second process whose clock is after the requested interval start,
and still before the ten-minute approval expiry, denies the exact approved
request. Context is not read. The approval stays approved. A later handle whose
clock is still before that start spends the same approval once.

## Scope and non-goals

The parent stores an active relationship, the availability advertisement, and
effect ASK. It handles once at the origin and approves. The interval starts 60
seconds after the origin and lasts one hour. Approval expiry is ten minutes
after the origin. The child clock is one second after the start. The parent
then handles at two seconds after the origin, which is still before the start,
and handles once more one second later.

Non-goals: a replay window, a listening server, a product UI, persisting the
process-local read budget, and Issue #11 or #13 acceptance.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "denies the past start from the restarted rows", `/1 passed/`,
  no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- The child clock is after the start, before the end, and before `expiresAt`.
- The child handle returns `{ outcome: "unavailable" }`, reads no context, and
  leaves the SQL row `approved` with the original end and expiry.
- The parent spend clock is before the start. That handle returns
  `{ result: true }` once. The next handle is unavailable and does not read
  context again. The row status is `released`.
- Audit order is `recorded_at`. The spend clock is earlier than the child
  denial clock, so the denial sorts after the spend. That is the injected
  clock, not a retraction of the delivered boolean.
- The audit export has no interval, permission effect, approval id, or result
  field.
- Local verify without Docker skips both new tests.

## Context and affected components

Tests and plans only. No production change. `parseQueryInterval` rejects a
start before `now`. `readAuthorizedBoolean` returns null before the budget
consume and before the context read. The handler returns unavailable without
calling release.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. D5 future-only and D4 single-use
release are unchanged. The process-local budget stays process-local.

## Security and privacy considerations

The public denial stays `{ outcome: "unavailable" }`. A failed future-only
check must not spend the approval and must not disclose a boolean. The later
successful spend is one disclosure. The follow-up denial is the already
released row.

## Implementation sequence

1. Add the parent and child probes.
2. Record the observation in the two-node QE plan without accepting Issue #13.
3. Review independently, then merge only with green required CI.

## Developer tests

`tests/integration/ask-past-start.test.ts`
`tests/integration/ask-past-start-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box. Do not check the
two-process restart evidence box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

Docker is not running locally. A skipped local run is not SQL evidence.

## Progress

- [x] 2026-10-08 Add the past-start two-process probe

## Discoveries and decision log

- 2026-10-08: `startMs < nowMs` fails closed inside `readAuthorizedBoolean`
  before `#tryConsume` and before `#readBusy`. The handler does not release
  on a null boolean.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not treat the probe as restart-safe two-node acceptance.
