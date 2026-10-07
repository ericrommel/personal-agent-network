# Skills and Policy Specification

## Status

Preparation for Issue #8. This document is preparation. It is not an approved contract and not implementation by itself.

It does not authorize functional code. It does not move Issue #8 to Ready for Development. It does not record Human Product Owner approval of this module or of any Reserved choice below. Agents may recommend. They may not treat a recommendation as approval.

The Human Product Owner approved Relationships on Issue #7: pre-seeded, directed, node-local, owner-only mutation, boolean local read, and process-local memory with an explicit restart limitation. A relationship does not grant skill, permission, context, or execution authority. This specification uses that approval as an input and does not reopen it. Issue #7 is the approval record. This branch does not edit `docs/product/requirements.md`.

Interval interpretation and the approval lifecycle are not this module's decisions to close. Issue #10 owns availability instant versus half-open interval, timezone and DST, maximum horizon and duration, and query budget. Issue #11 owns the ASK channel, owner information, expiry, notification, rejection, and duplicates. Those rows stay Reserved even when this document recommends a holding position.

## Objective

Prepare the bounded Skills and Policy behavior that is already fixed by accepted PAN principles and approved requirements, and separate it from choices the Human Product Owner has not ratified.

The receiving node must be able to tell a relationship, a skill advertisement, a permission, a purpose, a disclosure scope, a policy version, and an authorization decision apart. It must evaluate the versioned `availability` skill with a deterministic deny-by-default decision before any context access. The decision is `ALLOW`, `ASK`, or `DENY`. Relationship and advertisement are inputs, never grants.

The preparable result is that decision value and the trace of which choices remain blocked. It is not a released availability answer, an approval, or a wire protocol.

## Scope

### In scope

- The product identity of one versioned `availability` skill: it accepts a bounded time interval and its authorized result is a boolean.
- Independent meaning for relationship, skill advertisement, permission, purpose, disclosure scope, policy version, and authorization decision.
- A deny-by-default evaluation sketch over those inputs. Missing or ambiguous authorization input is `DENY`.
- Outcome boundaries for `ALLOW`, `ASK`, and `DENY` that disclose no protected result from this module.
- The rule that remote content and model output cannot create policy or grant capability.
- Traceability to the accepted requirements and acceptance criteria named below.
- A decision table for the choices this preparation must not pretend are closed.
- Dependency classes for neighboring modules.

### Non-goals

- Implementation, persistence, HTTP, or a public contract.
- Completing Approval, including pending-approval creation, expiry, single-use consumption, owner UX, notification, rejection, and duplicates.
- Context computation, simulated or real, and any derivation of `available`.
- Messaging, authentication transport, replay protection, and response encoding.
- Audit storage, access, retention, export, or deletion.
- A permission administration API or owner-facing consent UX.
- Tool use, free-form skill execution, action scope, or any skill other than `availability`.
- A reusable policy language, policy DSL, or LLM-mediated decision.
- Changing accepted Identity, Discovery, or Relationships behavior.
- Numeric interval rules, timezones, horizons, or query budgets.
- Choosing who may create or revoke a skill permission.
- Two-node demonstration and external AI.

MVP scope already excludes arbitrary tools, a global directory, custom cryptography, an A2A or MCP replacement, and a reusable policy language beyond the approved availability scenarios. This preparation does not pull those back in.

## What is already fixed

The following are usable now. Restating them does not approve Issue #8.

### Skill and outcome boundaries

- **FR-004.** The MVP skill is a versioned `availability` skill. Its input is a bounded time interval. Its authorized result is a boolean. This module does not interpret the interval.
- **FR-006 and PRV-002.** A successful invocation may disclose only the authorized derived boolean and safe protocol metadata. No source event or unrelated context crosses the boundary. **AC-AUTH-001** states that response shape. This module does not produce the boolean.
- **FR-007.** `ASK` returns no protected result. Exactly one pending approval, bound to that exact request, is required before any later release. Creating and resolving that approval is not this module.
- **FR-008 and AC-AUTH-002.** `DENY`, and any later rejection or expiry, returns no protected result and no revealing explanation. The public response does not reveal the private reason. **SEC-018** and **PRV-006** require the same minimization. This module does not define how rejection or expiry happens.
- **AC-DOM-001, missing-permission half.** An active relationship and an advertised availability skill, with no matching permission, remain denied. Changing relationship, advertisement, or permission changes only that record.

