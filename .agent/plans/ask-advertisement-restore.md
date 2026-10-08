# Readvertised skill spends an approved ASK

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that withdrawing an advertisement does not spend an approved ASK, and
that advertising the same skill again lets a second process spend that
approval once.

## Scope and non-goals

The parent stores an active relationship, the availability advertisement, and
effect ASK. It handles once, approves, withdraws the advertisement, and
handles again. The approval stays `approved` and context stays unread. The
parent advertises again. The store replaces the withdrawn pair with a new
advertisement id. The child spends the approval once.

Advertisement withdraw does not call `invalidateUnreleased`. This probe does
not add that call.

The child clock is three seconds after the origin. The approval lifetime is
ten minutes. The interval starts one minute after the origin.

Advisory locks `81421001` through `81421005` are taken in ascending order.
Schema creation retries only PostgreSQL `23505` on the row type.

Non-goals: opening PostgreSQL inside the node, invalidating approvals from
advertisement withdraw, a replay window, a listening server, a product UI,
and Issue #8, #10, #11, #12, or #13 acceptance.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "releases the readvertised ASK from the restarted rows",
  `/1 passed/`, no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- The deny handle returns `{ outcome: "unavailable" }` and reads no context.
- The new advertisement id differs from the withdrawn id and stays
  `advertised`.
- The child returns `{ result: true }` once, reads context once, and a second
  handle returns unavailable without another context read.
- The approval ends `released`. A later release returns false.
- Audit order is approval/unavailable, decision/deny, disclosure/released,
  approval/unavailable.
- The audit export has no interval, permission effect, approval id, or result
  field.
- Local verify without Docker skips both new tests.

## Context and affected components

Tests and this plan only. No production change.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. Permission revoke remains the
path that invalidates unreleased approvals.

## Security and privacy considerations

An approved ASK remains spendable when the skill is advertised again inside
the ten-minute lifetime. Denial while the advertisement is withdrawn stays
`{ outcome: "unavailable" }`. The released boolean is not stored in the audit.

## Implementation sequence

1. Add the parent and child probes.
2. Review independently, then merge only with green required CI.

## Developer tests

`tests/integration/ask-advertisement-restore.test.ts`
`tests/integration/ask-advertisement-restore-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

The injected clock advances so each availability audit has its own
`recordedAt`. Docker is not running locally. The advertisement pair key stays
one row. Advertise after withdraw replaces that withdrawn row.

## Progress

- [x] 2026-10-08 Add the readvertised-skill two-process probe

## Discoveries and decision log

- 2026-10-08: `INSERT ... ON CONFLICT` sets the new advertisement id and
  `advertised` only when the stored status is `withdrawn`.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not treat the probe as restart-safe two-node acceptance.
