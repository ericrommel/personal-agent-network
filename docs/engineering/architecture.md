# PAN Architecture

## Architectural style

PAN is a strict TypeScript modular monolith using ports and adapters. One independently controlled PAN node represents one owner boundary; end-to-end tests run two configured nodes. Components remain in-process except cross-node transport. This proves the product hypothesis without premature services, brokers, or orchestration infrastructure.

Node.js 22.12+ (below 25), npm lockfiles, strict TypeScript, and PostgreSQL are the selected direction. Versioned REST/JSON with OpenAPI/JSON Schema is the leading transport proposal, but its protocol ADR and Fastify/schema-library evaluation belong to the first approved HTTP module. No runtime dependency is added during bootstrap. PostgreSQL enters only with transactional state and migrations.

## Domain and component boundaries

- **Human Identity:** owner identity and verified human-facing identifiers.
- **Agent Identity:** durable agent principal, ownership/status, and credential references.
- **Discovery:** privacy-aware resolution to a minimal routing reference; never grants trust.
- **Relationships:** lifecycle between parties; never implies skill permission.
- **Skills:** versioned typed capability contracts; advertisement is not authorization.
- **Authorization / Policy:** deterministic `ALLOW`/`ASK`/`DENY` decision using authenticated identity and current state. Remote text and LLMs have no authority.
- **Messaging:** authenticates and validates bounded envelopes, enforces freshness/idempotency, and routes requests; it cannot mutate policy.
- **Context Boundary:** local-only least-privilege port to simulated/private data and deterministic derivation.
- **Approval:** durable, expiring, single-use decision bound to an exact request and policy version.
- **Audit:** append-oriented redacted security events with correlation and reason codes.
- **External AI Integration:** replaceable untrusted adapter outside authorization, tool, and disclosure enforcement.

These concepts MUST NOT collapse into a generic `Agent` object.

## Request path

```text
untrusted network
  -> authentication
  -> envelope validation / replay guard
  -> deterministic policy
       -> DENY: generic response
       -> ASK: bound pending approval
       -> ALLOW: context port -> skill derivation -> disclosure schema
  -> final revocation check
  -> response
```

Every transition emits a minimized audit event. Private context never enters the transport contract. Authorization happens in the receiving node and does not trust sender assertions.

## Trust boundaries

1. Remote network/agent to ingress: spoofing, tampering, replay, injection, and abuse.
2. Discovery caller to identity directory: enumeration and profile leakage.
3. Authenticated principal to relationship/policy state: confused-deputy and stale authority.
4. Orchestration to local context: least privilege and minimal disclosure.
5. Owner UI to approval endpoint: human authentication and decision integrity.
6. Application to database/audit sink: integrity, access, retention, and log leakage.
7. PAN to external AI/tools: prompt injection, data egress, and provider retention.
8. Build/dependency supply chain to runtime.

## Planned source shape

Approved modules will live under `src/modules/<boundary>/` with domain, application, and ports separated as needed; adapters live under `src/adapters/`. Shared code is limited to typed identifiers, clock, result/error primitives, and schema utilities. Dependency rules must prevent messaging or external-AI adapters from reaching private-context repositories directly.

## Module sequence

0. Foundation and contracts (this bootstrap; no product behavior).
1. Identity Model: Human/Agent separation, ownership/status, authenticated-principal contract.
2. Privacy-preserving Discovery.
3. Relationships and revocation state.
4. Skills and deterministic Policy kernel.
5. Authenticated Messaging and replay protection.
6. Simulated Context Boundary and availability derivation.
7. Approval lifecycle.
8. Audit query/retention capabilities (event vocabulary evolves with prior modules).
9. Thin two-node demonstration.
10. External AI adapter only after the deterministic path is proven.

## Open decisions

Agent authentication/onboarding, discovery publication, exact replay window/clock skew, approval lifecycle, revocation consistency, audit retention/integrity, and rate limits require decisions before their corresponding modules. Adopt mature OAuth/OIDC/TLS mechanisms after a focused spike; do not invent message signing, identity, A2A, or MCP standards.
