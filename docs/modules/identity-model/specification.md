# Identity Model Specification

## Objective

Establish the smallest authoritative identity domain required by later PAN modules: distinct Human and Agent identities, explicit ownership, minimal Agent status, and a versioned authenticated-principal contract for trusted ingress adapters. This module defines identity vocabulary and invariants; it does not authenticate credentials or authorize requests.

## Scope

- Opaque, validated, non-interchangeable Human and Agent identifiers.
- Human Identity and Agent Identity domain contracts.
- Exactly one Human owner per Agent and support for multiple Agents per Human.
- Minimal Agent status with fail-closed principal eligibility.
- A versioned authenticated Agent principal contract whose identity is supplied by a trusted authentication boundary.
- Synthetic unit, contract, and boundary tests.

## Non-goals

- Email, discovery identifiers, profiles, routing, or discovery behavior.
- Credential issuance or verification, OAuth/OIDC, keys, tokens, or transport authentication.
- Relationships, skills, permissions, authorization, messaging, approval, audit, or context access.
- Persistence, migrations, HTTP endpoints, ownership transfer, recovery, or deletion semantics.

## Requirements and acceptance refinements

| Requirement | Module responsibility | Acceptance evidence |
|---|---|---|
| `FR-001` | Implement distinct Human and Agent identity records with explicit ownership. | `AC-ID-001` unit, runtime-validation, and compile-time contract tests. |
| `FR-003` | Keep relationship, advertised-skill, and permission state outside identity contracts and operations. | Structural evidence under `AC-DOM-001`; its invocation behavior remains deferred. |
| `DEV-004` | Give exported identity and principal contracts an explicit version and document breaking changes. | Contract review and tests under `AC-DEV-003`. |
| `SEC-001` | Define a principal contract that carries a trusted Agent identity and cannot be built from an untrusted payload through the module's public API. | Negative construction tests only. Authentication and credential binding remain deferred; this requirement is **not complete**. |
| `SEC-002` | Reject invalid, unknown, or ineligible identity input without producing a usable principal. | Fail-closed negative tests only. Authentication failure behavior remains deferred; this requirement is **not complete**. |

Implementation evidence is provided by `tests/unit/modules/identity/identity-model.test.ts` and `identity-types.test.ts`. The repository's typecheck makes expected compile-time failures executable evidence; the coverage gate requires 100% branch, function, line, and statement coverage for the identity module and identifier parser.

Module refinements do not replace the product-wide criteria:

- **`AC-ID-001`:** one Human may own multiple Agents with distinct IDs; ownership is explicit; Human and Agent IDs cannot be substituted at compile time or runtime; malformed and cross-kind identifiers are rejected; identity records contain no unrelated domain state.
- **`AC-DOM-001`:** identity contracts contain no relationship, skill-advertisement, or permission state, and identity operations cannot mutate those boundaries.
- **`AC-DEV-003`:** every exported identity/principal contract has an explicit version; a breaking change must be identified and traced before merge.

## Invariants

1. Human and Agent identifiers are opaque and cannot be interchanged.
2. Every Agent has exactly one explicit Human owner; a Human may own multiple Agents.
3. Each Agent has a distinct Agent identifier.
4. Identifiers contain no email, provider, relationship, permission, skill, or profile information.
5. Malformed identifiers and unknown status values are rejected.
6. An Agent not eligible under the current status cannot produce a usable authenticated principal.
7. Principal identity originates at a trusted authentication boundary, never from message payload claims.
8. Identity creation and status changes cannot create relationships, advertise skills, or grant permission.
9. Exported contracts follow the versioning and traceability rule in `DEV-004`.

## Decisions and readiness

Ownership reassignment, deletion, restoration, discovery, and credential technology remain unsupported rather than receiving implied semantics. Minimal status names and transitions are engineering choices only while they introduce no user-visible suspension, recovery, or transfer behavior. There are no blocking Product Owner decisions for this bounded module.
