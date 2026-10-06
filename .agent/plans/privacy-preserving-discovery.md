# Privacy-Preserving Discovery

Status: Complete
Owner roles: Engineering Coordinator, Product Analyst, Software Architect, Security & Privacy Engineer, Backend Engineer, Quality Engineer
Last updated: 2026-10-06
Tracking: GitHub Issue #6; roadmap Issue #15; ADR-0005

## Objective

Implement the Human Product Owner-approved discovery boundary that resolves a canonicalized ASCII email to the minimum caller-scoped opaque Agent reference without creating relationship, permission, or trust.

## Scope and non-goals

Approved implementation covers exact lookup, pre-seeded caller/target discoverability grants, ASCII lowercase canonicalization, caller-scoped reference lifecycle, uniform negative behavior, layered process-local abuse controls, minimized event acknowledgement, and developer tests. Public HTTP transport, production authentication mechanisms, relationship workflows, skill authorization, messaging, durable persistence, and a public/global directory remain excluded.

## Requirements and acceptance criteria

Primary traceability: `FR-002`, `SEC-012`, `SEC-014`, `SEC-017`, `SEC-018`, `PRV-001`, `PRV-004`, `PRV-006`, `PRV-008`, `REL-003`, `OBS-001`, `DEV-003`, and `DEV-004` to `AC-DIS-001` scenarios 1–8, with bounded `AC-VAL-001`, `AC-QE-001`, and `AC-DEV-003` contributions. The module specification owns the exact bounded claims and must not claim authentication, transport, or general authorization coverage.

## Context and affected components

The accepted Identity Model supplies opaque, runtime-distinguishable Human and Agent identifiers plus a nominal authenticated-agent principal contract. Discovery will be a separate module under `src/modules/discovery/`; it may depend on public Identity contracts but must not add discovery fields or visibility policy to Identity records. Adapters and durable storage remain outside this module unless the approved scope later requires them.

## Decisions and ADRs

The approved Discovery contract is recorded by the module ADR owned by the architecture workstream. No HTTP framework, identity protocol, database library, or cryptographic mechanism is selected merely for this module.

## Security and privacy considerations

Unknown, unauthorized, non-discoverable, disabled, ambiguous, malformed, and otherwise ineligible targets share the approved public status family, body shape, headers, and retry behavior. Remote lookup input is untrusted, ASCII-only, whitespace-free, whole-address lowercased, and bounded; provider-specific or fuzzy transformations are prohibited. Successful results contain only the contract version and a caller-scoped `agentReference`. Discovery cannot create relationship, permission, authenticated principal, or execution authority. Caller, trusted-source/network, and aggregate/global budgets are process-local for MVP; target-specific counters are prohibited. One atomic disclosure commit must revalidate current grant/reference/target state and acknowledge the minimized success event before synchronous return.

## Implementation sequence

1. Implement pure domain/application contracts and developer tests for the seven approved decisions.
2. Add only the minimum in-memory/process-local adapters authorized by the approved scope.
3. Verify reference revocation/rotation, uniform negatives, layered budgets, event acknowledgement, and privacy-safe telemetry.
4. Run independent architecture, security/privacy, and QE verification.
5. Post evidence, move Issue #6 to `Ready for PO Acceptance`, and stop for explicit Human Product Owner acceptance.

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

## Approved decisions, risks, and assumptions

- Only authenticated, active, explicitly pre-seeded callers are eligible; synthetic trusted evidence is test-only and does not constitute deployable authentication.
- Email is the sole MVP identifier: ASCII only, no whitespace, whole-address lowercase matching, and no provider-specific, alias, or fuzzy transformation.
- All negative lookup classes share the approved public response family; Security/QE own statistical timing parameters.
- Success contains only contract version and caller-scoped `agentReference`; revocation/ineligibility invalidates it immediately, and recreated grants rotate it.
- Discoverability grants are pre-seeded; no invitation or management UI is included.
- Caller, source/network, and aggregate/global budgets are process-local, may reset on restart, and provide no durable/multi-instance guarantee; target counters are prohibited.
- Minimized event acknowledgement is required before disclosure; durable audit semantics remain deferred.
- Engineering risk: an email lookup can leak registration or policy state through validation, timing, throttling, logging, or error differences.
- Assumption: a trusted ingress will eventually construct the authenticated principal; this module will not implement that ingress.