### Evaluation inputs and fail-closed rules

- **FR-003.** Relationship state, advertised skills, and skill permissions are independent records. None is implied by another.
- **FR-005.** Every request is evaluated against the authenticated requester, the target, the current relationship, the skill, the purpose and scope, and policy before context access.
- **SEC-005.** Missing, ambiguous, unavailable, or unmatched authorization inputs produce `DENY`. `ASK` is not a fail-closed substitute.
- **SEC-004 and AC-SEC-001's policy rule.** Remote content cannot create policy, grant capability, approve itself, expand context, tool, or execution permission, or override a rule. Only validated structured fields can be inputs. This module does not build the messaging path that carries those fields.
- **ADR-0003, security principle 4, and SEC-013.** Authorization is deterministic. An LLM or other external model is not on the decision path. Model output is untrusted data and cannot decide or invoke a tool.
- **SEC-010.** A context or tool adapter may accept authority only from a trusted policy result produced inside the receiving node. It must not accept remote text or model output. This module does not call those adapters.
- **SEC-011.** Egress must enforce the authorized output schema and reject unexpected fields. For availability, the protected field is the boolean. This module does not define the transport envelope.
- **REL-004 and security principle 6.** The decision uses current policy, not a stale cached grant. Revocation is re-checked at decision time and, by a later disclosure path, immediately before context access or disclosure. **SEC-009** states that duty. The in-flight boundary stays Reserved.
- **ADR-0001.** The receiving node alone authorizes. A sender's claim that a relationship, permission, or approval already exists is not authority on this node.
- **Security principle 1 and the product trust model.** Authenticated identity, relationship, skill support, permission, context access, and tool execution are separate trust decisions. Success at one layer grants nothing at the next.

### Approved relationship input

Policy may consume the Issue #7 read and must not reinterpret the relationship module:

- The read is a current boolean for one directed pair on this node. It is not a list, a human identifier, a relationship id, or an event.
- Only an active directed record between two still-eligible Agent Identities reads true. Every other outcome reads false, including revoked, missing, and ineligible.
- The record is pre-seeded by the local owner. Remote text cannot create or revoke it. This module must not write it.
- Reciprocity is not implied. The opposite direction is a different record.
- Process memory may lose the record on restart. After restart the safe policy result is `DENY` until a new local seed exists. Policy must not remember a previous `true` to paper over that limitation, and it must not describe that memory as durable revocation.
- Discovery grants and Discovery references are not relationship evidence and are not policy inputs.

### Disclosure ceiling already accepted

A later successful availability response is only `{ available: boolean }` plus safe protocol metadata. Event titles, people, locations, reasons, confidence, alternative times, counts, and natural-language answers are outside that ceiling. This preparation does not decide which metadata fields are safe. It adds none.

`ASK` versus `DENY` is already part of the product vocabulary. Making those two decisions distinguishable does not permit a private reason, a calendar hint, or an owner preview.

## Concept separation

These concepts MUST remain distinct records or values. A field on one MUST NOT satisfy a check for another.

| Concept | What it is in this module | What it is not |
|---|---|---|
| Relationship | The current directed boolean from the approved local read. It is an evaluation input. | A skill advertisement, a permission, discoverability, consent, or an `ALLOW`. |
| Skill contract | The versioned `availability` contract: bounded interval in, boolean out. | An offer to a particular caller, and not a grant. |
| Skill advertisement | A separate local fact that this node currently offers that skill version. | Permission to invoke it. FR-003 and the product overview. |
| Permission | A separate current record binding parties, skill version, purpose, disclosure scope, effect, and policy version. | A relationship row, an advertisement, a Discovery grant, a message, or an approval. |
| Purpose | Why this request is being evaluated. It is matched, not inferred from prose. | Disclosure scope, and not a caller instruction channel. |
| Disclosure scope | What protected information the decision would allow across the owner boundary. For this skill the accepted ceiling is the boolean result. | Purpose, raw context, and safe protocol metadata. |
| Policy version | The identity of the current rule set that produced the decision. `ALLOW` and `ASK` are unusable without it. | An approval, a cache key the caller may present later, or a reason string. |
| Authorization decision | A fresh `ALLOW`, `ASK`, or `DENY` for one evaluation of current inputs. | A stored grant, a relationship status, a bearer token, or the boolean result. |

