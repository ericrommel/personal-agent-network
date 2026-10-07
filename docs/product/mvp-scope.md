# MVP Scope

## Goal

Prove that two independently controlled Personal Agent nodes can exchange a useful availability result derived from the target owner's simulated private context, while both owners retain understandable control and only the authorized result crosses the boundary.

## In scope

- Distinct Human Identity and Agent Identity records.
- Permission-aware discovery returning a minimal agent reference.
- Preconfigured relationships and an `availability` skill.
- Deterministic `ALLOW`, `ASK`, and `DENY` policy decisions.
- Structured, authenticated, replay-resistant requests between two nodes.
- Simulated private availability context and boolean result projection.
- Explicit, request-bound owner approval for `ASK`.
- Permission revocation and a final authorization check before disclosure.
- Privacy-preserving audit events and a thin local demonstration surface.

## Out of scope

- Real calendars, LLMs, AI-provider accounts, or production identity providers.
- Arbitrary chat, file transfer, tools, actions, or free-form skill execution.
- A global/federated directory, social network, or multi-party coordination.
- Custom cryptography, identity standards, A2A replacement, or MCP replacement.
- Production deployment, high availability, account recovery, billing, or mobile apps.
- A reusable policy language beyond the approved availability scenarios.

## Success boundary

The final MVP evidence must exercise two separately configured node instances through the public contract. The receiver alone authorizes access, private context remains local, and the caller sees only the permitted boolean plus safe protocol metadata.

This scope does not by itself authorize a slice that crosses a Reserved Product Decision. Modules proceed under `docs/engineering/development-process.md`. Human Product Owner review is asynchronous. Open decisions below block only the behavior they name.

## Product decisions and their current state

1. Discovery lookup and indistinguishable negative results are accepted with Privacy-Preserving Discovery, Issue #6.
2. Availability instant versus half-open interval, timezone/DST, horizon, duration, and query budget remain reserved. Boolean output is already required. See Product Review Queue PRQ-004. Issue #10 owns interpretation.
3. Whether MVP purpose is fixed to `availability_check` or supplied by the owner or requester remains reserved. See PRQ-003.
4. ASK interaction remains reserved: approval channel, information shown to the owner, expiry, notification or polling, rejection, and duplicate behavior. See PRQ-006.
5. Revocation behavior for pending approvals and computed-but-undelivered results remains reserved. Recommendation: invalidate both, with no attempt to retract delivered results. See PRQ-007.
6. Relationships are pre-seeded for this module. The Human Product Owner approved that on Issue #7. Invitation and acceptance stay out of scope.
7. Audit inspect, export, retention, and deletion authority remain reserved. Derived results stay omitted by default. See PRQ-008.
8. The demonstration surface remains reserved. Recommendation: two processes and a thin local API or CLI. See PRQ-009.

Agent credential technology, replay windows, database driver, and CI implementation details remain engineering/security decisions unless they change these product semantics.
