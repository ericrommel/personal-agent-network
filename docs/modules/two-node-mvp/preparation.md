# Two-Node MVP Preparation

## Status

Issue #13, Module: Two-Node MVP Demonstration. This note is the Quality Engineer integration and evidence plan. It is planning only.

The Engineering Coordinator records Issue #13 as **In Preparation** because this note exists. Preparation is allowed while implementation stays blocked. This file does not authorize a demonstration harness, tests, scripts, CI, or application code. It does not approve a reserved product choice. It is not an ExecPlan. It does not use a synchronous Product Owner stop.

Checked on 2026-10-07 against Issue #13, Issue #15, and the Human Product Owner comment on Issue #7 (2026-10-06). Identity Model and Privacy-Preserving Discovery are accepted. Discovery is Done on Issue #6. Relationships is approved only for the bounded process-local implementation recorded on Issue #7. Issues #8 through #12 remain Backlog. Issue #14, External AI Integration, stays out of scope.

Checked-in Relationships documents on this branch still describe the pre-approval draft. This note does not edit them. The Issue #7 comment is the approval record used here. Normative sentences in `docs/product/requirements.md` and `docs/product/acceptance-criteria.md` were not rewritten by that approval.

## Question this note answers

Which integration dependencies are hard, what end-to-end evidence will be required, and which demonstration choices stay reserved?

## Product hypothesis

Two independently controlled Personal Agent nodes exchange a useful availability result derived from private context, and raw private context does not cross the boundary.

The final evidence, when implementation is later authorized, must exercise two separately configured node instances through the public contract. The receiver alone authorizes access. Private context stays on the receiving node. The caller sees only the permitted boolean plus safe protocol metadata.

That hypothesis is not proved by Identity, Discovery, a process-local relationship store, or this document.

## Out of scope

- External AI, real calendar providers, and production deployment.
- A global or federated directory, arbitrary chat, file transfer, tools, or free-form skills.
- Custom cryptography, a new identity standard, an A2A replacement, or an MCP replacement.
- Inventing approval expiry, replay-window length, interval or timezone rules, audit retention, or a policy language.
- Using the demonstration to implement Relationships, Skills and Policy, Messaging, Context, Approval, or Audit behavior that those modules have not accepted.

## Classification key

- **Hard.** Issue #13 implementation must not start, and its acceptance evidence must not be claimed, until this dependency is accepted for the behavior the scenario needs. A stub, fake, or in-process substitute is not that evidence.
- **Hard, evidence-split.** The dependency is hard, and accepting its current slice still does not prove a named durability or disclosure claim.
- **Accepted input.** Already accepted. Usable as a foundation. Its recorded limitations travel forward.
- **Out of scope.** Not a dependency. Must stay off the demonstrated path.
- **Reserved.** A product choice Issue #13 must not treat as decided.

Preparation of this note is not blocked. Implementation is blocked.

## Accepted inputs and the limits that travel forward

Identity Model is accepted. Human Identity and Agent Identity stay distinct (`FR-001`, `AC-ID-001`). An authenticated principal is not a relationship, a permission, or context access.

Discovery is accepted for pre-seeded, caller-specific resolution of a canonicalized ASCII email to one caller-scoped opaque reference (`FR-002`, `AC-DIS-001`). A reference is not an Agent Identity, a relationship, a skill permission, or an endpoint. Unknown, non-discoverable, disabled, ambiguous, and malformed lookups stay externally uniform. Abuse budgets are process-local, may reset on restart, and are not durable or multi-instance protection (`PRV-008`). Durable audit remains deferred. Public transport and production authentication were not accepted with Discovery.

Those limits are not defects in this plan. They become defects if a later run cites Discovery as restart-safe abuse control, deployable authentication, or Audit acceptance.

## Scenario list

The demonstration set is `ALLOW`, `ASK`, `DENY`, revocation, replay, malformed input, and minimal disclosure. These are the Issue #13 scenarios. They are not implemented here.