Consent text is not a concept this module stores. A `consent` field, an owner-looking sentence, or a self-grant instruction in remote content is untrusted data. It does not create a permission and it does not approve a request.

Human Identity and Agent Identity stay distinct under FR-001. Parties on a permission are Agent Identity ids. An email, a Human Identity id, a profile, or a Discovery `agentReference` is not a party.

## Deny-by-default evaluation sketch

This sketch is the product behavior engineering can prepare. It is not an approved port and not a wire schema. The same explicit inputs produce the same decision. The evaluator does not read a clock, a network, a model, a Discovery directory, private context, or an approval store. It does not write a relationship, a permission, an advertisement, or an audit log.

The composition root loads current inputs in the same turn. The evaluator does not accept a pre-baked `ALLOW`, a caller-supplied relationship boolean, or a caller-supplied policy version.

### Gates

Every gate is required. The first failed or uncertain gate, and any ambiguous combination, is `DENY`. Skipping a failed gate is failing open.

1. **Requester.** A trusted authenticated Agent Identity principal for this request, already established by an authentication boundary. A payload claim, a Discovery reference, an email, or a Human Identity id fails the gate.
2. **Target.** The Agent Identity this receiving node is evaluating for, chosen by the node, not by the caller. The target id is distinct from the requester id. A caller-named target does not redirect the decision onto another agent's context.
3. **Skill.** The requested skill is the versioned `availability` skill and no other skill or action. An unknown skill, an unsupported version, an extra skill, or a free-form instruction fails the gate. **AC-VAL-001** covers unknown skill as fail-closed input. This gate does not validate interval meaning.
4. **Interval presence, not meaning.** A time input may be present only as an opaque value on the request. Absence of any time input is `DENY`. This sketch does not interpret instants, half-open bounds, timezones, DST, horizon, duration, or budgets, and it does not match a permission to a particular window. A present interval still does not authorize a context query.
5. **Purpose.** Purpose must be present and unambiguous. Under the autonomous-candidate below, the only match is the literal `availability_check`. Any other purpose is unmatched. That literal is not Human Product Owner approval. See SP-R1.
6. **Relationship.** One fresh boolean from the approved read, loaded for this evaluation for the ordered pair in SP-R6. `true` is necessary and never sufficient. `false`, a read that was not performed this turn, a thrown or unavailable read, or a cached `true` is `DENY`. The opposite direction is not consulted and is not inferred.
7. **Advertisement.** A separate current advertisement for that same skill version. Advertisement without permission is `DENY` (**AC-DOM-001**). Permission without a current advertisement is also `DENY` under autonomous choice SP-A1. Neither fact rewrites the other.
8. **Permission.** Exactly one separate current permission matches the requester, the target, the skill version, the purpose, and the boolean disclosure scope. No record, a revoked record, a mismatched field, or more than one match is `DENY`. The relationship boolean is not a field on the permission. Remote content cannot be the record.
9. **Disclosure scope.** The requested protected scope is only the availability boolean. A request for events, titles, participants, locations, reasons, or raw context is unmatched and `DENY`.
10. **Policy version.** A current policy version is present on the matched rule. A missing, stale, or unavailable version cannot be treated as current. `ALLOW` and `ASK` without a version are `DENY`.
11. **Effect.** Only after every gate above passes, the permission's explicit effect is used. `allow` yields `ALLOW`. `ask` yields `ASK`. `deny`, a missing effect, or any other effect yields `DENY`. Relationship strength, advertisement, caller text, and model output never select the effect. See SP-R7.
12. **Untrusted residue.** Instructions to ignore policy, self-grant, bypass approval, reveal context, or call a tool do not change a gate. Unexpected or inherited fields on an input reject that input. They are not stripped and then accepted.

