# Record the revoked-relationship probe in preparation

Status: In Development
Owner roles: Engineering Coordinator
Last updated: 2026-10-08

## Objective

Stop the two-node preparation note from saying that the revoked-relationship restart probe and the thin CLI are still unimplemented.

## Scope and non-goals

Docs only. `docs/modules/two-node-mvp/preparation.md` is the file. The 2026-10-07 record below the later-resolution section stays in place.

Non-goals: a new test, a production change, a replay window, checking the two-process restart evidence box, and Issue #13 acceptance.

## Requirements and acceptance criteria

- The later-resolution section names PR #85 as the second process that loads the revoked row.
- It names PR #63 as the argv adapter whose only command is `request`.
- Replay, whole-module messaging acceptance, and Human Product Owner acceptance stay open.
- Engineering Accepted is not checked.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. Relationship revoke still does not invalidate an unreleased approval.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

The historical scenario text still contains the 2026-10-07 `TBD-PO` sentences. Those sentences are a record. They are not open gates.
