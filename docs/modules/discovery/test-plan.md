# Discovery Test Plan

## Purpose, scope, and ownership

This plan defines independent, risk-based verification for Issue #6 and `AC-DIS-001`. It is preparation evidence, not authorization to implement Discovery. The Backend Engineer owns all unit, component, contract, and integration tests for the implementation. QE reviews traceability, partitions, test quality, coverage, and results; performs exploratory verification; and converts confirmed defects into developer-owned regression cases. Security reviews enumeration, caller trust, fail-closed behavior, abuse controls, reference disclosure, and telemetry leakage.

All fixtures MUST be synthetic. Test names MUST include `AC-DIS-001` and, where applicable, `AC-VAL-001`, `AC-AUD-001`, or `AC-DEV-003`.

## Risk priorities

The release-blocking risks are unauthorized resolution, internal identity or profile disclosure, payload-asserted caller trust, and Discovery creating authority. High risks are identifier enumeration, limiter races/evasion, canonicalization collisions, stale eligibility, dependency failure, resource exhaustion, and audit leakage. Timing is supporting evidence for enumeration resistance, not proof of constant-time execution.

## Developer-owned automated suites

### Unit and property tests

Use table-driven tests for every policy branch. Cross the caller states `trusted-active`, `trusted-inactive`, `untrusted`, `missing`, and `payload-only` with target states `active-permitted`, `active-unlisted`, `disabled`, `ambiguous`, `unknown`, and directory/policy failure. Only the approved success cell may return a reference; every other cell must fail closed through the common public failure family.

Property and generated-input tests MUST verify:

- normalization is deterministic and idempotent for accepted identifiers;
- distinct identifiers do not collapse unless the approved normalization rule explicitly makes them equivalent;
- malformed Unicode, confusables, invalid encodings, whitespace, case variants, aliases, prefixes, wildcards, unexpected fields, deep structures, and boundary lengths are rejected or normalized exactly as approved;
- arbitrary payload identity claims never produce trusted caller evidence;
- public success values match the approved opaque-reference grammar and contain no decodable identity, identifier, owner, provider, status, endpoint, or policy data;
- repeated calls and all failures leave identity, relationship, trust, permission, skill, and context-authority state unchanged.

Generators must be seeded and reproducible; a failing seed becomes a named regression fixture.

### Component and contract tests

Exercise the application service through its public port with deterministic fakes for caller evidence, policy, directory, reference projection, abuse budget, clock, and audit. Verify `AC-DIS-001` scenarios 1–7, including exact schema/version checks, rejection of extra fields, and compatibility evidence required by `AC-DEV-003`.

For unknown, unlisted, disabled, ambiguous, malformed, dependency-failed, and over-budget cases, compare status, body, headers, error shape, reference absence, and retry metadata. Private reason classes may differ only in the access-controlled audit sink. No test should assert internal reason text through the public contract.

Verify calls are bounded: validation precedes expensive work, no fuzzy/bulk/list operation is reachable, dependency calls have deadlines, and a failed or indeterminate atomic budget check prevents directory resolution and disclosure. Reference projection failure must suppress an otherwise valid result. Event-port failure must also suppress it if the PO approves the recommended acknowledgement gate.

### Abuse, concurrency, and integration tests

Developer-owned integration tests MUST use the real persistence implementation when introduced and cover:

- simultaneous requests at `limit - 1`, `limit`, and `limit + 1`, proving atomic enforcement without excess successes;
- per-caller, source, and aggregate/global dimensions approved for the module, including rollover, parallel retries, and cardinality pressure; a target-specific dimension is tested only if a later privacy review approves it;
- disabled, revoked, or discoverability-changed records taking effect at the approved boundary without stale positive cache authority;
- transaction failure, timeout, malformed dependency output, unavailable directory/policy/budget/audit stores, and restart behavior;
- safe correlation across audit records without raw lookup values, returned references, credentials, profile data, or policy details in logs, traces, metrics, errors, snapshots, or CI artifacts.