Unavailable security dependencies fail closed (**REL-003**). That includes a relationship port, a permission lookup, or a policy-version lookup that throws, times out, or returns an indeterminate result. No timeout number is chosen here.

### Outcomes

| Decision | What it authorizes here | What it must not do |
|---|---|---|
| `DENY` | No protected result and no private reason. | It must not reveal whether a relationship, advertisement, permission, or private context exists. `no relationship`, `revoked`, `no permission`, `empty calendar`, and `policy store down` are not distinct public outcomes. |
| `ASK` | A decision value only, carrying the policy version and the matched request identity a later approval would have to bind: requester, target, skill, purpose, disclosure scope, and the opaque input reference. | It must not create a pending approval, show the owner anything, return a protected result, or read context. `ASK` is not owner consent. |
| `ALLOW` | A decision value only, carrying that same binding and policy version. The only protected payload a later path may eventually release is the derived boolean. | It must not contain `available`, raw context, or an explanation. It must not call context, open a tool, or act as a reusable bearer capability. |

`ALLOW` from this kernel is not yet authority to query a caller-supplied interval. Issue #10 has not ratified what that interval means. FR-006 still fixes the later ceiling: if a result is ever released, it is only the authorized boolean and safe protocol metadata.

Any later disclosure path, not built here, must run the gates again against current relationship, advertisement, permission, and policy version immediately before context access or disclosure. A stored `ALLOW` does not skip that check. If the fresh check fails, nothing is disclosed. What happens to an already pending approval or a computed-but-undelivered result is SP-R8. This sketch has no in-flight result to classify.

### Local reasons

A local coarse class may distinguish missing input, unmatched inputs, unavailable dependency, ambiguous inputs, and rejected shape. That class is for a later minimized audit consumer and for tests. It is not a sentence about the owner's data. It is not a remote response. Messaging must not forward it. This module does not define an audit event and does not store one. See SP-A4.

## Provisional boundary for coordinator review

Status of this package: **autonomous-candidate, not Human Product Owner approval.**

The package is a privacy-preserving holding boundary so preparation can stay fail-closed. The coordinator may review it. The Human Product Owner has not ratified it. Where a row below is Reserved, this package does not close that row.

| Candidate | Rule | Why it is labeled this way |
|---|---|---|
| Fixed purpose | Compare purpose only to the literal `availability_check`. Any other purpose denies. | SP-R1 stays Reserved. The literal is the recommended option, not an approval. |
| Separate injected permission | The permission is a different record from relationship and advertisement. The preparable kernel receives it as an explicit input. It exports no create or revoke command. | Independence is already FR-003. Injection avoids closing SP-R5. It is not approval of a grantor. |
| Missing or ambiguous input | Those inputs `DENY`. `ASK` is not the fallback. | Already required by SEC-005. Repeated here so the package cannot be read as optional. |
| No remote grant | Remote content, Discovery references, and model output cannot create, revoke, or rewrite a permission or a decision. | Already required by SEC-004 and ADR-0003. Not a new product choice. |
| No LLM policy | The evaluator is deterministic application logic. No model call is part of the decision. | Already required by ADR-0003, security principle 4, and SEC-013. |

A recorded Human Product Owner decision can replace the purpose literal later. Until that record exists, preparation uses the literal and does not accept caller-supplied or owner-supplied purpose text as authority.

## Decision table

A Reserved row blocks only that choice. It does not block the deny-by-default sketch, and it does not block a row marked autonomous. No Reserved choice is approved here. Recommendations are input to a later Product Owner checkpoint, which is asynchronous.

