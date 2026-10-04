# Identity Model

Status: Ready for PO Acceptance  
Owner roles: Engineering Coordinator, Product Analyst, Software Architect, Backend Engineer, Security & Privacy Engineer, Quality Engineer  
Last updated: 2026-10-04

## Objective

Implement the first approved functional module: distinct Human Identity and Agent Identity domain types, explicit immutable ownership and minimal Agent status invariants, plus a nominal authenticated-agent principal contract for a future trusted authentication boundary.

## Scope and non-goals

In scope: opaque typed identifiers, immutable domain values, one Human owning multiple distinct Agents, `active`/`disabled` Agent status, safe versioned local snapshots, stable non-sensitive errors, public module exports, and automated unit/type-boundary tests.

Out of scope: discovery/email, profiles, credentials, keys/tokens, authentication mechanisms, networking, persistence, relationships, skills, authorization/policy, messaging, approval, audit, context access, ownership transfer, deletion/recovery, and human lifecycle behavior.

## Requirements and acceptance criteria

- `FR-001` / `AC-ID-001`: distinct non-interchangeable identities and explicit ownership.
- `FR-003` / `AC-DOM-001`: identity contracts contain no relationship, skill, or permission state.
- `DEV-004` / `AC-DEV-003`: exported snapshots are explicitly versioned and breaking changes require a new version/review.
- `SEC-001`, `SEC-002`: partial structural evidence only. The principal contract is fail-closed and payload claims cannot construct it; credential verification remains deferred.

Operational detail is maintained in `docs/modules/identity-model/specification.md` and `test-plan.md`.

## Context and affected components

- Shared domain primitives under `src/shared/domain/`.
- Identity domain and contracts under `src/modules/identity/`.
- Unit/type-boundary tests under `tests/unit/modules/identity/`.
- No adapter, database, HTTP, or external integration changes.

## Decisions and ADRs

This module implements accepted ADR-0003. No new ADR is required because identifier representation and snapshot contracts are local, not interoperability standards. A future external identity/authentication protocol requires its own ADR.

## Security and privacy considerations

- Human and Agent IDs are different at compile time and distinguishable at runtime.
- IDs are opaque and contain no email, provider, relationship, permission, or profile data.
- Ownership is required and immutable; unsupported mutation fails.
- Unknown/malformed IDs, statuses, schemas, keys, and prototype-bearing input fail closed.
- Errors never echo rejected values.
- Local snapshot serializers use explicit allowlists.
- `AuthenticatedAgentPrincipal` is nominal and has no production JSON parser/factory; remote payload assertions remain ordinary untrusted input.

## Implementation sequence

1. Finalize module specification and test plan.
2. Implement shared result and typed identifier parsers/generators.
3. Implement immutable Human and Agent domain factories/transitions.
4. Implement versioned local snapshot parser/serializer.
5. Define the nominal authenticated-agent principal contract and public exports.
6. Add positive, negative, boundary, serialization, and compile-time tests.
7. Run architecture, security, QE, traceability, and full CI-equivalent review.

## Developer tests

Unit tests cover identifier validation, distinct IDs, one-to-many ownership, immutable owner, status transitions, exact snapshot fields, round trips, unsupported versions, malformed/untrusted objects, and safe errors. Compile-time checks use `@ts-expect-error` to prove cross-kind and raw-string rejection and nominal principal construction boundaries.

## QE and acceptance verification

QE maps tests to `AC-ID-001`, `AC-DOM-001`, and `AC-DEV-003`, reviews negative cases, and confirms this module does not claim complete authentication coverage. Security reviews all principal, parsing, serialization, and ownership boundaries.

## Validation commands

```text
npm run verify
npm run build
npm audit --audit-level=high
git diff --check
```

CI must additionally pass secret scanning and CodeQL.

## Risks, assumptions, and open questions

- TypeScript brands are erased at runtime; boundary parsers and exact discriminators provide runtime separation.
- Snapshot ownership data is local/private and must never be reused as a discovery response.
- Agent status is domain state, not permission, credential revocation, or authorization state.
- No Product Owner decision blocks this scope. Future lifecycle semantics remain gated.

## Progress

- [x] 2026-10-04: Foundation merged and PO approved the narrow module.
- [x] 2026-10-04: Requirements, architecture, and security preparation completed.
- [x] 2026-10-04: Production identity contracts implemented.
- [x] 2026-10-04: Developer tests implemented; 15 tests passed with 100% statement/branch/function/line coverage.
- [x] 2026-10-04: Independent architecture and security reviews passed after blocking findings were resolved.
- [x] 2026-10-04: Independent QE re-review passed; module is ready for PR and PO review.
- [x] 2026-10-04: PR #5 opened; quality, secret-scan, repository CodeQL, and GitHub CodeQL passed.

## Discoveries and decision log

- 2026-10-04: Use a nominal authenticated-agent principal contract only. Construction remains unavailable until a trusted authentication adapter is designed in a separately approved module.
- 2026-10-04: Human lifecycle status is excluded; only the approved Agent status invariant is modeled.
- 2026-10-04: Versioned snapshots are explicitly local persistence/interchange shapes, not discovery or public network contracts.

## Handoff and completion evidence

- `npm run verify`: passed after runtime validation, hostile-input hardening, and traceability additions; 15 tests and 100% statement/branch/function/line coverage.
- `npm run build`: passed.
- `npm audit --audit-level=high`: zero vulnerabilities.
- Architecture review: passed after Proxy and discriminator findings were resolved.
- Security/privacy review: passed after runtime factory/serializer validation and adversarial tests were added.
- QE review: passed after README, ExecPlan, `AC-DOM-001`, and contract-version evidence were made current.
- PR #5 CI: quality, secret-scan, repository CodeQL, and GitHub CodeQL passed.
- Remaining: Human Product Owner acceptance.