Each scenario is an observable at the public boundary between two owner nodes. The caller node must not satisfy it by reading the target store, sharing the target's memory, or accepting the caller's own claim of permission. Safe protocol metadata means protocol fields a later Messaging contract allows. It is not a calendar, a reason, a profile, or an endpoint. This note does not freeze that field list.

Prompt injection is part of malformed-input evidence (`AC-SEC-001`), not an eighth product scenario. Enumeration resistance stays the accepted Discovery evidence (`AC-DIS-001`). The two-node suite must not open a new directory, and it must not claim a new timing study.

`AC-QE-001` requires the acceptance and security suites, taken together, to use synthetic data and to cover this scenario list plus enumeration resistance and prompt injection. This note does not claim that criterion is met.

### ALLOW

Requirements: `FR-004`, `FR-005`, `FR-006`, `FR-010`, `SEC-003`, `SEC-010`, `SEC-011`, `PRV-002`, `PRV-003`. Criterion: `AC-AUTH-001`.

Given a current exact permission for the availability request, a valid bounded interval, and a policy outcome of `ALLOW`, the caller receives only `{ available: boolean }` plus safe protocol metadata. No source event or unrelated context crosses the boundary. The receiver evaluates the authenticated requester, target, current relationship, skill, purpose or scope, and policy before context access. An `ALLOW` path creates no pending approval.

Hard dependencies: #7 for the receiver's current directed relationship, #8 for the skill contract and policy outcome, #9 for the authenticated envelope, #10 for local derivation and the egress allowlist, #12 for a redacted decision and disclosure record. #11 must not be required to mint an approval on this path.

Blocked until those modules exist: the interval's concrete meaning, which belongs to #10, and the purpose-binding choice in MVP scope item 3, which belongs to #8. The oracle can still say that a mismatched purpose does not take the `ALLOW` path.

### ASK

Requirements: `FR-007`, `FR-012`, `SEC-008`. Criteria: `AC-APR-001`, `AC-APR-002`.

When `ASK` applies, the target creates exactly one pending approval bound to requester, target, skill, purpose, input, disclosure scope, policy version, request ID, and expiry. No protected result is returned while it is pending. The authenticated owner may release the result once by approving that exact unexpired request. Rejection, expiry, duplicate approval, changed fields, changed policy, or another approver returns no result.

Hard dependencies: #8 for the `ASK` outcome, #9 so the bound request is the request that arrived, #11 for durable single-use approval, #10 only after approval and a fresh authorization check, #12 for pending, resolution, and disclosure events. #7 is required when the policy input includes the current relationship.

`AC-APR-002` still marks approval channel, expiry, notification, and rejection semantics `TBD-PO`. Those belong to Issue #11. This scenario plans the observables above and does not pick a duration, a polling loop, or a screen.

In-memory approval state is not acceptance evidence. Single-use release and "still pending after restart" need the transactional store from ADR-0004.

### DENY

Requirements: `FR-003`, `FR-008`, `SEC-005`, `SEC-018`, `PRV-006`. Criteria: `AC-AUTH-002`, and the invocation half of `AC-DOM-001`.

No applicable permission, an explicit denial, a missing or revoked relationship, an ineligible agent, or any missing, ambiguous, or unavailable authorization input produces `DENY`. The public response contains no protected result, no private context, and no private reason. An active relationship plus an advertised skill still denies when no matching permission exists. Relationship, advertisement, and permission change only their own records.

The context port is not entered. No approval is created. Validation failures in the malformed-input scenario stay distinct from policy denial so an error does not become a private reason.

Hard dependencies: #7, #8, #9, and #12. #10 must show it was not queried. #11 must show remote text did not create an approval.

### Revocation

Requirements: `FR-009`, `SEC-009`, `REL-001`, `REL-004`. Criterion: `AC-REV-001`.

After a grant is successfully revoked, a later decision that references it is denied, and the final check immediately before context access or disclosure is denied. An applicable pending approval is invalid. Revocation is of the receiver's local directed record. Revoking one direction does not revoke the opposite direction. A remote message cannot revoke the local record. A new explicit seed after revoke is a new relationship id, not reactivation.