| ID | Choice | Status | Recommended option | Alternatives | Product, privacy, and security impact | Reversibility | Work it blocks |
|---|---|---|---|---|---|---|---|
| SP-R1 | Is MVP purpose the fixed literal `availability_check`, or may the caller or owner supply one? | Reserved | Autonomous-candidate: the fixed literal only. Any other purpose is unmatched and `DENY`. | Caller free text. An owner-configured purpose list. Omitting purpose. | Purpose is matched and would later be bound into an approval under FR-012. Caller text is an injection and scope-expansion channel. Omitting purpose makes different uses of availability indistinguishable. | High while purpose is one constant and no grant stores caller text. Low after arbitrary purpose strings are persisted as authority. | Treating any purpose other than the candidate as legal. It does not block exact-match denial of non-candidate purposes. |
| SP-R2 | Is availability an instant or a half-open interval, and what timezone, DST, horizon, and duration rules apply? | Reserved. Issue #10 owns this. Not closed here. | Do not encode those rules. Do not invent a default window. A missing time input cannot fail open. This kernel's `ALLOW` does not cover a caller-supplied interval. | A UTC instant. A half-open UTC interval with a fixed horizon. The owner's local zone. An unbounded caller interval. | A wide or shifted window changes which private context a later query would touch and what repeated booleans can infer. Choosing it here would close another module's product decision. | High while time stays opaque and no query is authorized. Low once callers rely on a shipped window. | Interval-scoped permission matching, context queries, and any claim that an interval is valid. It does not block the other gates. |
| SP-R3 | What query budget and composition limit apply to repeated availability answers? | Reserved. Issue #10 owns this. Not closed here. | Set no number. This module discloses no boolean, so it has nothing to budget. | A process-local cap. A durable cap. No cap. | Boolean answers over many intervals can reconstruct a calendar. PRV-008 already requires a constraint and leaves the number open. | High before any boolean is disclosed. Low after clients depend on unlimited probing. | Numeric abuse limits and owner-visible budget behavior. It does not block `DENY`. |
| SP-R4 | What are the ASK channel, the information shown to the owner, expiry, notification or polling, rejection, and duplicate behavior? | Reserved. Issue #11 owns this. Not closed here. | This module shows nothing and creates no approval. A future Approval design must be reviewed for minimal disclosure before any owner-visible field is chosen. The ceiling, which is not a new choice, is no raw context, no other person's email or profile, and no model-written justification. | Show the full caller payload. Show a calendar excerpt. Show only that someone asked. Show a model summary. | The approval screen can become a disclosure path and a prompt-injection surface. Too little leaves the owner uninformed. AC-APR-002 already requires that another approver, a changed field, or a changed policy returns no result. The TBD-PO on that criterion remains. | High while no preview payload exists. Low after raw context has been shown or logged. | Approval records, owner UX, expiry, notification, rejection, and duplicate handling. It does not block emitting `ASK` as a decision that discloses nothing. |
| SP-R5 | Who may create or revoke a skill permission on this node? | Reserved. Not settled by an accepted principle beyond the floor below. | Only the human owner of the receiving node, through a trusted local control path that cannot be built from a message, a Discovery reference, or model output. The owner can revoke any permission stored on this node. Seeds for tests are injected records, not a remote protocol. | The requester's owner grants on the target node. Either remote party grants. Both owners must sign. The relationship itself is the grant. The agent self-grants from conversation text. | A remote or implied grantor collapses SEC-004. An implied relationship grant erases FR-003. The floor already fixed is narrower: FR-009 requires that an owner be able to revoke a grant and that later decisions not use it; SEC-004 forbids remote content from creating the grant. Exclusivity of the actor, and the create path, are not settled. The Relationships owner-only rule does not transfer to permissions. | High if no mutate port ships. Low if a remote grant API or an implied grant is released. | Create and revoke commands, owner-facing permission UX, and any claim that a demo seed is the approved lifecycle. It does not block evaluation of an injected current record, or treating a revoked or absent record as no match. |
| SP-R6 | Which directed relationship pair is the required current-relationship input? | Reserved. This is user-visible relationship use in authorization. Issue #7 approved directed records and did not choose this pair. | The receiving node requires a fresh `true` for requester to local target. The reverse pair is neither necessary nor sufficient. | Reverse only. Either direction. Both directions. An undirected edge. | The wrong pair either denies every honest request or treats a different owner action as consent to be queried. Inferring the reverse would reopen the approved directed model. | Moderate. It is local, but seeds and tests will encode it. No wire field needs to publish it. | Hard-coding a pair as approved product behavior. It does not block failing closed when the read is missing, and it does not block naming this candidate pair as the labeled input. |
| SP-R7 | When is the decision `ASK` rather than `ALLOW`? | Reserved. This is consent semantics. | The injected permission carries an explicit effect of `allow` or `ask`. The evaluator does not infer the effect. Absence is `DENY`, not `ASK`. Which demo requests are seeded `allow` or `ask` is not chosen here. | Always `ASK`. Always `ALLOW` when a relationship exists. The caller chooses. A model chooses. | Inferred `ASK` or `ALLOW` hides the owner's actual consent. A model choice puts a non-deterministic party on the enforcement path. The accepted outcome boundaries still apply once an effect is selected: `ALLOW` discloses only the later boolean, and `ASK` discloses nothing until approval. | High while the effect is just a field on an injected record. Low after an implicit matrix is shipped and owners rely on it. | An approved allow/ask matrix and owner-facing consent defaults. It does not block honoring an explicit injected effect after every other gate passes. |
| SP-R8 | After revocation, what happens to pending approvals and computed-but-undelivered results? | Reserved. MVP-scope item 5 and the TBD-PO on AC-REV-001. Not closed here. | Keep the existing unapproved recommendation: invalidate both, and do not try to retract a result that was already delivered. This module does not implement that rule. | Deliver a result computed before revoke. Leave pending approvals usable. Attempt to retract delivered results. | A result computed under an old grant can cross the boundary after the owner withdrew consent. Retracting a delivered boolean is a different product promise and may be impossible. | High while this module delivers nothing. Low once a cache or an approval store can release a stale result. | Final disclosure integration and Approval invalidation. It does not block "a revoked permission is not a match" at decision time. |
| SP-R9 | Which fields count as safe protocol metadata on a remote response? | Reserved. Externally visible protocol semantics, costly to reverse. Not chosen here. | This module defines no metadata field. The protected payload remains the boolean alone when some later module is allowed to emit it. | Correlation ids, skill name, policy version, expiry, and reason codes on the public response. | Extra public fields become a second disclosure channel and can distinguish denial causes. SEC-018 forbids that distinction. | High before a response schema ships. Low after callers depend on extra fields. | The remote response schema. It does not block a decision value that carries no metadata. |
| SP-A1 | If a current permission exists but the skill version is not advertised, what is the decision? | Autonomous | `DENY`. Advertisement and permission change independently. Both must be current. Advertisement alone remains `DENY` under AC-DOM-001. | Permission alone authorizes an unadvertised skill. Advertisement alone authorizes. | Permission without advertisement lets a grant outlive the owner's choice to stop offering the skill. Advertisement alone would violate FR-003. | High. Fail-closed can later be widened. Widening first would be a privacy expansion. | Nothing in the deny-by-default sketch. It blocks a hidden-skill invocation path. |
| SP-A2 | How are zero matches and several matches resolved? | Autonomous | Zero matches `DENY`. More than one match, or two effects that disagree, `DENY`. `ASK` is not the ambiguous outcome. | First match wins. Most recent wins. Ambiguity becomes `ASK`. A precedence language. | Ambiguous authority is the SEC-005 case. A precedence language is outside MVP scope. Falling open to `ASK` starts an approval path this module does not own. | High. A later explicit precedence can replace denial if the Product Owner wants it. | A policy DSL and any priority engine. It does not block the single exact match. |
| SP-A3 | Does this module compute the boolean or write the approval when the decision is `ALLOW` or `ASK`? | Autonomous | No. The decision value stops here. Context and Approval remain later modules. | Policy also reads the calendar and creates the pending approval. | Mixing those steps can disclose or approve before their reserved decisions exist, and it collapses ADR-0003's boundaries. | High while the ports are absent. Low if context or approval types become reachable from the evaluator. | Pulling Issue #10, Issue #11, or the context module into this kernel. |
| SP-A4 | May denial detail leave the node? | Autonomous | No. One non-revealing remote denial. A coarse local reason class may exist and must not be serialized to the caller. No constant-time claim is made. | Distinct public errors per gate. A human-readable private reason. | Distinct errors let a caller probe relationship, permission, and context. That violates FR-008 and SEC-018. Timing thresholds, if any, belong to Security and QE later and are not set here. | High before a remote DTO exists. Low after clients branch on reason text. | A public reason enum. It does not block local tests of the gates. |
| SP-A5 | What personal data may a permission record store? | Autonomous | Agent Identity ids, skill name and version, the purpose candidate, disclosure scope, effect, and policy version. No email, human-facing label, profile, endpoint, Discovery reference, credential, or raw context. | Store the canonical email or an owner label on the grant. | A second store of a discovery identifier widens leakage without helping the decision. FR-003's separation is also minimization. | High while the record stays minimal. Low after identifiers are copied into grants and backups. | A contact-card permission UI and any Discovery lookup inside policy. |
| SP-A6 | Is a local skill version token a published protocol? | Autonomous | No. Local identity is the name `availability` plus an explicit version component, assigned when implementation is authorized and reviewed under DEV-004. This preparation publishes no wire contract. The boolean result cannot gain fields without a new accepted contract. | Publish a public skill URL now. Leave the skill unversioned. | FR-004 already requires a version. An early public schema is SP-R9's problem if it adds fields. An unversioned skill cannot satisfy FR-004 or a later approval binding. | High. A local token can be renamed before publication. Low after it is on the wire. | Nothing local. It blocks treating this file as the public contract. |

