# ADR-0005: Privacy-Preserving Discovery Contract

Status: Accepted

Date: 2026-10-04

Decision owners: Human Product Owner, Software Architect, Security & Privacy Engineer

## Context

The MVP needs a human-friendly way for one Personal Agent to locate another without turning
discovery into proof of identity, a public directory, or an authorization capability. Email lookup
creates enumeration, correlation, canonicalization, logging, and abuse risks. The public result and
its failure behavior therefore form a consequential privacy contract that later transport and
messaging work must preserve.

The Human Product Owner approved the seven Discovery semantics recorded on Issue #6. This ADR
records those semantics without selecting authentication technology, public transport, persistence,
or a proprietary identity or cryptographic standard.

## Decision

### Caller eligibility and discoverability

Discovery accepts only a trusted principal for an authenticated, active Agent Identity that the
target owner explicitly preconfigured for the target identifier. Anonymous, inactive,
payload-asserted, and authenticated-but-unlisted callers cannot resolve the target. Synthetic
trusted evidence may enter through a test-only port, but production code cannot construct trusted
principals from request payload claims.

Discoverability is pre-seeded for the MVP. Discovery does not implement invitation, acceptance, or
owner-facing management flows and does not create a relationship, trust, permission, skill access,
context access, or execution authority.

### Lookup identifier

Email is the sole MVP human-facing identifier. Input must be ASCII and exact-match after one
deterministic canonicalization rule: reject surrounding or internal whitespace and every non-ASCII
form, then lowercase the ASCII address for lookup. Do not trim input or apply provider-specific or
fuzzy transformations, including dot removal, plus-tag stripping, alias expansion, or Unicode
equivalence.

Security and engineering may choose standards-based syntax and numeric input limits provided those
choices preserve this observable behavior and do not add provider-specific semantics.

### Minimal success result and reference lifecycle

Success returns exactly the versioned Discovery contract and one opaque external
`agentReference`. It returns no internal Agent Identity ID, email, Human Identity, profile,
provider, status, relationship, skill, policy, context, endpoint, routing metadata, or discovery
reason.

An `agentReference` is scoped to one caller and one target discoverability grant:

- different callers resolving the same target receive references that are not globally
  correlatable;
- a reference may remain stable only for the lifetime of that specific grant;
- revoking the grant or making the target ineligible makes the reference unusable immediately;
- recreating a revoked grant produces a rotated reference; and
- the reference is an address, not a bearer capability. Later protocols must independently
  authenticate and authorize every use.

### Uniform negative behavior

Unknown, non-discoverable, disabled, ambiguous, malformed, and otherwise ineligible lookups use one
externally indistinguishable public response contract, including status family, body shape, headers,
and retry behavior. Internal reason classes remain private. Perfect constant-time execution is not
required; Security and QE own the controlled measurement method, numeric tolerance, and blocking
threshold while preserving the public privacy contract.

### Abuse controls

The MVP uses layered caller, source/network, and aggregate/global rolling budgets. It does not use
target-specific counters unless a later privacy review explicitly approves them. Recovery and retry
behavior cannot reveal which limiter fired or whether a target exists. Numeric limits, windows, and
atomicity mechanisms are configurable engineering/security choices within these boundaries.

Process-local, in-memory enforcement is accepted for this MVP and may reset on process restart. It
must be documented and tested as process-local only and cannot be represented as durable or
multi-instance protection. Owner-visible abuse information is coarse and privacy-safe; it excludes
raw lookup identifiers, target-existence signals, and sensitive per-target detail.

### Minimized event acknowledgement

Before releasing a successful result, Discovery must use one disclosure-commit boundary that
atomically revalidates the exact current grant, reference, and target eligibility while persisting
and acknowledging the minimized success event. Only exact success may release the reference, with
no later asynchronous step before return. Commit failure or an indeterminate result fails closed
and suppresses the result. The event contains only the
allowlisted correlation, coarse actor, outcome, and control metadata needed by the approved
contract; it contains no raw lookup identifier, returned reference, credential, profile, or
target-existence detail.

Discovery owns the commit port and event emission contract only. Durable storage, access control, querying, retention, export,
and deletion remain responsibilities of the later Audit module.

## Alternatives considered

- **Anonymous or generally authenticated discovery:** rejected because it permits broader
  enumeration than caller-specific preconfiguration.
- **Provider-aware email normalization, Unicode equivalence, aliases, or fuzzy search:** rejected
  because ambiguous transformations can resolve the wrong owner and expand enumeration.
- **Return the internal Agent Identity ID or routing endpoint:** rejected because it couples private
  identity and topology to the public contract and increases correlation.
- **One stable reference per target:** rejected because callers could correlate the same person
  across relationships and a revoked reference could outlive its grant.
- **Bearer-capability references:** rejected because discovery must not grant invocation authority.
- **Distinct not-found, forbidden, malformed, disabled, or throttled responses:** rejected because
  the distinctions expose registration, eligibility, policy, or abuse-control state.
- **Target-scoped budgets:** rejected for this decision because the counter can become a
  target-existence oracle; a later privacy review may reconsider it.
- **Durable or distributed rate-limit infrastructure in this module:** deferred because the MVP
  accepts explicit process-local limitations and does not yet justify that infrastructure.
- **Best-effort event emission:** rejected because releasing a result without required security
  evidence violates the approved fail-closed contract.

## Consequences

Discovery needs distinct types and ports for trusted caller/source evidence, canonical lookup input,
discoverability grants, caller-scoped references, layered budgets, normalized public outcomes, and
atomic disclosure commit. Discovery must verify target eligibility and current grant state when
resolving a reference. Any later component that accepts the reference must independently
verify that it remains usable; caches cannot extend revoked authority.

Tests must cover canonicalization boundaries, cross-caller non-correlation, stability within a grant,
immediate invalidation, rotation after grant recreation, uniform negative semantics, budget races
and restart reset, and event-port failure. Public transport, production authentication, durable
storage, and later use of the reference remain separate modules and decisions.

Changing identifier semantics, caller audience, public negative observability, reference authority
or lifecycle, budget dimensions, or event acknowledgement changes this contract and requires an ADR
review and Product Owner approval.

## Security and privacy impact

Caller-specific preconfiguration and layered non-target budgets reduce enumeration but do not
eliminate it. Process restart resets abuse state, and observable timing can still leak statistical
signals; these are accepted MVP residual risks that must not be hidden in evidence or documentation.
Opaque caller-scoped references reduce correlation and prevent internal identity disclosure, while
independent downstream authentication prevents them from becoming ambient authority. Fail-closed
event acknowledgement preserves audit evidence at the cost of availability when the event port is
unavailable.

## Requirements affected

`FR-002`, `SEC-001`, `SEC-002`, `SEC-012`, `SEC-014`, `SEC-017`, `SEC-018`, `PRV-001`,
`PRV-004`, `PRV-006`, `PRV-008`, `REL-003`, `OBS-001`, `DEV-004`.

## Supersedes / Superseded by

None.
