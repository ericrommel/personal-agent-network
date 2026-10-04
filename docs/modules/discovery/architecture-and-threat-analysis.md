# Discovery Architecture and Threat Analysis

Status: Preparation proposal; not approved for implementation  
Owner roles: Software Architect, Security & Privacy Engineer  
Requirements: `FR-002`, `SEC-002`, `SEC-012`, `SEC-014`, `SEC-017`, `SEC-018`, `PRV-001`, `PRV-004`, `PRV-006`, `PRV-008`, `REL-003`

## Purpose and boundary

Discovery answers a narrow question: whether a caller may receive an opaque reference for a
Personal Agent associated with an approved discovery identifier. It does not authenticate a
message, establish trust or a relationship, advertise skills, grant permission, return a network
endpoint, or authorize invocation.

```text
untrusted lookup input
  -> ingress limits and syntax validation
  -> trusted caller-evidence port (when the approved policy requires a caller)
  -> abuse-budget check
  -> discovery-policy decision
  -> identifier directory lookup
  -> minimal-reference projection
  -> response normalization and safe audit event
```

The caller-to-Discovery edge is a privacy trust boundary. The identity directory and discovery
policy remain private, authoritative state inside the receiving owner boundary. Payload claims
must never create trusted caller evidence. The existing `AuthenticatedAgentPrincipal` is suitable
only when a future trusted authentication adapter has established it; Discovery must not add a
parser or constructor for that type.

Lookup success grants only the ability to address a later protocol step. The returned value has no
bearing on relationship, skill, authorization, context, tool, or execution decisions.

## Minimal result contract recommendation

The successful domain result should contain only a versioned, opaque `agentReference`. The
reference must reveal no Human Identity ID, internal Agent Identity ID, email, profile, provider,
endpoint topology, relationship, skill, policy, owner status, or context. It should be generated or
projected through a dedicated port rather than reusing the current `pan_agent_*` internal ID.

The public response envelope may include only protocol necessities such as its schema version and
correlation identifier. Whether success is observable, who may query, the identifier type, reference
lifetime/rotation, and the uniform response contract for unknown, unauthorized, and
non-discoverable records are Product Owner decisions and block contract finalization. This document
therefore does not define an HTTP route, status code, wire schema, email-normalization algorithm,
or reference format.

## Proposed internal decomposition

- **Discovery application service:** coordinates ports and returns only a minimal domain outcome.
- **Lookup input validator:** applies exact schema, encoding, length, and normalization rules once
  the discovery identifier is approved; it never performs fuzzy matching.
- **Caller evidence port:** accepts trusted evidence from a future ingress adapter and rejects
  payload-asserted identity. Anonymous discovery remains possible only if explicitly approved.
- **Discovery policy port:** decides whether this caller may resolve this identifier. It is separate
  from relationship and skill authorization and defaults to no disclosure.
- **Identifier directory port:** resolves an exact normalized lookup key to an eligible Agent
  Identity without exposing identity records to the caller.
- **Reference projector/issuer port:** maps an eligible internal Agent Identity to a non-descriptive
  external reference with documented lifecycle semantics.
- **Abuse-budget port:** applies bounded, atomic budgets across approved caller, source/network,
  aggregate/global, and time dimensions without confirming which dimension caused refusal.
  Target-scoped enforcement is deferred unless a later privacy review shows it cannot become an
  existence oracle.
- **Safe audit port:** records correlation, coarse actor reference, outcome/reason class, and budget
  action; it excludes raw identifiers, message bodies, credentials, and returned references.
- **Response normalizer:** maps private failure reasons to the approved non-revealing public result.

These are logical ports inside the modular monolith, not services. No broker, external directory,
database schema, HTTP framework, authentication mechanism, or distributed cache is justified by
this preparation work.

## Fail-closed behavior

The recommended fail-closed contract returns no reference when caller evidence required by policy is absent or invalid, input is
malformed, identity eligibility cannot be established, policy or directory state is missing/stale,
the reference projector fails, the abuse budget cannot be checked atomically, or—if the PO approves
the recommended acknowledgement gate—the required event port fails. Internal distinctions are retained only as minimized reason classes for
authorized operations; they are not reflected in the caller response. The PO gate must confirm
whether required event-port acknowledgement blocks disclosure; durable audit behavior is deferred.

