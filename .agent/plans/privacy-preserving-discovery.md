# Privacy-Preserving Discovery

Status: Ready for PO
Owner roles: Engineering Coordinator, Product Analyst, Software Architect, Security & Privacy Engineer, Backend Engineer, Quality Engineer
Last updated: 2026-10-04
Tracking: GitHub Issue #6; roadmap Issue #15

## Objective

Prepare and, only after explicit Human Product Owner approval, implement a discovery boundary that resolves an approved human-facing identifier to the minimum opaque Agent reference without creating relationship, permission, or trust.

## Scope and non-goals

Preparation covers the discovery contract, visibility semantics, input normalization, minimal disclosure, enumeration resistance, abuse controls, architecture impact, and test design. Functional code, public HTTP transport, authentication mechanisms, relationship workflows, skill authorization, messaging, persistence, and a public/global directory are excluded until separately approved.

## Requirements and acceptance criteria

Primary traceability: `FR-002`, `SEC-012`, `SEC-014`, `SEC-018`, `PRV-001`, `PRV-006`, `PRV-008`, `REL-003`, `DEV-003`, and `DEV-004` to `AC-DIS-001`, `AC-VAL-001`, `AC-QE-001`, and `AC-DEV-003`. The module specification owns the exact bounded claims and must not claim authentication, transport, or general authorization coverage.

## Context and affected components

The accepted Identity Model supplies opaque, runtime-distinguishable Human and Agent identifiers plus a nominal authenticated-agent principal contract. Discovery will be a separate module under `src/modules/discovery/`; it may depend on public Identity contracts but must not add discovery fields or visibility policy to Identity records. Adapters and durable storage remain outside this module unless the approved scope later requires them.

## Decisions and ADRs

Preparation must determine whether the discovery visibility contract or lookup identifier creates a consequential interoperability decision requiring an ADR. No HTTP framework, identity protocol, database library, or cryptographic mechanism will be selected merely for this module.

## Security and privacy considerations

Unknown, unauthorized, and non-discoverable targets must not disclose protected state through bodies, reason codes, logs, or avoidable response differences. Remote lookup input is untrusted and bounded. Successful results are allowlisted and minimal. Discovery cannot create a relationship, permission, authenticated principal, or execution capability. Rate and query budgets need a PO-approved product boundary and an engineering enforcement design.

## Implementation sequence

1. Complete the readiness specification, threat/architecture analysis, test plan, and traceability.
2. Record recommendations and unresolved product decisions on Issue #6; move it to `Ready for PO` and stop.
3. After explicit Human PO approval, update this plan to `Approved for Development` and create a focused implementation branch if needed.
4. Implement pure domain/application contracts and developer tests before introducing adapters.
5. Add only the minimum adapter or persistence seam authorized by the approved scope.
6. Run independent architecture, security/privacy, and QE verification; then request final PO acceptance.

## Developer tests

The Backend Engineer owns table-driven unit tests, type-boundary tests, component tests for repository/policy failures, serialization allowlist tests, and negative cases for enumeration, malformed/oversized identifiers, unavailable dependencies, and accidental authority creation. Security-sensitive decision paths require complete branch coverage.

## QE and acceptance verification

QE independently verifies risk coverage, traceability, failure uniformity, synthetic fixtures, coverage configuration, and that tests exercise public contracts rather than internal implementation details. Timing observations are supporting evidence only and must not claim mathematically identical execution time.

## Validation commands

```bash
npm ci
npm run verify
npm run build
npm audit --audit-level=high
```

The preparation PR additionally requires documentation link/consistency review and normal CI security gates.

## Risks, assumptions, and open questions

- PO decision: discovery audience and authorization basis.
- PO decision: MVP human-facing lookup identifier; email is the current candidate.
- PO decision: whether unknown and known-but-not-discoverable outcomes are externally indistinguishable; recommendation: yes.
- PO decision: the external `agentReference` disclosure plus its lifetime, rotation, and caller-correlation semantics; routing metadata remains excluded.
- PO decision: whether visibility/relationships are preconfigured; recommendation: preconfigured, with no invitation workflow.
- PO decision: product-level lookup/query limits and owner visibility into abuse.
- PO decision: budget restart/reset expectations and acceptance of process-local enforcement if persistence remains deferred.
- PO decision: whether minimized event-port acknowledgement is required before disclosure; durable audit semantics remain deferred.
- Engineering risk: an email lookup can leak registration or policy state through validation, timing, throttling, logging, or error differences.
- Assumption: a trusted ingress will eventually construct the authenticated principal; this module will not implement that ingress.

## Progress

- [x] 2026-10-04: Identity Model accepted and merged.
- [x] 2026-10-04: Issue #6 created and marked `In Preparation` by the Human Product Owner.
- [x] 2026-10-04: Governance PR #16 approved and merged.
- [x] 2026-10-04: Completed specification, traceability, architecture/threat analysis, and QE test plan.
- [x] 2026-10-04: Independent Product/traceability and Architecture/Security reviews passed after reconciliation.
- [ ] Post the readiness PR and evidence package to Issue #6, mark `Ready for PO`, and stop.

## Discoveries and decision log

- 2026-10-04: Preparation may proceed in parallel, but functional behavior remains gated.
- 2026-10-04: Discovery remains independent from relationship, skill, authorization, messaging, and authentication implementation.

## Handoff and completion evidence

Readiness documents and specialist reviews are complete. Local evidence: `npm run verify` passed with 15 tests and 100% configured coverage; `npm run build` passed; `npm audit --audit-level=high` reported zero vulnerabilities; `git diff --check` passed. The readiness PR, CI results, and Issue #6 evidence comment complete the handoff. Functional implementation remains unauthorized.
