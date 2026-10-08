# Two-node MVP demonstration

Status: In Preparation
Owner roles: Engineering Coordinator, Quality Engineer, Security and Privacy Engineer, Backend Engineer
Last updated: 2026-10-08
Tracking: Issue #13. D7 / PRQ-009. This plan does not accept the demonstration.

## Objective

Keep the Issue #13 evidence bar current after D1 through D8. Record which probes exist and which observations are still required.

## Scope and non-goals

In scope: `docs/modules/two-node-mvp/qe-plan.md`.

Out of scope: harness code, a replay window, a product UI, Human Product Owner acceptance, and any claim that PR #62 or PR #63 is the demonstration.

## Requirements and acceptance criteria

The suite still owes AC-MSG-001. Component tests exercise AC-AUTH-001, AC-AUTH-002, AC-APR-001, AC-APR-002, AC-REV-001, AC-PRV-001, and AC-AUD-001 inside one process. PostgreSQL adapters and two-process probes cover relationship revoke, permission invalidation, approval spend, expiry, and advertisement withdraw. Those probes do not satisfy AC-MSG-001 and do not accept Issue #13. ADR-0004 still excludes an all-in-memory run.

## Context and affected components

`preparation.md` keeps the 2026-10-07 scenario text. The QE plan is the 2026-10-08 strategy and does not delete that history.

## Decisions and ADRs

No new ADR. The replay window stays unchosen. ADR-0004 still excludes an all-in-memory run from acceptance. ADR-0006 already selected node-postgres for the relationship adapter.

## Security and privacy considerations

Acceptance must show a loaded revoked row, uniform denial, no boolean in the audit, and no second disclosure on replay. A component probe that injects a principal is not SEC-001 ingress evidence.

## Implementation sequence

1. Publish this strategy.
2. Finish the process-local composition and the argv adapter as probes.
3. Durable approval, audit, permission, and advertisement stores are injected. The node does not open a pool. Do not add a fire-and-forget invalidation.
4. Keep adding bounded two-process observations. Do not treat them as the demonstration.
5. Add replay rejection only after the window is chosen in a later engineering decision.

## Developer tests

None in this change.

## QE and acceptance verification

The QE plan is the strategy. Executing it is later work. Independent QE review of the strategy text is required before this note is treated as the suite oracle.

## Validation commands

Docs only. CI `quality` on the pull-request head.

## Risks, assumptions, and open questions

No new Reserved Product Decision. The unset replay window blocks only the replay scenario.

## Progress

- [x] 2026-10-08: strategy drafted from the resolved decisions and the durability gate.
- [ ] QE review of the strategy.
- [ ] Two-process restart evidence.
- [ ] Replay scenario, after a window exists.

## Discoveries and decision log

- 2026-10-08: Do not encode a replay number in an acceptance test from this plan.
- 2026-10-08: Durable adapters and two-process probes are on main. The two-process restart evidence box stays open because it is the demonstration, not those probes.

## Handoff and completion evidence

Issue #13 stays In Preparation. Do not check Engineering Accepted or Human Product Owner acceptance from this document.
