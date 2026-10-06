# Privacy-Preserving Discovery Specification

## Status and objective

This document defines the bounded Discovery module approved for development by the Human Product Owner on Issue #6. Implementation remains limited to this specification and must still pass implementation, security, QE, review, and final Product Owner acceptance gates.

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

## Approved product contract

### Lookup

- The caller is an authenticated, active Agent Identity supplied by a trusted authentication boundary and explicitly listed in the target owner's pre-seeded discoverability grant. A payload claim, anonymous caller, or authenticated-but-unlisted caller is not eligible.
- Email is the sole MVP lookup identifier. Input MUST be ASCII, contain no surrounding or internal whitespace, and match exactly after the entire ASCII address is lowercased. Non-ASCII/Unicode input is rejected. The module MUST NOT remove dots or plus tags, expand aliases, apply provider-specific rules, or perform fuzzy equivalence. Security/engineering may set standards-based numeric length and validation bounds without changing these semantics.
- Discoverability grants are pre-seeded. No invitation, acceptance, relationship creation, or owner-facing management UI is included.
- One identifier maps to at most one active target Agent Identity. Ambiguous or ineligible mappings produce the same negative outcome as no mapping.

### Result

A successful lookup returns only a versioned opaque Agent reference:

```json
{
  "contract": "pan.discovery-result/v1",
  "agentReference": "<opaque-reference>"
}
```

`agentReference` is a non-semantic, caller-scoped external reference for a later module, not an internal Agent Identity ID or bearer capability. Different callers resolving the same target MUST NOT receive a globally correlatable stable reference. A reference may remain stable only for the lifetime of its specific caller/target discoverability grant. It MUST become unusable immediately when that grant is revoked or the target becomes ineligible, and a later recreated grant MUST receive a rotated reference. Later messaging and authorization must independently authenticate and authorize the caller.

The response does not include human ID, email, name, profile, provider, owner, status, endpoint, relationship, skills, policy, context, routing metadata, or the reason it was discoverable.

### Negative and abuse behavior

- Unknown, non-discoverable, disabled, ambiguous, malformed, and otherwise ineligible lookups have one public status family, body shape, header behavior, and retry behavior. Internal reason codes may differ only in privacy-safe telemetry.
- Perfect constant-time behavior is not required. Security/QE own the measurement environment, sample method, numeric tolerance, and blocking thresholds without changing the public privacy contract.
- Requests are exact-match only and individually bounded. Layered caller, source/network, and aggregate/global budgets apply. Target-specific counters are prohibited unless a later privacy review explicitly approves them. Security/engineering own configurable numeric limits, windows, and atomicity mechanisms.
- The MVP budget may be process-local/in-memory and reset on restart. It MUST NOT be represented as durable or multi-instance protection. Recovery and retry behavior MUST NOT reveal which limiter fired or whether a target exists.
- Owners may receive only coarse, privacy-safe abuse events without raw lookup identifiers, target-existence signals, or sensitive per-target details.
- Repeating the same successful lookup does not create relationships, grants, or additional disclosure.

## Requirement traceability

| Requirement | Module contribution | Verification target |
|---|---|---|
| `FR-002` | Resolve only for an eligible caller and return one minimal opaque reference without side effects. | `AC-DIS-001` scenarios 1, 2, 5, and 6 |
| `SEC-001`, `SEC-002` | Consume a trusted authenticated principal and fail closed without one. Authentication itself is a dependency, not owned here. | `AC-DIS-001` scenario 4 |
| `SEC-012`, `SEC-014`, `SEC-018` | Uniform negative behavior, exact bounded input, and abuse controls. | `AC-DIS-001` scenarios 3, 4, and 7 |
| `PRV-001` | Limit success fields and keep references caller-scoped. | `AC-DIS-001` scenarios 1, 2, and 6 |
| `PRV-006` | Prevent negative responses from exposing existence or policy state. | `AC-DIS-001` scenario 3 |
| `PRV-008` | Limit repeated and composable lookup attempts. | `AC-DIS-001` scenario 7 |
| `SEC-017`, `OBS-001`, `PRV-004` | Acknowledge minimized correlation, actor, outcome, and control data without identifier values or response references. | `AC-DIS-001` scenario 8 |
| `REL-003` | Fail closed on invalid input or unavailable required policy, directory, budget, reference, or event dependencies. | `AC-DIS-001` scenarios 3, 4, 7, and 8; `AC-VAL-001` |
| `DEV-004` | Version the request/result contract and reject unexpected fields. | Contract review and tests under `AC-DEV-003` |

## Dependencies and boundaries

- Reuse the Identity Model's `AgentIdentityId`, active-status invariant, and future trusted `AuthenticatedAgentPrincipal`; do not serialize its local identity snapshots as discovery responses.
- Caller authentication and credential binding must be available before production use. A test-only trusted principal factory may be used only if the implementation plan and configuration make it impossible in production.
- Discoverability configuration belongs to Discovery. It is not a Relationship or skill permission and must not be generalized into either future model.
- Discovery MUST use one disclosure-commit port that atomically revalidates the exact current grant, target eligibility, and reference while persisting and acknowledging the minimized success event. Only an exact successful commit may release the reference, with no later asynchronous step before return. Commit failure or an indeterminate result fails closed. Durable storage, operator access, retention, querying, export, and deletion belong to the later Audit module.
- Persistence, public API shape, rate-limiting mechanism, and identifier protection at rest are engineering decisions provided they preserve the approved observable behavior.

## Approval and implementation boundary

The Human Product Owner approved all seven product decisions on Issue #6 and authorized this bounded module for development. Synthetic trusted caller evidence through a test-only port is permitted, but production code cannot construct trusted principals from payload claims and this module does not claim deployable authentication.

Approval does not include Relationships, Messaging, general Authorization/Policy, public transport, production authentication, durable or multi-instance abuse enforcement, a global/federated directory, or any other later module. Final completion still requires the normal security, QE, review, and Human Product Owner acceptance gates.
