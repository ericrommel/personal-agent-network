# Privacy-Preserving Discovery Specification

## Status and objective

This document is the preparation package for Issue #6. It is **not authorization to implement Discovery**. The module will be ready for development only after the Human Product Owner resolves the decisions below and explicitly approves the Issue gate.

Discovery allows an authenticated Personal Agent to submit a human-friendly lookup identifier and, when the target owner has made that identifier discoverable to that caller, receive the minimum opaque Agent reference needed by a later messaging module. Discovery proves neither human identity nor ownership and creates no relationship, permission, skill access, context access, or execution authority.

## Scope

### In scope

- One exact-match, human-friendly lookup identifier for the MVP.
- Caller-specific, preconfigured discoverability.
- Resolution to one active target Agent Identity.
- A minimal, versioned success result.
- An externally uniform negative result for unknown, non-discoverable, disabled, and otherwise ineligible targets.
- Product-level request bounds that reduce enumeration and inference.
- Privacy-safe audit signals for later use by the Audit module.

### Out of scope

- Public search, prefix search, suggestions, directory browsing, or bulk lookup.
- Relationship invitation, contact synchronization, ownership transfer, or profile retrieval.
- Credential issuance or authentication implementation.
- Skills, policy execution, messaging, availability, approval, or context access.
- A globally federated directory or production routing/discovery protocol.

## Proposed product contract

The following is the Product Analyst recommendation and remains subject to the decisions in the Product Owner gate.

### Lookup

- The caller is an authenticated, active Agent Identity supplied by a trusted authentication boundary; a payload claim is not sufficient.
- The MVP lookup identifier is an email address supplied as an exact match. The service normalizes it for comparison using one documented rule and never exposes its canonical stored form.
- A target owner has a preconfigured allowlist of caller Agent Identities for each discoverable identifier. No invitation workflow is included.
- One identifier maps to at most one active target Agent Identity. Ambiguous or ineligible mappings produce the same negative outcome as no mapping.

### Result

A successful lookup returns only a versioned opaque Agent reference:

```json
{
  "contract": "pan.discovery-result/v1",
  "agentReference": "<opaque-reference>"
}
```

`agentReference` is a non-semantic external reference for a later module, not an internal Agent Identity ID or a bearer capability. Its lifetime, rotation, and caller-correlation semantics require Product Owner approval. The response does not include human ID, email, name, profile, provider, owner, status, endpoint, relationship, skills, policy, context, or the reason it was discoverable. Transport routing metadata is excluded until the messaging architecture demonstrates a need and receives review.

### Negative and abuse behavior

- Unknown, known-but-not-discoverable, disabled, ambiguous, and malformed lookups have one public status, body shape, header/retry behavior, and documented timing objective. Internal reason codes may differ only in access-controlled telemetry.
- The contract does not claim perfectly constant-time behavior. Automated verification uses bounded timing-distribution checks plus semantic equality; security review determines acceptable tolerance.
- Requests are exact-match only, individually bounded, rate limited by authenticated caller and source, and subject to an aggregate rolling query budget. Target-specific counters are not exposed or used unless a later privacy review proves they cannot become a target-existence oracle. Exceeding a bound produces no partial result or identity signal.
- Repeating the same successful lookup does not create relationships, grants, or additional disclosure.

## Requirement traceability

| Requirement | Module contribution | Verification target |
|---|---|---|
| `FR-002` | Resolve only for an eligible caller and return one minimal opaque reference without side effects. | `AC-DIS-001` scenarios 1, 2, and 5 |
| `SEC-001`, `SEC-002` | Consume a trusted authenticated principal and fail closed without one. Authentication itself is a dependency, not owned here. | `AC-DIS-001` scenario 4 |
| `SEC-012`, `SEC-014`, `SEC-018` | Uniform negative behavior, exact bounded input, and abuse controls. | `AC-DIS-001` scenarios 2–4 and 6 |
| `PRV-001`, `PRV-006` | Limit success fields and prevent negative responses from exposing existence or policy state. | `AC-DIS-001` scenarios 1–3 |
| `PRV-008` | Limit repeated and composable lookup attempts. | `AC-DIS-001` scenario 6 |
| `OBS-001`, `PRV-004` | Produce correlation and safe reason data without identifier values or response references in general logs. | `AC-DIS-001` scenario 7 |
| `REL-003` | Fail closed on invalid input or unavailable required policy, directory, budget, reference, or event dependencies. | `AC-DIS-001` scenarios 3, 4, and 6; `AC-VAL-001` |
| `DEV-004` | Version the request/result contract and reject unexpected fields. | Contract review and tests under `AC-DEV-003` |

## Dependencies and boundaries

- Reuse the Identity Model's `AgentIdentityId`, active-status invariant, and future trusted `AuthenticatedAgentPrincipal`; do not serialize its local identity snapshots as discovery responses.
- Caller authentication and credential binding must be available before production use. A test-only trusted principal factory may be used only if the implementation plan and configuration make it impossible in production.
- Discoverability configuration belongs to Discovery. It is not a Relationship or skill permission and must not be generalized into either future model.
- Discovery is proposed to emit a minimized event through a required port and require acknowledgement before disclosure. The PO gate must confirm that fail-closed recommendation. Durable storage, operator access, retention, export, and deletion belong to the later Audit module.
- Persistence, public API shape, rate-limiting mechanism, and identifier protection at rest are engineering decisions provided they preserve the approved observable behavior.

## Product Owner gate

The Product Owner must approve or replace each recommendation:

1. **Caller audience:** only authenticated, active Agent Identities explicitly preconfigured by the target owner may resolve the target. Anonymous and merely authenticated-but-unlisted callers cannot. This module would prove that boundary with synthetic trusted evidence through a test port; it would not provide deployable authentication or externally usable Discovery.
2. **Lookup identifier:** exact-match email is the sole MVP identifier. Approve its public validity model: syntax, accepted encoding, case/canonicalization behavior, ambiguous Unicode/aliases, and whether exact numeric length bounds may be set by Security/engineering. Provider-specific transformations such as dot or plus removal are not recommended.
3. **Uniform negative contract:** unknown, non-discoverable, disabled, ambiguous, and malformed lookups are externally indistinguishable in status, body, headers, and retry behavior and have a documented timing objective. Approve whether Security/QE may set the measurement environment, sample method, numeric tolerance, and blocking threshold without changing that public contract.
4. **Minimal success fields:** return only contract version and an opaque external Agent reference; approve its lifetime, rotation, and caller-correlation semantics. Exclude the internal Agent Identity ID and endpoint/routing metadata until Messaging.
5. **Configuration:** discoverability is pre-seeded for the MVP; invitation/acceptance and owner-facing management UI are deferred.
6. **Abuse policy:** approve caller-, source-, and aggregate/global budget dimensions, non-revealing recovery/retry behavior, restart/reset expectations, and whether owners receive abuse visibility. Target-specific budgets are not recommended because they can become an oracle. Approve whether Security/engineering may set configurable numeric limits and windows without changing the public contract. An in-memory implementation proves process-local atomicity only and must not claim durable or multi-instance resistance.
7. **Discovery event:** approve the recommendation that a minimized event-port acknowledgement is required before successful disclosure. This module emits the event but does not provide durable audit storage, querying, access control, retention, export, or deletion.

The Issue should remain **In Preparation** until these are resolved. After supporting architecture, security, QE, and ExecPlan evidence is complete, the coordinator may post the readiness package, mark Issue #6 **Ready for PO**, and stop for explicit Human Product Owner authorization.
