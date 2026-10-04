# Identity Model Test Plan

## Purpose and ownership

This plan verifies the Identity Model specification and its contribution to `FR-001`, `FR-003`, and `DEV-004`. The Backend Engineer owns implementation-level tests. QE independently reviews coverage, traceability, and results; QE does not implement missing developer tests. Security reviews principal-boundary and fail-closed cases.

All fixtures must be synthetic. Test names should include the applicable `AC-*` identifier.

## Developer test suites

### Domain unit tests — `AC-ID-001`

- Create one Human with multiple Agents and prove each Agent has a distinct ID and the same explicit owner ID.
- Validate the supported minimal Agent statuses and permitted transitions.
- Reject empty, malformed, and incorrectly branded identifiers.
- Reject missing ownership and unknown status values.
- Verify identity state contains no discovery, relationship, skill, permission, provider, or profile fields.

### Compile-time contract tests — `AC-ID-001`

- Prove `HumanIdentityId` is not assignable to `AgentIdentityId` or an Agent-only API.
- Prove `AgentIdentityId` is not assignable to `HumanIdentityId` or a Human-only API.
- Prove unvalidated strings and payload-shaped objects cannot be passed as trusted identifiers or authenticated principals.

Expected compiler failures must use the project's checked type-test convention so an unexpectedly successful assignment fails the suite.

### Principal and runtime negative tests — `AC-ID-001`, partial `SEC-001`/`SEC-002`

- Verify the public module exposes no parser or constructor that can turn payload data into an authenticated principal.
- Verify only an active Agent is eligible for a future trusted authentication adapter to establish a principal.
- Reject malformed IDs and unknown status; classify disabled Agents as ineligible without returning a usable principal.
- Reject or ignore identity asserted only by an untrusted message payload.
- Verify failures expose no credential, provider, profile, relationship, or permission data.

These tests validate the contract boundary only. They do **not** prove credential authentication, credential-to-Agent binding, transport behavior, or complete `SEC-001`/`SEC-002` compliance.

### Boundary tests — `AC-DOM-001`

- Verify exported identity contracts do not import or expose relationship, skill, permission, messaging, approval, context, or discovery types.
- Verify identity creation and status changes produce no relationship, advertised skill, or permission side effect.
- Record this as structural evidence only; permission-aware invocation remains deferred to later modules.

### Contract governance — `AC-DEV-003`

- Verify exported identity and principal contracts expose the documented contract version.
- Review contract changes for compatibility; link any breaking change to affected requirements, criteria, and review evidence.

## QE and security verification

QE reviews the requirement-to-test mapping, compile-time negative coverage, malformed-input partitions, deterministic results, and regression coverage. Security independently checks that payload claims cannot become trusted principals, ineligible identities fail closed, and errors disclose no unrelated state.

## Completion evidence

The module is ready for acceptance when all listed tests and repository quality gates pass, review finds no blocking gaps, and the module documentation matches the implemented contracts. Evidence may claim `FR-001` implementation and bounded contributions to `FR-003` and `DEV-004`; it must record `SEC-001` and `SEC-002` as partial until an authentication ingress verifies credentials and binds them to Agent Identity.