Same-process freshness is the Relationships module's approved behavior. It is not, by itself, Issue #13 acceptance evidence. The restart case is the PO-REL-6 gate below.

`AC-REV-001` still marks the in-flight boundary and latency `TBD-PO`. The MVP scope recommends invalidating pending approvals and computed-but-undelivered results, and not retracting a result already delivered. That recommendation is not approved. This plan must not encode it as a passing test. Evidence stops at "later decisions and the pre-disclosure check deny, and applicable pending approvals are invalid" until the Product Owner resolves the in-flight rule on the Approval and Authorization path.

Hard dependencies: accepted #7 behavior for the current read, PostgreSQL verification before any restart claim, #8 for the decision, #9 for a later request after revoke, #11 for pending-approval invalidation, #10 for the final check before disclosure, and #12 for the revocation event without private context.

### Replay

Requirements: `SEC-001`, `SEC-002`, `SEC-006`, `SEC-007`, `REL-002`. Criterion: `AC-MSG-001`.

A tampered, stale, misdirected, spoofed, or duplicate message fails safely. It does not create a second approval, a second context evaluation, or a second disclosure. Payload identity is not authentication. A duplicate request ID has one deterministic safe outcome. The attempt records a redacted audit event.

The numeric replay window and clock-skew allowance are engineering and security choices for Issue #9 unless they change product semantics. This note does not choose them. The oracle is fail closed for stale, future, altered, misdirected, and replayed envelopes, whatever window #9 later records.

Hard dependencies: #9 for integrity, recipient binding, freshness, and the replay store; #11 so a duplicate cannot approve twice; #8 so a duplicate cannot evaluate twice; #12 for the redacted event. ADR-0004 requires transactional replay protection before this scenario counts as MVP acceptance evidence. An in-memory replay cache is a unit-test device only.

### Malformed input

Requirements: `SEC-004`, `SEC-013`, `SEC-014`, `REL-003`. Criteria: `AC-VAL-001`, `AC-SEC-001`.

An invalid interval, unknown skill, oversized payload, expired request, or unavailable policy or verification dependency is bounded and fails closed. No protected result is disclosed. Unavailable security state is not access.

A message that instructs the receiver to change policy, self-grant, bypass approval, reveal context, call a tool, or ignore rules has no authority. Policy is unchanged. Only validated structured fields are evaluated. Model output is not on this path. External AI stays disabled, so this scenario does not satisfy `AC-AI-001`. It shows the demonstrated path has no external model authority.

Hard dependencies: #9 for schema, size, and authentication failure; #8 for unmatched or unavailable policy; #7 so a payload cannot create or revoke a relationship; #10 so the context port is not entered; #11 so injected text cannot approve; #12 for a redacted validation failure.

### Minimal disclosure

Requirements: `PRV-002`, `PRV-003`, `PRV-004`, `SEC-011`, `SEC-017`, `OBS-001`, `OBS-002`, `OBS-003`. Criteria: `AC-PRV-001`, `AC-AUD-001`.

The target's simulated context contains event titles, people, and locations. A permitted success still returns only the boolean and safe protocol metadata. Logs, traces, metrics, and audit contain none of those details and none of the derived result. An authorized operator can reconstruct decisions and state transitions by correlation ID without raw private context, message bodies, secrets, credentials, or protected results.

The caller receives nothing by sharing a database, a fixture file, or a log stream with the target. Evidence inspects the caller's public response separately from the target's private store.

Hard dependencies: #10 for the narrow query and egress allowlist, #12 for audit omission and reconstruction, #8 and #9 so the public body cannot grow extra fields. Discovery's process-local event acknowledgement is not this evidence.

`PRV-004` and `AC-PRV-001` already require derived results to be omitted by default. Issue #12 still has an open decision on who may inspect, export, or delete audit records, and on retention. That open decision blocks Audit implementation. It does not permit logging the boolean or the calendar.

