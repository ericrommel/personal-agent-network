# Unparsable approval expiry fails closed

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that a stored approval expiry which is not a UTC instant fails closed
in a second process. Context is not read. The SQL row stays approved and keeps
the unparsable text.

## Scope and non-goals

The parent stores an active relationship, the availability advertisement, and
effect ASK. It handles once, approves, and then replaces `expires_at` with
`not-a-time`. The original expiry would have been ten minutes after the
origin. The child clock is two seconds after the origin, before the interval
start. The denial is the parse failure.

Non-goals: repairing the row, a replay window, a listening server, a product
UI, and Issue #11 or #13 acceptance.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "denies the unparsable expiry from the restarted rows",
  `/1 passed/`, no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- The domain reader returns null for the row.
- The handle returns `{ outcome: "unavailable" }` and reads no context.
- The SQL status stays `approved` and `expires_at` stays `not-a-time`.
- The audit export has no interval, permission effect, approval id, result
  field, or the unparsable text.
- Local verify without Docker skips both new tests.

## Context and affected components

Tests and this plan only. No production change. `isApproval` rejects an
expiry that is not a canonical UTC instant, so the handler does not reach
the context read.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. The existing fail-closed rule
for an unparsable stored expiry is unchanged.

## Security and privacy considerations

The public denial stays `{ outcome: "unavailable" }`. The bad text is not
copied into the audit. The row is not released.

## Implementation sequence

1. Add the parent and child probes.
2. Review independently, then merge only with green required CI.

## Developer tests

`tests/integration/ask-bad-expiry.test.ts`
`tests/integration/ask-bad-expiry-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

Docker is not running locally. The update is test-only SQL. Production code
does not write an unparsable expiry.

## Progress

- [x] 2026-10-08 Add the unparsable-expiry two-process probe

## Discoveries and decision log

- 2026-10-08: `toApproval` returns null when `isApproval` rejects `expiresAt`.
  `insertPending` then fails closed instead of replacing the row.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not treat the probe as restart-safe two-node acceptance.
