# Rejected ASK stays rejected across restart

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that an owner rejection of a pending ASK survives a second process.
The exact request is denied. Context is not read. The SQL row stays rejected.
Release does not write.

## Scope and non-goals

The parent stores an active relationship, the availability advertisement, and
effect ASK. It handles once at the origin, then rejects that pending row. The
interval starts 60 seconds after the origin. Approval expiry is ten minutes
after the origin. The child clock is two seconds after the origin, before the
start and before expiry, so the denial is the rejection.

Non-goals: a replay window, a listening server, a product UI, and Issue #11
or #13 acceptance. Policy remains ASK. This is not a stored DENY effect.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "denies the rejected ASK from the restarted rows", `/1 passed/`,
  no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- The child clock is before the start and before `expiresAt`.
- The handle returns `{ outcome: "unavailable" }` and reads no context.
- The SQL status stays `rejected` with the original end and expiry. The
  approval id does not change. `releaseByRequestId` returns false.
- Both audit events are `approval` / `unavailable`. The export has no
  interval, permission effect, approval id, or result field.
- Local verify without Docker skips both new tests.

## Context and affected components

Tests and plans only. No production change. `reject` changes pending to
rejected and does not change `expiresAt`. `approvalMatches` requires
`approved`, so the handler returns before the context read. `release` returns
false when the status is not approved.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. D4 terminal rejection is
unchanged.

## Security and privacy considerations

The public denial stays `{ outcome: "unavailable" }`. A rejected row is not
spent and not turned back into pending by the restarted request. The audit
does not contain the boolean.

## Implementation sequence

1. Add the parent and child probes.
2. Record the observation in the two-node QE plan without accepting Issue #13.
3. Review independently, then merge only with green required CI.

## Developer tests

`tests/integration/ask-rejected.test.ts`
`tests/integration/ask-rejected-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box. Do not check the
two-process restart evidence box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

Docker is not running locally. A skipped local run is not SQL evidence.

## Progress

- [x] 2026-10-08 Add the rejected-ASK two-process probe

## Discoveries and decision log

- 2026-10-08: Policy stays ASK, so the audit category is `approval` /
  `unavailable`, not `decision` / `deny`. The rejection is approval state.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not treat the probe as restart-safe two-node acceptance.