Repeated boolean queries can still sketch a schedule. The availability query budget is an unresolved Issue #10 decision (`PRV-008` beyond Discovery's budgets). This scenario must not claim inference resistance that budget would provide.

## Dependency classification

| Issue | Module | Class | What #13 needs from it | What remains blocked |
|---|---|---|---|---|
| #7 | Relationships | Hard, evidence-split | The receiver's current directed, pre-seeded relationship, and a revoke that the next local read honors. Both nodes are seeded locally. A Discovery reference is not that seed. | Process-local memory is not restart-safe authority. See the durability gate. Issue #7 acceptance alone does not unblock Issue #13. |
| #8 | Skills and Policy | Hard | A versioned `availability` skill and one deterministic `ALLOW`, `ASK`, or `DENY` from current authenticated identity and state. Deny by default. Advertisement is not permission. | No kernel exists. Purpose binding, policy precedence, and policy versioning are open there. A general policy language is out of scope. |
| #9 | Authenticated Messaging | Hard | The public cross-node contract: sender binding, integrity, recipient, request ID, issued-at, expiry, replay rejection, and fail-closed ingress. | No transport or authentication mechanism is accepted. An in-process call is not the public contract. The replay window is undecided. |
| #10 | Context Boundary and Availability | Hard | Simulated private context, a narrow local query after authorization, deterministic boolean derivation, and an output allowlist. The final revocation check before disclosure. | Real calendars are out of scope. Instant versus interval, timezone and DST, horizon, duration, and query budget are open Product Owner decisions. |
| #11 | Approval Lifecycle | Hard | One bound pending approval, no early result, single-use release, and invalidation on reject, expiry, change, duplicate, or applicable revoke. | Channel, owner information, expiry, notification versus polling, rejection, duplicates, and the in-flight revoke boundary are `TBD-PO`. |
| #12 | Audit | Hard | Correlated redacted events for decision, approval, revocation, replay, validation failure, and disclosure, plus reconstruction without private content or the derived result. | Access, export, retention, and deletion are `TBD-PO`. Minimized Discovery events are not operator audit. |

Identity and Discovery are accepted inputs, not substitutes for any row above. Issue #14 is out of scope and is not a soft dependency.

All six rows are hard for the suite. No row is optional because another row could stub it. `ALLOW` does not need an approval record, but the suite includes `ASK`, so Issue #13 is still hard-blocked on #11. `DENY` must not enter #10, but that proof still waits on #10's port existing.

ADR-0004 is a cross-cutting hard evidence gate, not a seventh module and not a reason to add a database in this preparation. In-memory state is acceptable for unit tests. It is not MVP acceptance evidence for revocation, replay, single-use approval, policy versioning, or audit. The first approved module that introduces persistent state selects the driver and ships reviewed migrations. This note does not choose that module or that driver.

### Routing constraint that can be planned now

Discovery must not disclose an endpoint (`PRV-001`). The harness, acting as the operator, may already know both process addresses. The discovery result and the availability response still must not carry a routable address, a profile, or a relationship. The opaque reference is an identifier inside a later envelope, not a URL and not authority. A shortcut that embeds a network address in the reference is a privacy failure, not an integration strategy. How ingress is reached is Issue #9's transport problem, inside that constraint.

### What can be planned now

- The seven oracles, their requirement IDs, and the public-boundary falsifiers below.
- Which issues are hard, and which evidence claims remain split even after a module is accepted.
- Ownership: future Backend work owns the harness tests; QE owns independent verification and does not write those tests in advance.
- Synthetic fixture rules and the non-claims that must appear on any future evidence package.
- The reserved process and surface recommendation, without treating it as approval.
- The PO-REL-6 durability gate, including the restart case that must fail closed once PostgreSQL exists.
- The rule that at least one `ALLOW` path should obtain its target reference through the accepted Discovery contract, then show that the reference grants nothing by itself. Other cases may start from a fixture reference so a lookup failure does not hide a policy failure. This is an evidence composition choice, not a new Discovery contract.
- Ordering: module acceptance of #7 through #12, the durability gate for restart claims, resolution of the reserved demonstration choices, and explicit Human Product Owner authorization of Issue #13 all come before functional demonstration work.

