# Stored DENY effect does not read context

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that an active stored permission effect `DENY` denies a valid future
availability request in a second process. Context is not read. No approval row
is created. The permission row stays active.

## Scope and non-goals

The parent stores an active relationship, the availability advertisement, and
effect `DENY`. The interval starts 60 seconds after the origin and lasts one
hour. Both clocks are before that start, so the denial is the stored effect
and not the future-only rule. The child clock is two seconds after the origin.

Non-goals: editing the two-node QE plan in this change, because that paragraph
is owned by the past-start note. A later note can name this probe. Also out of
scope: a replay window, a listening server, a product UI, and Issue #8 or #13
acceptance.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "denies the stored DENY effect from the restarted rows",
  `/1 passed/`, no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- The child clock is before the interval start.
- Both handles return `{ outcome: "unavailable" }` and read no context.
- `approval_records` stays empty. `releaseByRequestId` returns false.
- The permission row stays `active` with effect `DENY` and the same id.
- Both audit events are `decision` / `deny`. The export has no interval,
  permission effect, approval id, or result field.
- Local verify without Docker skips both new tests.

## Context and affected components

Tests and this plan only. No production change. `evaluatePolicy` returns
`DENY` for an active snapshot whose decision is `DENY`. The handler returns
before opening an approval and before the context read.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. D1 stored-effect deny is
unchanged. Absence and revoke remain separate deny paths.

## Security and privacy considerations

The public denial stays `{ outcome: "unavailable" }`. The audit outcome is
lowercase `deny` and does not contain the effect token. No boolean is
disclosed.

## Implementation sequence

1. Add the parent and child probes.
2. Review independently, then merge only with green required CI.
3. Record the probe in the QE plan only after this head is merged, so it does
   not collide with the past-start paragraph.

## Developer tests

`tests/integration/ask-effect-deny.test.ts`
`tests/integration/ask-effect-deny-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

Docker is not running locally. A skipped local run is not SQL evidence.

## Progress

- [x] 2026-10-08 Add the stored-DENY two-process probe

## Discoveries and decision log

- 2026-10-08: `readSnapshot` returns the active effect as `decision`. A `DENY`
  snapshot fails closed in `evaluatePolicy` before `openApproval`.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not treat the probe as restart-safe two-node acceptance.