SP-A1 through SP-A6 are preparation choices inside accepted fail-closed and minimization rules. They are not Human Product Owner approval of Issue #8. A later Product Owner decision can widen them. Preparation must not widen them in advance.

## Dependencies

| Dependency | Class | What this preparation may assume | What it must not do |
|---|---|---|---|
| Identity Model: Agent Identity ids and the trusted principal contract | Hard | Parties are agent ids. The requester principal comes from a trusted boundary. Human and Agent ids are not interchangeable. | Construct a principal from a payload, an email, or a Discovery reference. Reimplement identity. |
| Credential authentication and transport binding | None for this kernel | SEC-001 still requires authentication before a production request. The principal is an input, not a feature built here. | Claim that this module authenticates callers. |
| Relationships boolean read, as approved on Issue #7 | Hard | One fresh directed boolean, node-local, with process-local restart loss. | Mutate relationships, cache `true`, infer the reverse pair, or treat the boolean as a permission. |
| Discovery | None | An accepted Discovery reference grants nothing here. | Resolve email, accept `agentReference` as an agent id, or disclose policy through Discovery. |
| Issue #10 interval interpretation and query budget | Contract for any later query; none inside this kernel | A future valid-interval rule may become an exact-match input after the Product Owner ratifies it. | Close SP-R2 or SP-R3, or authorize a context query over an uninterpreted interval. |
| Issue #11 Approval lifecycle | Integration | `ASK` means no protected result until that module exists and the owner approves the exact request. The target owner is the approver already named by FR-007 and AC-APR-002. Another approver returns no result. | Create the approval, choose channel, expiry, notification, rejection, or duplicates, or treat a permission as an approval. |
| Context boundary and availability derivation | Integration, later | Private context stays behind the target boundary and is queried only after a valid authorization or approval (PRV-003). FR-010's simulated context is not this module. | Compute `available`, import a context port, or pass model output into a context adapter. |
| Messaging | Integration, later | A later envelope may deliver structured fields. Those fields stay data. | Define replay, integrity, or HTTP behavior, or let the message body satisfy a gate. |
| Audit | None | OBS-001 reason codes may later record the local coarse class. PRV-004 still excludes raw context and derived results. | Open an audit store, define retention, or put the reason class on a remote response. |
| PostgreSQL under ADR-0004 | Implementation, and only after a module is authorized to persist grants | In-memory fixtures may disappear on restart and then `DENY`. That is fail-closed. It is not durable revocation and not MVP acceptance evidence. | Add a database driver or migration in preparation, or claim restart-stable permission revocation. |
| External AI | None | The model stays outside enforcement. | Call a model or accept its output as a decision. |
| Human Product Owner ratification of SP-R1 through SP-R9 | Hard for each reserved choice only | The candidate purpose and the injected permission let the sketch stay concrete. | Mark a reserved choice approved, or implement the blocked work in that row. |