### What cannot be implemented

- Any demonstration process, CLI, local API, UI, fixture runner, script, workflow, or test.
- PostgreSQL, a driver, a migration, or a second datastore "so the demo is ready."
- A single-process pair of objects presented as two owners.
- Shared memory, a shared repository, or a test double that returns `ALLOW`, a boolean, or an audit row the real module did not produce.
- Closing `TBD-PO` items that belong to Issues #8, #10, #11, or #12.
- A numeric replay window, approval expiry, timezone rule, or audit retention value.
- Production deployment, a real calendar, or an external model.
- Moving Issue #13, or any of #8 through #12, along the delivery states.
- Citing a green Relationships suite, once it exists, as two-node acceptance.

A developmental composition of accepted modules may happen only inside those modules' own authorized tests. It is not authorized by Issue #13, and an in-memory composition is not acceptance evidence.

## QE evidence and limitations

No evidence for Issue #13 exists today. `tests/integration/` records that the bootstrap has no product integration. Discovery and Identity evidence does not extend to this suite. A skipped test would not count later.

When the hard dependencies are accepted and Issue #13 is explicitly authorized, evidence must include all of the following.

- Developers own the automated end-to-end tests, fixtures, and regressions. QE reviews traceability and independently verifies the requirement evidence and the adversarial cases. QE does not implement the missing suite.
- Test names include the `AC-*` identifiers above.
- The run uses two separately configured node processes, unless the Product Owner has rejected that reserved recommendation. A one-process test is a component probe and must be labeled as not acceptance.
- The nodes speak only through the public contract. The caller does not import the target's repositories.
- Fixtures are synthetic. Private context fixtures include titles, people, and locations. No real personal data, credentials, or provider accounts appear in fixtures, logs, or CI artifacts.
- Each scenario records the command, the public response, and a separate inspection of target logs and audit. The pass condition is the oracle in the scenario list, not a coverage percentage.
- `npm run verify` and the repository security gates remain necessary and are not sufficient. Coverage does not replace these behavior tests.
- P0 failures block acceptance: authorization bypass, a protected result before approval, reuse of a revoked permission, context leakage, spoofing, replay, tampering, prompt-injection authority, and sensitive audit leakage.
- Exploratory probes, after an implementation exists, cover revoke between decision and disclosure, duplicate delivery, indirect leakage through errors and metadata, restart, and malicious fields. A confirmed defect becomes a developer-owned regression.

Falsifiers, for the future suite:

- The caller can see a title, participant, location, calendar, private denial reason, endpoint, or human identifier.
- An `ASK` path returns a result before the bound owner approval, or returns it twice.
- A request after a successful revoke still discloses, including a request that was approved but not yet released.
- A replayed, tampered, spoofed, misdirected, or stale message discloses or creates a second approval.
- Remote text creates a relationship, changes policy, or selects `ALLOW`.
- One process, or one shared store, is offered as proof of independent control.
- An in-memory revoke is offered as proof that revocation survived restart.

Limitations that must stay visible on the evidence package until a later accepted module closes them:

- Discovery budgets reset on restart and do not protect multiple instances.
- Process-local relationship state is not restart-safe authorization.
- Boolean answers can leak a schedule until an approved availability query budget exists.
- Approval channel, expiry, notification, and rejection details are not decided.
- The in-flight revocation boundary is not decided. Delivered results are not assumed to be retractable.
- Audit access, retention, export, and deletion are not decided. Omission of context and derived results is already required.
- `AC-CFG-001` is not executable until production configuration exists. This demonstration is not that configuration.
- `AC-AI-001` stays deferred. The suite shows no external model on the path. It does not accept an AI adapter.
- The other node's relationship copy is unchanged by a local revoke.
- A harness that injects a trusted principal and skips credential binding does not satisfy `SEC-001`.