## Progress

- [x] 2026-10-04: Identity Model accepted and merged.
- [x] 2026-10-04: Issue #6 created and marked `In Preparation` by the Human Product Owner.
- [x] 2026-10-04: Governance PR #16 approved and merged.
- [x] 2026-10-04: Completed specification, traceability, architecture/threat analysis, and QE test plan.
- [x] 2026-10-04: Independent Product/traceability and Architecture/Security reviews passed after reconciliation.
- [x] 2026-10-04: Readiness PR #17 merged; Human Product Owner approved all seven decisions and `Ready for Development`.
- [x] 2026-10-04: Issue #6 moved to `In Development` on `feat/privacy-preserving-discovery`.
- [x] 2026-10-06: Implemented the bounded module and developer tests, including commit-failure events, own-property source checks, ambiguous grants, alias rejection, event allowlists, and no target-keyed budget input.
- [x] 2026-10-06: Architecture/security review PASS. QE review PASS for the bounded domain module after four test gaps were closed.
- [x] 2026-10-06: Final local verification recorded below. Evidence posted at `Ready for PO Acceptance`.
- [x] 2026-10-06: Human Product Owner accepted the module. Required CI was green on `0483452bc5aee4f9f6df0420ccd859bd3041ddec`, with no unresolved review threads. PR #19 squash-merged as `c15fc86b89296ee0d7725226e49e90f225c9c412`. Issue #6 is closed and Done.

## Discoveries and decision log

- 2026-10-04: Preparation may proceed in parallel, but functional behavior remains gated.
- 2026-10-04: Discovery remains independent from relationship, skill, authorization, messaging, and authentication implementation.
- 2026-10-04: Human Product Owner approved the seven authoritative Discovery decisions; implementation is authorized only within that boundary.
- 2026-10-06: A disclosure commit result other than exact `true` records one minimized `not-resolved` / `dependency` event and returns the shared negative result. The success return stays in the same turn after exact `true`, with no further await.
- 2026-10-06: Trusted-source validation requires own data properties `kind` and `key`. Inherited prototype fields cannot mint a source. There is still no public constructor or parser for `TrustedDiscoverySource` or `AuthenticatedAgentPrincipal`.
- 2026-10-06: A caller-limit denial still records a global attempt while the global window has room, and may record a source attempt. Security review judged this non-blocking: the public result stays the shared negative object and there is no target counter. The concurrency test locks the global-slot behavior.
- 2026-10-06: Caller directory resolution happens before the budget check so the caller key exists. Target lookup and grant policy run only after an exact `true` budget result. Security review judged this non-blocking.
- 2026-10-06: In-module port deadlines were not added. A thrown port fails closed. A stalled trusted port remains an in-process availability gap deferred with transport and persistence.

## Handoff and completion evidence

The Human Product Owner accepted this module on 2026-10-06. PR #19 merged to `c15fc86b89296ee0d7725226e49e90f225c9c412` from approved head `0483452bc5aee4f9f6df0420ccd859bd3041ddec`. Issue #6 is closed. The merge-evidence comment is https://github.com/ericrommel/personal-agent-network/pull/19#issuecomment-6010660345.

Local environment: Node v22.13.1, npm 10.9.2, Windows x64. `npm ci` was required because `node_modules` was absent. It added 53 packages from the lockfile and reported 0 vulnerabilities.

Final local commands, re-run after the evidence text in this plan:

```text
npm run verify
npm run build
npm audit --audit-level=high
git diff --check
```

Results recorded after that re-run are in the delivery note below. The pre-evidence run on the implementation tree was:

- `npm run verify`: PASS. format, lint, and typecheck passed. 34 tests passed. v8 coverage was 100% statements, branches, functions, and lines for executable files. `src/modules/discovery/index.ts` and `src/modules/identity/index.ts` are re-exports with no executable statements (0/0) and do not lower the 100% aggregate. Discovery thresholds in `vitest.config.ts` are 100%.
- `npm run build`: PASS (`tsc -p tsconfig.build.json`).
- `npm audit --audit-level=high`: PASS, found 0 vulnerabilities.
- `git diff --check`: PASS.

### Requirement and acceptance traceability

