# MVP Requirements

These requirements are normative. `MUST` indicates blocking MVP behavior. Product decisions marked `TBD-PO` remain unresolved and block the affected module.

Relationships preparation is tracked on Issue #7. The proposed lifecycle and the six open decisions are in `docs/modules/relationships/specification.md`. That proposal is not approved. It does not change the normative sentences below.

## Functional

- **FR-001:** Human Identity and Agent Identity MUST be distinct records; a human may own one or more agents.
- **FR-002:** A discovery request from an authenticated, active Agent Identity with a pre-seeded caller/target discoverability grant MUST resolve an exact registered email identifier to only one versioned, minimal, opaque external Agent reference. Discovery MUST accept ASCII email input only, reject surrounding/internal whitespace and non-ASCII forms, and compare after lowercasing the entire ASCII address without provider-specific, alias, or fuzzy transformations. The reference MUST be caller-scoped, remain usable only while that grant and target eligibility remain active, and rotate if a revoked grant is recreated. Resolution MUST NOT expose the internal Agent Identity ID or create or imply a relationship, trust, permission, skill access, context access, or execution authority.
- **FR-003:** Relationship state, advertised skills, and skill permissions MUST be represented independently.
- **FR-004:** The MVP MUST support a versioned `availability` skill accepting a bounded time interval and returning a boolean.
- **FR-005:** Every request MUST be evaluated against authenticated requester, target, current relationship, skill, purpose/scope, and policy before context access.
- **FR-006:** `ALLOW` MUST return only the authorized derived result.
- **FR-007:** `ASK` MUST create one pending approval and return no protected result until the target owner approves that exact request.
- **FR-008:** `DENY`, rejection, or expiry MUST return no protected result or revealing explanation.
- **FR-009:** An owner MUST be able to revoke a grant; later decisions MUST NOT use it.
- **FR-010:** The MVP MUST use simulated private availability context without a real provider.
- **FR-011:** Request lifecycle MUST represent pending, completed, rejected/denied, expired, and failed states without exposing private state remotely.
- **FR-012:** Approval MUST bind requester, target, skill, purpose, input, disclosure scope, policy version, request ID, and expiry.

## Security

- **SEC-001:** Every cross-agent request MUST authenticate the sender and bind the credential identity to the request; payload identity is not authoritative.
- **SEC-002:** Authentication or verification failure MUST fail closed without protected disclosure.
- **SEC-003:** Authorization MUST be evaluated server-side for every request using current policy and revocation state.
- **SEC-004:** Remote content MUST NOT create policy, grant capability, approve itself, expand context/tool/execution permission, or override security rules.
- **SEC-005:** Missing, ambiguous, unavailable, or unmatched authorization inputs MUST produce `DENY`.
- **SEC-006:** Messages MUST be integrity protected and bound to sender, recipient, request ID, issued-at, and expiry metadata.
- **SEC-007:** Duplicate request IDs MUST NOT duplicate approvals, actions, context evaluation, or disclosure.
- **SEC-008:** Approval MUST be single-use and invalid after any bound field, policy version, or expiry changes.
- **SEC-009:** Revocation MUST be checked at decision time and immediately before context access or disclosure; applicable pending approvals and cached grants MUST be invalidated.
- **SEC-010:** Context and tool adapters MUST accept authority only from the trusted policy result, never remote text or model output.
- **SEC-011:** Egress MUST enforce an authorized output schema and reject unexpected fields.
- **SEC-012:** Discovery and authorization failures MUST use non-revealing responses and abuse controls. Discovery MUST use exact-only bounded lookup with no bulk, prefix, or suggestion behavior; layered caller, source/network, and aggregate/global budgets; no target-specific counter without later privacy approval; and recovery/retry behavior that reveals neither the limiter nor target existence.
- **SEC-013:** External AI output MUST be treated as untrusted and MUST NOT make final authorization decisions or directly invoke tools.
- **SEC-014:** Inputs MUST have schema, size, range, time, and resource bounds.
- **SEC-015:** Production modes MUST reject placeholder secrets, debug authentication, and insecure transport configuration.
- **SEC-016:** Dependencies MUST be locked and subject to blocking secret, vulnerability, and static-analysis gates with time-bounded recorded exceptions.
- **SEC-017:** Security decisions and request state changes MUST produce access-controlled, correlated audit events without raw private context. Discovery MUST receive acknowledgement for its minimized event before successful disclosure and MUST fail closed if emission or acknowledgement fails; durable event handling remains deferred to Audit.
- **SEC-018:** Unauthorized responses MUST NOT reveal whether protected context exists or why private policy denied access.

## Privacy

- **PRV-001:** Discovery MUST disclose only the contract version and a caller-scoped opaque external Agent reference. Different callers MUST NOT receive a globally correlatable stable reference for the same target. Discovery MUST NOT disclose the internal Agent Identity ID, lookup identifier, Human Identity, owner, profile, provider, status, endpoint/routing data, relationship, context, skill, or policy.
- **PRV-002:** A successful invocation MUST disclose only the authorized boolean result and safe protocol metadata.
- **PRV-003:** Private context MUST remain behind the target's context boundary and be queried only after valid authorization/approval.
- **PRV-004:** Logs, traces, metrics, and audit MUST exclude raw context, message bodies, prompts, secrets, credentials, and derived results by default.
- **PRV-005:** Private data and audit events MUST have documented purpose, access, retention, and deletion rules.
- **PRV-006:** Denied, rejected, expired, malformed, unknown, and unauthorized outcomes MUST minimize inference through response differences. Discovery's unknown, non-discoverable, disabled, ambiguous, malformed, and otherwise ineligible lookups MUST share one public status family, body shape, header behavior, and retry behavior. Perfect constant-time behavior is not required, but Security/QE MUST enforce approved statistical timing thresholds.
- **PRV-007:** External AI providers MUST receive only explicitly approved minimum data and remain disabled for private context by default.
- **PRV-008:** Repeated queries MUST be constrained when composition could infer protected context. Discovery MAY use process-local budgets that reset on restart for the MVP, but MUST document that limitation, MUST NOT claim durable or multi-instance protection, and MUST expose only coarse privacy-safe abuse events without raw identifiers or per-target details.

## Reliability and observability

- **REL-001:** Successful revocation MUST affect subsequent decisions and follow the approved rule for in-flight and pending work.
- **REL-002:** A duplicate request identifier MUST yield one deterministic safe outcome.
- **REL-003:** Invalid, expired, unsupported, or malformed requests and unavailable security dependencies MUST fail closed.
- **REL-004:** Authorization MUST use authoritative current policy rather than stale cached grants.
- **OBS-001:** Every request MUST have a correlation ID and record safe actor references, skill, decision, state transitions, timestamps, and reason codes.
- **OBS-002:** Approval, rejection, expiry, revocation, replay, validation failure, and disclosure MUST be independently auditable.
- **OBS-003:** An authorized operator MUST reconstruct a request lifecycle without raw private context or secrets.

## Developer experience

- **DEV-001:** A clean checkout MUST support deterministic locked installation and documented format, lint, type, test, build, and verification commands.
- **DEV-002:** CI MUST fail on required format, lint, type, test, build, secret, dependency, and static-security gates.
- **DEV-003:** Fixtures MUST be synthetic and cover ALLOW, ASK, DENY, revocation, replay, malformed input, enumeration, and injection attempts.
- **DEV-004:** Public/domain contracts MUST be strongly specified and versioned; breaking changes require review and traceability.
