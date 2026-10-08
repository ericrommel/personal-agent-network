# Exact start spends an approved ASK

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that an approved ASK can be spent when the restarted clock is exactly
the interval start. The start instant is included. Context is read once. The
SQL row becomes released. A later handle does not read context again.

## Scope and non-goals

The parent stores an active relationship, the availability advertisement, and
effect ASK. It handles once at the origin, then approves that pending row. The
interval starts 60 seconds after the origin. Approval expiry is ten minutes
after the origin. The child clock is exactly the start, which is before expiry
and before the end.

Non-goals: a replay window, a listening server, a product UI, durable
availability budgets, and Issue #11 or #13 acceptance. This change does not
edit the two-node QE plan.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "spends the inclusive start from the restarted rows", `/1 passed/`,
  no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- The child clock equals `start`, is before `end`, and is before `expiresAt`.
- The handle returns `{ result: true }` and reads context once.
- The SQL status becomes `released` with the same end and expiry.
- The following handle is unavailable and does not read context again.
- The spend audit is `disclosure` / `released`. Its `recordedAt` equals the
  interval start, so minimization checks every field except `recordedAt`.
- Local verify without Docker skips both new tests.

## Context and affected components

Tests and this plan only. No production change. `parseQueryInterval` rejects
`startMs < nowMs` and allows equality. The stored approval is still inside
its ten-minute lifetime at that instant.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. D5 includes the start instant.
The half-open end is unchanged.

## Security and privacy considerations

The public success body is only `{ result: true }`. The audit does not gain an
interval field from the equal clock. A second handle does not disclose again.

## Implementation sequence

1. Add the parent and child probes.
2. Review independently, then merge only with green required CI.
3. Record the observation in the two-node QE plan in a later docs change.

## Developer tests

`tests/integration/ask-exact-start.test.ts`
`tests/integration/ask-exact-start-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box. Do not check the
two-process restart evidence box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

Docker is not running locally. A skipped local run is not SQL evidence.
The existing success probe spends about 59 seconds before the start. This
probe is the equal-start boundary.