## Reserved decisions

These choices are not approved. The recommendation is QE's. Implementation of the surface waits for an explicit Human Product Owner decision and for Ready for Development on Issue #13.

### Two separate processes

- Decision statement: Must final acceptance run two separate operating-system processes, one owner boundary each?
- Status: Reserved.
- Recommendation: Yes. This matches ADR-0001, the MVP success boundary, and the recommendation already written on Issue #13.
- Alternatives considered: Two logical nodes inside one process. A recorded trace instead of a live run. More than two processes.
- Impact: One process can share memory and overstate independent control. It may be used later only as a labeled component probe. A trace does not show the receiver enforcing a live request. The harness, process supervision, and CI service shape wait on this choice. This preparation does not.
- Reversibility: High before harness code exists. Low after tests encode a single-process oracle. Choosing two processes does not prevent a later UI.

### Demonstration surface

- Decision statement: Is the human or test driving surface a thin local API, a CLI, or a minimal UI?
- Status: Reserved. API versus CLI is not a separate product approval. A UI is the choice that must not be assumed.
- Recommendation: Two separate processes, driven by a thin local API or CLI over the public contract. Do not build a minimal UI for the acceptance surface.
- Alternatives considered: A small web UI as the only surface. A UI plus a CLI. Documentation with no runnable surface. A test-only in-process method with no API or CLI.
- Impact: A UI is a product-design, consent, accessibility, and phishing-review surface and is not justified by the current scenarios. The approval channel, if `ASK` needs an owner interaction, remains an Issue #11 decision and must not be silently chosen by this surface. Docs-only evidence does not prove the trust path. An in-process method repeats the one-process failure. Either a thin API or a CLI can drive the same contract. The local surface must not mutate relationships, policy, or audit, and it must not become a second authorization path.
- Reversibility: High between API and CLI while both stay thin adapters over one accepted contract. Additive if a UI is approved later and the public contract remains the evidence boundary. Low if acceptance is defined only as screens, because consent semantics would then live in the UI.

No other demonstration choice is reserved here. Upstream open decisions stay with their module issues.

## Durability gate from PO-REL-6

The Human Product Owner approved PO-REL-6 with this boundary: a process-local, in-memory adapter is acceptable for the bounded Relationships implementation and for that module's own verification. Restart may discard relationship and revocation state. That limitation stays explicit.

The same adapter must not be treated as authoritative security evidence for any end-to-end flow whose correctness depends on revocation surviving restart. Before relationship state is used as durable security authority in the two-node MVP, or claimed as restart-safe by a downstream authorization flow, PostgreSQL persistence selected by ADR-0004 must exist, and its revocation behavior must be verified.

Later modules may use the in-memory adapter for isolated unit or component development only when they do not claim durability or restart-safe authorization from it.

The gate for Issue #13 is:

1. A same-process revoke that the next read honors is Relationships evidence. It is not two-node acceptance evidence.
2. The restart claim is hard-blocked until a PostgreSQL-backed relationship store is the authority under test.
3. The required observation is: revoke succeeds, the receiving process restarts, and both the next decision and the check immediately before disclosure still deny. Applicable pending approval state, once Issue #11 exists on that same durable authority, is still invalid after restart.
4. A startup path that reloads a static `active` seed after a revoke is a defect, including in the process-local slice.
5. Empty memory after restart must not be reported as a successful durable deny. It is loss of state. The evidence has to show the revoked record is what the new process loaded.
6. Replay protection, single-use approval, and audit reconstruction have the same ADR-0004 rule even though they are not PO-REL-6. An all-in-memory two-node run is not MVP acceptance evidence.
7. This preparation does not add the database, the driver, or a migration, and it does not pull that work back into the process-local Relationships slice.

## Planning boundary

This note may be used to keep Issue #13's backlog package honest. It must not be cited as implementation authorization, as Product Owner acceptance of the demonstration, or as completion of `AC-QE-001`. Architecture, security review, and an ExecPlan for Issue #13 remain separate work and are not done by this file.