No new package, custom cryptography, identity protocol, A2A replacement, or MCP replacement is required to decide `DENY`.

## Requirement and acceptance traceability

No new requirement id is minted. This table says what preparation fixes and what it deliberately leaves incomplete. A criterion is not implemented by being listed here.

| Accepted input | What this specification fixes | What remains incomplete | Acceptance target |
|---|---|---|---|
| FR-003 | Relationship, advertisement, and permission are separate. None satisfies another's gate. | No stored implementation. | AC-DOM-001. The missing-permission denial is this module's half. Relationships already covers not writing skill or permission state. |
| FR-004 | Versioned `availability`, bounded interval in, boolean out. | Interval interpretation is Issue #10. The boolean is not computed here. | AC-AUTH-001 names the later response shape only. |
| FR-005 | The evaluation inputs and the rule that they are checked before context access. | SP-R1 purpose source and SP-R6 pair remain Reserved. | AC-AUTH-001 and AC-AUTH-002, as boundaries, not as an end-to-end release. |
| FR-006, PRV-002 | `ALLOW` may later release only the authorized boolean and safe protocol metadata. | No release path and no metadata vocabulary (SP-R9). | AC-AUTH-001. Not complete. |
| FR-007 | `ASK` releases nothing, and a later exact owner approval is required. | The approval lifecycle is Issue #11. | AC-APR-001 and AC-APR-002. Not complete. |
| FR-008, SEC-005, SEC-018 | `DENY` on missing, ambiguous, unavailable, unmatched, rejected, or expired outcomes, with no private reason. | Rejection and expiry mechanics are not defined. | AC-AUTH-002. AC-VAL-001 only for unusable authorization input, not for interval math. |
| SEC-004 | Remote content and model output are not grants and not decisions. | The messaging fixtures that deliver that content are later. | AC-SEC-001 as a policy rule. The full ingress test is not this module. |
| SEC-010 | Only a trusted in-node policy result may ever be authority for context or tools. This kernel does not call them. | The adapter that must refuse a payload-parsed decision is later. | AC-AUTH-001's authority boundary. Not a context test. |
| SEC-011 | The protected availability schema is the boolean. Unexpected protected fields are not authorized. | The egress filter belongs with the later response path. | AC-AUTH-001. Not complete. |
| AC-DOM-001 | Active relationship plus advertisement plus no permission is `DENY`. | Independent persistence is not built. | The invocation half of AC-DOM-001. |
| FR-009, SEC-009, REL-004 | A permission that is not current is not a match. A cached grant is not authority. The fresh check before disclosure is an obligation on any later release path. | SP-R8 in-flight behavior. Durable revoke. | AC-REV-001. Not complete. |
| FR-012, SEC-008 | `ALLOW` and `ASK` carry the policy version and the fields an approval would have to bind. A missing version denies. | Approval binding, single-use, and expiry are Issue #11. | AC-APR-002. Not complete. |
| SEC-013 | No model on the decision path. | The external-AI module stays deferred. | AC-AI-001. Not taken. |
| PRV-003 | No context read in this module. | The context port is later. | AC-PRV-001. Not complete. |
| PRV-008 | Repeated-query inference is acknowledged and not solved with a number. | The budget is Issue #10. | Not complete. |

FR-010, FR-011, SEC-001's credential binding, SEC-006, SEC-007, messaging replay, and audit criteria OBS-001 through OBS-003 and AC-AUD-001 are not completed here. DEV-004 applies when an implementation actually introduces a contract. This preparation is not that contract.

## What engineering should prepare now

Prepare only the kernel this specification fixes:

- Separate local facts for advertisement, permission, policy version, and the decision, with relationship consumed as a boolean input.
- The deny-by-default sketch, including AC-DOM-001's missing-permission denial and AC-AUTH-002's non-revealing `DENY`.
- The autonomous-candidate purpose literal and the injected permission, both labeled as not Human Product Owner approval.
- Outcome values that contain no `available` bit, no approval id, and no private reason.

Do not prepare, inside this module, an interval interpreter, an approval store, a context query, a message envelope, an audit sink, a create or revoke API, or a remote skill schema. Those wait on the Reserved rows and on their owning issues.

Reserved choices block only the work named in their table row. The sketch itself may be reviewed before the Product Owner checkpoint. Review does not approve it, and this document does not authorize implementation.
