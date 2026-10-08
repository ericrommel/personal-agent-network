# Integrated acceptance oracles

Status: Engineering Accepted
Owner roles: Backend Engineer, Security & Privacy Engineer, Quality Engineer
Last updated: 2026-10-08

## Objective

Close the Issue #13 acceptance gaps that the merged two-process mutual-TLS demonstration does not yet show.

## Scope and non-goals

In scope: extend `tests/integration/durable-ingress-demo.test.ts` and the listener it spawns. The listener receives one private busy interval. The same demonstration rejects a stale envelope and a future envelope, rejects a second client certificate bound to the recipient, and denies after the skill advertisement is withdrawn. The withdrawn row is loaded by a new process while the relationship stays active and the stored effect stays ALLOW. The advertisement is restored before the relationship-revoke request.

Non-goals: a new probe file, a product UI, CLI grant or revoke, `src/main.ts` listening, a new replay window, titles or locations on private context, and checking Engineering Accepted inside this plan. Human Product Owner acceptance stays unchecked.

## Requirements and acceptance criteria

The oracles map to freshness, sender binding, withdrawn skill advertisement, and no raw private context on the public response or in the audit. Existing ALLOW, ASK, DENY, permission revoke, relationship revoke, replay, malformed input, recipient binding, and restart behavior stay in the same test.

## Decisions and ADRs

ADR-0007 supplies the freshness bounds. No new Reserved Product Decision. The private context remains the accepted busy-interval model.

## Security and privacy considerations

The recipient certificate must not receive the caller's ALLOW. A non-fresh envelope must not reach the handler. The busy interval must not appear in the HTTP body, the audit JSON, or the listener output. Public denial stays `{ outcome: "unavailable" }`.

## Implementation sequence

1. Pass the busy interval into the listener through the existing environment.
2. Add the four oracles to the current demonstration.
3. Keep the relationship-revoke oracle unconfounded by restoring the advertisement first.

## Developer tests

`tests/integration/durable-ingress-demo.test.ts` is the developer test. `npm.cmd run verify` is the local gate. GitHub Actions quality is the live PostgreSQL evidence when Docker is unavailable locally.

## QE and acceptance verification

Independent Security and Quality review follows a green required CI result on this head. This plan does not check Engineering Accepted.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

A skipped local database run is not live evidence. The authorized boolean is false because the private interval overlaps the requested interval.

## Progress

- [x] 2026-10-08: Oracles added on `feat/integrated-acceptance-oracles`. Review and CI are still open.
- [x] 2026-10-08: Quality executed the demonstration, then `ask-advertisement-restore` hit the 5 second default while waiting on the shared locks. The Vitest timeout is 30 seconds.
- [x] 2026-10-08: PR #111 squash-merged as `7d47568533f8e2216ddcdd13d5c969d905fb6e08`. Quality on `55a65f29a7146a853cab2e064e0de09ba4d3c0a3` passed, including the demonstration in 6345ms.

## Discoveries and decision log

The merged demonstration already proved two processes, mutual TLS, recipient binding, replay, ALLOW, ASK, DENY, permission revoke, relationship revoke, malformed input, restart, and the minimized public object. It did not hold a private interval, reject a non-fresh envelope on the wire, present a second sender certificate, or withdraw the advertisement.

## Handoff and completion evidence

PR #111 is merged. Security and Quality found no blocking defect. Quality job 113553162108 executed the demonstration. The Human Product Owner accepted that demonstration on 2026-10-08. This plan did not grant the acceptance.