Timeouts and dependency errors consume bounded work and produce the same public failure family as
unknown, unauthorized, non-discoverable, and ineligible identities under the approved observable
contract. Caching must not convert a previous success into authority: positive and negative caching,
if introduced later, needs bounded lifetime, invalidation semantics, and privacy review.

## Abuse and privacy analysis

| Risk | Required design response | Verification direction |
|---|---|---|
| Identifier enumeration | Permission-aware lookup, opaque references, response normalization, per-source and aggregate budgets | Compare known, unknown, unauthorized, disabled, and malformed probes |
| Timing inference | Keep the public path structurally similar, bound all branches, avoid early externally visible distinctions, and measure latency distributions | Statistical comparison under warm/cold and dependency-failure conditions; do not claim perfect constant time |
| Query-budget evasion | Combine authenticated-caller scope when available with source/network and aggregate/global controls; make checks atomic and resistant to concurrency. Defer target-scoped controls pending privacy approval. | Parallel, distributed, rollover, and retry tests |
| Budget oracle | Do not reveal target-specific counters, thresholds, or which limiter fired | Compare response body, status family, headers, and retry behavior |
| Reference correlation | Use opaque, non-semantic references with approved lifetime and rotation; never embed identity or routing data | Decode/structure review and cross-caller correlation tests |
| Identifier canonicalization collision | Define one exact canonicalization rule only after identifier selection; reject ambiguous Unicode/encoding and aliases rather than guessing | Confusable, case, whitespace, Unicode, and equivalent-form tests |
| Directory poisoning/stale state | Treat directory data as authoritative controlled state; validate eligibility and current discoverability at decision time | Disabled/revoked/changed record and unavailable-directory tests |
| Logs and metrics leakage | Allowlist safe fields; hash or tokenize only when linkage is necessary and keys/lifecycle are defined | Sink inspection for raw identifiers, references, credentials, and policy detail |
| Resource exhaustion | Bound payload, parse depth, normalization work, concurrency, queueing, deadlines, and downstream calls | Oversize, malformed, high-cardinality, slow-dependency, and burst tests |
| Discovery as authorization | Use a distinct result type with no permission/relationship fields; later modules must independently authenticate and authorize | Boundary/import tests and end-to-end negative invocation tests |

Rate limiting alone is not a privacy guarantee. Exact budgets, dimensions, reset behavior, owner
visibility, and legitimate recovery behavior affect user-visible privacy semantics and require
Product Owner approval. Random delay is not recommended as a primary defense: it can be averaged
out and creates denial-of-service pressure. Prefer structural uniformity, bounded processing,
coarse response behavior, measurement, and layered budgets.

## Dependencies and non-goals

Preparation depends on the accepted identity separation and authenticated-principal contract, but
Discovery implementation is blocked on approved decisions for discovery audience/identifier,
observable uniformity, reference lifecycle, and abuse budgets. It also needs module-level
acceptance criteria, a test plan, and an ExecPlan before its Ready gate.

Authentication technology, transport integrity, persistence, relationship creation, invitation
flows, messaging, skills, authorization for context, profiles, global/federated search, and email
ownership verification are non-goals. A test adapter may supply synthetic trusted caller evidence
and an in-memory directory, but acceptance evidence must not imply production authentication,
durability, or network security.

## ADR assessment and recommendations

No ADR is created by this analysis. ADR-0003 already establishes Discovery as a distinct boundary
that cannot grant authority, and ADR-0004 already selects PostgreSQL when transactional persistence
is introduced. Choosing an identifier/audience, external reference lifecycle, public response
uniformity, or concrete abuse policy now would resolve Product Owner or later protocol decisions
prematurely.

Before implementation, record a consequential Discovery contract ADR after the Product Owner
approves those semantics. A separate authentication ADR belongs to the future ingress/messaging
work unless the approved Discovery audience makes authentication a direct Discovery dependency.
The implementation proposal should remain a small in-process module with replaceable ports until
evidence requires a distributed directory or different protocol.
