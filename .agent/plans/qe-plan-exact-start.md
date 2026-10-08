# Record the exact-start probe

Status: In Development
Owner roles: Quality Engineer
Last updated: 2026-10-08

## Objective

Record the merged exact-start observation in the two-node QE plan. PR #101 is
already on main.

## Scope and non-goals

Docs only. The sentence states that an exact interval start spends the
approved ASK once, reads context once, and leaves the SQL row released. The
following handle does not read context again.

Non-goals: new tests, a production change, a replay window, and Issue #11 or
Issue #13 acceptance. The two-process restart evidence box stays unchecked.

## Requirements and acceptance criteria

- The QE plan names the exact-start observation as already on main.
- The note does not say the probes accept Issue #13.
- No Human Product Owner box is checked.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. D5 includes the start instant.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

The spend `recordedAt` equals the interval start. That does not add the
interval to the audit record.