| Requirement | Acceptance evidence |
|---|---|
| `FR-002`, `PRV-001` | `AC-DIS-001` scenarios 1, 2, and 6. Success is only `pan.discovery-result/v1` plus `agentReference`. References differ by caller and rotate when a revoked grant is recreated. |
| `SEC-012`, `SEC-018`, `PRV-006` | `AC-DIS-001` scenarios 3 and 7. Negatives return the same frozen `DISCOVERY_NEGATIVE_V1` object. No target counter. Limiter identity is not in the public result or the coarse `budget` control. |
| `SEC-014`, `REL-003` | `AC-DIS-001` scenarios 3, 4, 7, and 8. Malformed, oversized, hostile, non-true, and thrown dependencies fail closed. |
| `SEC-017`, `OBS-001`, `PRV-004` | `AC-DIS-001` scenario 8. Success and listed negative events are exact allowlists: contract, correlation id, caller id or `unresolved`, outcome, and control. They exclude email, target id, and `agentReference`. |
| `PRV-008` | `AC-DIS-001` scenario 7. Defaults are 30/60/1000 per 60 seconds, process-local, reset by a new instance. |
| `DEV-004` | Request and result contracts are versioned. Unexpected fields and `v2` fail closed. |
| `SEC-001`, `SEC-002` | Bounded only. Synthetic trusted principal and source values are test casts. Production code does not construct them from payload claims and does not claim deployable authentication. |

### Reviews

- Architecture/security/privacy, independent review on 2026-10-06: PASS. No blocking trust-boundary finding. No secrets, no later-module scope, no public trusted-principal or trusted-source constructor, no target-keyed limiter, no internal Agent ID in the public result, no post-commit await on the success path, and the reference is not bearer authority.
- QE, independent review on 2026-10-06: initial review BLOCKED on four test gaps (two active grants, event allowlists, service-level alias rejection, and target-keyed budget input). Developer regression tests closed them. QE re-check: PASS for the bounded domain module.
- Coordinator review: the implementation matches ADR-0005 and the seven Product Owner decisions on Issue #6.

### Timing evidence

This is not a constant-time claim. It is an in-process domain measurement only. Method: seeded shuffle (`0x5eed1234`), 100 unmeasured warmups, 400 samples per class, 3 rounds, `process.hrtime.bigint()` around `DiscoveryService.discover`. Host: Node v22.13.1, win32 x64, 2026-10-06. Total measurement time was 239 ms.

Negative median order was stable. Round 3 swapped only `unknown` and `ambiguous`, which tied at 5.7 µs. Representative p50 ranges:

| Class | p50 across 3 rounds |
|---|---|
| untrusted | 2.8–3.4 µs |
| disabled-caller | 4.6–5.8 µs |
| budget | 5.1–6.4 µs |
| malformed | 5.2–6.8 µs |
| wildcard | 5.3–6.9 µs |
| ambiguous / unknown | 5.7–7.7 µs |
| revoked | 9.2–11.7 µs |
| unlisted | 9.3–12.0 µs |
| disabled-target | 11.3–14.3 µs |
| success (different public result) | 20.9–26.0 µs |

Tails were not stable: some maxima exceeded 1 ms. No Product Owner numeric blocking threshold is defined. ADR-0005 accepts this statistical residual risk. The difference follows path length, including how many ports are awaited. No artificial delay was added.

### Deferred evidence

Not claimed, and not implemented in order to manufacture evidence:

- Public transport status family, headers, and retry behavior.
- Production authentication and credential binding.
- Durable or multi-instance abuse budgets.
- Downstream consumption of `agentReference`. Later modules must independently authenticate and authorize.
- Durable Audit storage, access, retention, querying, export, and deletion.
- In-module deadlines for a stalled trusted port.
- A statistical timing threshold beyond the recorded in-process medians.

### Delivery note

The command block above was run on 2026-10-06 against the tree that includes this evidence. `npm run verify` passed with 34 tests and 100% statements, branches, functions, and lines. `npm run build` passed. `npm audit --audit-level=high` found 0 vulnerabilities. `git diff --check` passed. This delivery-note sentence was added after that run; it changes no executable file. Required CI on the approved head was green before merge: quality, secret-scan, codeql, and CodeQL on run 37395881774. Human Product Owner acceptance was the explicit 2026-10-06 instruction to complete the merge workflow. This closing note does not change executable files.