Authentication, network transport, and production credential binding are outside this module. Integration tests may inject a synthetic trusted principal only through the documented trusted port. They must not claim complete `SEC-001` or `SEC-002` compliance.

## Enumeration and timing verification

Semantic uniformity is a deterministic blocking gate. Run the same request envelope against unknown, unlisted, disabled, ambiguous, invalid, dependency-failed, and over-budget cases and require the approved externally observable equivalence.

Timing checks require controlled runners, warm and cold samples, randomized case order, fixed synthetic data, recorded sample size, percentile/distribution comparison, and an approved tolerance. Do not use single-call duration assertions or artificial random delay. Shared-host timing is noisy: ordinary PR CI should run a coarse regression guard only if it is demonstrated stable; the statistically meaningful suite should run on a controlled environment and publish summarized, non-sensitive evidence. A timing failure requires investigation but must not reveal which target class caused it.

## Coverage and CI evidence

Discovery security-critical files require 100% branch, line, statement, and function coverage. Shared or adapter code retains repository thresholds of 80% lines/statements/functions and 75% branches unless its decisions can disclose or deny a reference, in which case the 100% threshold applies. Exclusions are limited to generated, configuration-only, or type-only code and require recorded review. Mutation testing of policy, response normalization, and budget decisions is recommended before acceptance when tooling is selected; surviving authorization/disclosure mutants are blocking.

Each Pull Request must provide the requirement/criterion mapping, commands and results, coverage summary, deterministic test seed, and integration environment. `npm run verify`, build, dependency audit, secret scan, and CodeQL must pass. No skipped/quarantined test counts as evidence. CI artifacts must contain no lookup identifiers or returned references, even synthetic values shaped like production data.

## QE acceptance and exploratory review

QE independently samples the decision table, malformed partitions, boundary values, generated failures, and log sinks; repeats parallel budget and dependency-failure cases; and verifies that tests fail when success fields, policy decisions, or response normalization are deliberately perturbed. Exploratory probes include mixed encodings, high-cardinality attempts, retries around budget rollover, warm/cold timing, cancellation, partial dependency failure, and attempts to use a discovery result as permission.

Acceptance evidence may claim `FR-002`, `SEC-012`, `SEC-014`, `SEC-018`, `PRV-001`, `PRV-006`, `PRV-008`, and the Discovery contribution to `REL-003`. It may claim only bounded contributions to authentication and audit requirements until their owning integrations exist.

## Product Owner-dependent test parameters

Before this plan is executable, the approved contract must fix:

1. caller audience and active/eligibility semantics;
2. identifier syntax, canonicalization, encoding, ambiguous Unicode/alias behavior, and length rules, including any numeric bounds delegated to Security/engineering;
3. success field name, external-reference format, lifetime, rotation, and cross-caller correlation rules;
4. common negative status, body, headers, and retry behavior;
5. timing objective and any PO constraints on recovery/retry behavior; subject to PO delegation, Security/QE own the measurement environment, sample/tolerance method, numeric tolerance, and blocking policy;
6. discoverability configuration and change-effect boundary;
7. permitted budget dimensions and legitimate recovery/owner-visibility behavior; subject to PO delegation, Security/engineering own concrete values, windows, and rollover mechanics;
8. the minimized Discovery event fields and whether event-port acknowledgement is required before disclosure; the preparation package recommends fail-closed acknowledgement. Durable audit storage, access, retention, export, and deletion remain deferred to the Audit module.

## Readiness exit

The test design is ready when the Product Owner-dependent parameters are resolved, every approved observable behavior maps to an automated suite and owner, integration dependencies are identified, the coverage configuration is planned, and Security and QE record no blocking gap. The preparation package consistently recommends a distinct opaque external `agentReference`; its exact lifecycle remains a Product Owner decision. Implementation and test creation begin only after explicit Human Product Owner authorization moves Issue #6 to `Ready for Development`.
