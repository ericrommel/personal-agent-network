# Record the other-requester probe

Status: In Development
Owner roles: Quality Engineer
Last updated: 2026-10-08

## Objective

Record the merged other-requester observation in the two-node QE plan. PR #99 is already on main.

## Scope and non-goals

Docs only. The sentence states that another requester, with a separate active relationship and ASK permission, does not spend that approved ASK, reads no context, and leaves the row approved for the bound requester. The bound requester then spends it once.

Non-goals: new tests, a production change, a replay window, and Issue #11 or Issue #13 acceptance. The two-process restart evidence box stays unchecked.

## Requirements and acceptance criteria

- The QE plan names the other-requester observation as already on main.
- The note does not say the probes accept Issue #13.
- No Human Product Owner box is checked.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. The approval stays bound to the original requester.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

The other requester's own ASK permission does not transfer the stored approval. The public response stays `{ outcome: "unavailable" }`.
