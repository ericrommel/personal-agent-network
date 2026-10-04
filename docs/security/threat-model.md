# PAN MVP Threat Model

## Scope and assets

This model covers discovery, cross-agent availability requests, policy decisions, approval, simulated context, disclosure, and audit. Assets include identity bindings, relationships, grants/revocation, approvals, private context, derived results, credentials, message freshness/integrity data, audit records, and service availability.

Actors include both owners, local and remote agents, discovery and transport providers, approval UI/operator, context and audit services, external AI providers, malicious unknown or authenticated agents, compromised legitimate/local agents, and supply-chain attackers.

## Principal threats and mitigations

| Threat | Required mitigation | Requirements |
|---|---|---|
| Spoofing/impersonation | Bind a mature authenticated credential to Agent Identity at ingress; rotate/revoke credentials; fail closed | SEC-001–SEC-003 |
| Email/identity enumeration | Permission-aware discovery, generic responses/timing targets, opaque references, rate limits | SEC-012, SEC-018, PRV-001, PRV-006 |
| Tampering/replay | TLS, integrity binding, request ID, sender/recipient, issued/expiry time, replay store | SEC-006–SEC-007, REL-002 |
| Authorization bypass/confused deputy | Current server-side policy; deny by default; no ambient context/tool authority | SEC-003–SEC-005, SEC-009–SEC-010 |
| Prompt injection | Treat remote/model text as data; validate structured fields; keep models outside enforcement | SEC-004, SEC-013 |
| Excess disclosure/inference | Narrow context query, deterministic derivation, output allowlist, generic errors, query budgets | SEC-011–SEC-012, PRV-002–PRV-003, PRV-008 |
| Approval forgery/race | Bind exact immutable request/policy/expiry; authenticate owner; single-use transaction; final re-check | SEC-008–SEC-009 |
| Compromised agent | Least privilege, bounded skills/scopes, rapid revocation, audit/anomaly signals; isolate secrets/context from model prompts | SEC-009–SEC-014 |
| Audit/log leakage | Classified allowlist, redaction, access control, retention/deletion, correlation without payloads | SEC-017, PRV-004–PRV-005 |
| Secret/default exposure | Secret store/env, fake examples, rotation, redaction, startup checks, secret scanning | SEC-015–SEC-016 |
| Dependency compromise | Minimal locked dependencies, review, vulnerability/SAST scanning, time-bounded exceptions | SEC-016 |
| Denial of service/approval spam | Schema/size/time bounds, per-principal/IP/target quotas, bounded queues and backpressure | SEC-012, SEC-014 |

## Required abuse tests

- Spoof sender identity, alter recipient/input/scope, use stale/future timestamps, or replay before/after approval and revocation.
- Enumerate known/unknown identifiers and compare status, body, timing, and throttling.
- Request a full calendar or inject instructions to grant permission, reveal context, ignore policy, or call a tool.
- Forge, alter, duplicate, expire, or approve as the wrong owner; revoke between decision and disclosure.
- Make policy/revocation storage unavailable or return malformed/oversized/deep input; verify bounded fail-closed behavior.
- Make context/model adapters return prompt-like or schema-extra fields; verify the egress filter prevents leakage.
- Inspect logs, traces, errors, and audit for raw context, messages, secrets, credentials, and derived results.
- Start a production configuration with example secrets or disabled authentication; verify refusal.

## Residual risk

A compromised target node can access its owner's local data; isolation and operational hardening reduce but cannot eliminate that risk. Even boolean availability can become sensitive through repeated probing. Query budgets, owner visibility, disclosure granularity, and retained audit data are Product Owner decisions.

## Decisions blocking affected modules

Before implementation, approve or ADR the relevant agent authentication lifecycle, discovery visibility/non-enumeration contract, policy precedence/versioning, replay window, ASK binding/expiry, revocation timing, context/egress schema, audit access/retention, and abuse limits.
