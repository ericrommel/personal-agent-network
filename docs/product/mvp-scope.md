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

This scope does not authorize implementation. Modules proceed only through the process and Product Owner gates in `docs/engineering/development-process.md`.

## Product Owner decisions before affected modules

1. Who may discover whom, which lookup identifier is used, and whether absent and non-discoverable identities must be externally indistinguishable.
2. Whether availability is an instant or half-open interval, its timezone/DST rules, maximum horizon/duration, query budget, and whether output is strictly boolean.
3. Whether MVP purpose is fixed to `availability_check` or owner/requester supplied.
4. ASK interaction: approval channel, information shown to the owner, expiry, notification/polling, rejection, and duplicate behavior.
5. Revocation behavior for pending approvals and computed-but-undelivered results; recommendation: invalidate both, with no attempt to retract delivered results.
6. Whether relationships are pre-seeded for the MVP (recommended) or require an invitation/acceptance flow.
7. Who may inspect/export/delete audit records, retention duration, and confirmation that derived results are omitted by default.
8. Demonstration surface (API/CLI or minimal UI) and whether the final MVP must run two processes; recommendation: two instances for acceptance.

Agent credential technology, replay windows, database driver, and CI implementation details remain engineering/security decisions unless they change these product semantics.
