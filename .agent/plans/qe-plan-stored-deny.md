# Record the stored DENY probe

Status: In Development
Owner roles: Quality Engineer
Last updated: 2026-10-08

## Objective

Record the merged stored-DENY observation in the two-node QE plan. PR #97 is
already on main. The plan previously named the owner rejection and omitted
this probe.

## Scope and non-goals

Docs only. The sentence states that a stored active DENY effect denies the
exact request, reads no context, creates no approval row, and leaves that
permission active DENY.

Non-goals: new tests, a production change, a replay window, and Issue #8 or
Issue #13 acceptance. The two-process restart evidence box stays unchecked.

## Requirements and acceptance criteria

- The QE plan names the stored DENY observation as already on main.
- The note does not say the probes accept Issue #13.
- No Human Product Owner box is checked.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. D1 stored effect is unchanged.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

This change does not include the other-requester probe. That observation is
separate, and this note does not record it.
