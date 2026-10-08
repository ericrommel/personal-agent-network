# Authenticated Messaging Preparation

## Status

Preparation note for Issue #9. It is not implementation authorization, not an ADR, and not a request to close a product decision. It does not move the module to Ready for PO or Ready for Development.

## Later resolution, 2026-10-08

The Human Product Owner authorized a minimal HTTPS mutual-TLS ingress and named the MVP replay parameters on Issue #13. ADR-0007 records a 5-minute maximum window, 30 seconds of skew, and a single-use envelope `messageId`. The sender remains the certificate URI SAN. `PostgresReplayStore` is the durable message-id adapter. The node does not open a pool and does not construct that store. The sections below stay the earlier preparation record. Sentences there that leave the window unset are that record, not an open gate.

Research that may exist only on Issue #9 is not a contract. This note does not adopt it.

Accepted constraints used here:

- A remote message is untrusted input.
- Payload identity is not sender identity.
- A Discovery reference is not a bearer token.
- Relationships are directed and node-local. A message cannot create or revoke one.
- No custom cryptography, and no A2A or MCP replacement.
- Identity exposes `pan.authenticated-agent-principal/v1` and does not authenticate production credentials.

## Objective

Record which Authenticated Messaging preparation can proceed before a wire protocol, an authorizer, or production authentication exists.

The module's later job, still provisional as scope, is the receiving node's ingress boundary: authenticate a sender, reject untrusted bytes, and stop duplicate or misdirected delivery from creating a second side effect. Messaging does not decide whether a request is allowed, and it does not read private context.

That objective is limited to classification, threat constraints, and reserved decisions. It does not define an envelope.

## Non-goals

- User-visible chat, history, receipts, or a conversation product.
- Any wire protocol, path, status code, header, schema, or callback shape.
- Choosing who may authorize a request, including ALLOW, ASK, and DENY behavior.
- Production authentication, credential issuance, rotation, or revocation.
- A signature, MAC, token format, or other cryptographic construction.
- Selecting a TLS stack, HTTP framework, authentication library, database driver, or query library.
- Ingress orchestration that calls policy, skills, approval, context, or audit storage.
- Creating or revoking relationships, Discovery grants, permissions, or identities.
- Treating a Discovery reference as routing authority or as the sender.
- Durable replay storage, audit retention, and the two-node demonstration.
- Replacing or wrapping MCP or an external agent-to-agent protocol.

## What can proceed now

Preparation that only restates stable constraints can proceed:

- The receiving node is the trust boundary for anything that arrives over the network (ADR-0001).
- Remote text grants nothing (ADR-0003, SEC-004).
- Sender identity, when it exists at all, is an `AuthenticatedAgentPrincipal` from a trusted boundary. A claim in the payload is data (SEC-001).
- Discovery's `agentReference` stays an opaque, caller-scoped address. It is not an Agent Identity, a credential, or permission (ADR-0005, FR-002, PRV-001).
- Relationship non-mutation is stable. Ingress must not be able to create or revoke relationship state.
- Fail closed when authentication, integrity, freshness, recipient binding, or a required security dependency is missing or unavailable (SEC-002, REL-003).
- A duplicate request ID must not produce a second approval, action, context evaluation, or disclosure (SEC-007, REL-002). The caller-visible form of that outcome is not decided.

The following cannot proceed:

- Functional code, tests that freeze a payload, routes, adapters, and dependencies.
- An accepted authentication or protocol ADR.
- Ingress that invokes a policy decision.
- Any design another party would have to implement against, including an error catalog that reveals relationships, policy, or context.

## Dependency classification

Classes mean only the following:

| Class | Meaning for this preparation |
|---|---|
| hard | Accepted and stable. Preparation relies on it. Messaging must not reopen it. |
| contract | A versioned interface already exists and may be cited. The interface is not the missing runtime behavior. |
| implementation | Behavior messaging will need, but the interface or mechanism is not stable enough to build. |
| integration | A later seam with another boundary. It can be named. It cannot be wired. |
| none | Not a dependency. Do not adopt it, select it, or block on it. |

| Dependency | Class | Use now | Do not do |
|---|---|---|---|
| ADR-0001 receiving-node boundary. In-process modules; only cross-node work uses a future network contract. | hard | Keep messaging inside the node that receives the bytes. | Do not add a broker, gateway service, or shared multi-owner ingress. |
| ADR-0003 separation. Remote text and model output are untrusted and cannot grant authority. | hard | Keep messaging distinct from identity, relationship, skill, policy, context, approval, and audit. | Do not collapse those into one agent object or message handler. |
| SEC-001 payload identity is not sender identity. | hard | Treat every sender field in a payload as untrusted data. | Do not prefer a payload agent id over a credential binding. |
| `AuthenticatedAgentPrincipal` (`pan.authenticated-agent-principal/v1`) | contract | This branded type is the only trusted remote-agent shape Identity provides. It has no public constructor and no JSON parser. | Do not treat the type as production authentication, and do not add a parser. |
| Production credential binding and authentication lifecycle | implementation | Nothing is available. Identity's SEC-001 and SEC-002 contribution is the contract only. | Do not implement authentication, choose a library, or write an accepted ADR. |
| `pan.identity.local/v1` snapshot parser | none | Not an authentication dependency. | Do not feed network bytes to it and treat the result as a sender. A parsed snapshot is not a principal. |
| Discovery reference is not a bearer token. It is caller-scoped, rotates when a revoked grant is recreated, and is not an internal Agent Identity ID. | hard | Later use must authenticate and authorize independently of the reference. | Do not accept the reference as the caller, as permission, or as proof a relationship exists. |
| Discovery result `pan.discovery-result/v1` | contract | Success is the contract version plus `agentReference`, and nothing else. | Do not add endpoint, owner, human, relationship, or routing fields to Discovery. |
| Resolving a reference to a destination and rechecking that the grant is still usable | integration | ADR-0005 requires a later consumer to recheck usability. | Do not design that mapping, cache, or encoding now. |
| Relationship non-mutation | hard | Directed and node-local. A message cannot create or revoke either direction. This constraint is stable. Who may mutate through a local path is a Relationships decision, not a messaging one. | Do not give ingress a relationship port or mint a trusted relationship actor from a message. |
| Relationship current-read, labels, reciprocity UX, and restart behavior | none | The rest of the Relationships preparation is not a messaging contract. Messaging does not wait on it. | Do not read relationship state to authorize a request, and do not import that module's draft lifecycle. |
| Policy decision interface | implementation | Not stable enough for ingress orchestration. | Do not call policy, pass it payload text, or invent the decision request. |
| Who may authorize a request | none | Reserved product decision below. No dependency exists to implement. | Do not encode an authorizer, an approver, or a policy result. |
| Skills and the availability schema | none | FR-004 belongs to a later module. | Do not freeze skill names, intervals, or results into a message schema. |
| Approval lifecycle | integration | SEC-007 already forbids a second approval or disclosure for the same request ID. | Do not create approvals or define ASK. The approval seam is not implementable. |
| Audit storage, access, retention, export, and deletion | integration | AC-MSG-001 will eventually need a redacted event. AC-AUD-001 remains TBD-PO. | Do not build a log, retain bodies, or define the audit record. |
| Context boundary and external AI | none | Architecture forbids a messaging path to private-context repositories. | Do not add that edge, and do not send message text to a model for a decision. |
| ADR-0004 persistence direction | hard | When an authorized module first persists replay state, the store is PostgreSQL, with reviewed migrations and no second database semantics. | Do not add a driver, a migration, or an in-memory store presented as acceptance evidence. |
| Replay-store schema, window, and driver | implementation | Unset. Threat-model replay-window approval is still required before implementation. | Do not choose a retention period, clock-skew number, table, or library. |
| HTTP framework, TLS library, custom cryptography, A2A, and MCP | none | Not approved dependencies. | Do not select or invent them. Studying TLS and an existing HTTP authentication or mutual-TLS binding is a later study, not a selection. |

Issue #9 research is class **none**.

## Threat notes

These notes bind preparation. They are not mitigations that select a mechanism, and they are not closure of the residual risk in the MVP threat model.

### Spoofing

An attacker, or a compromised peer, can put any agent identifier, human identifier, owner name, or Discovery reference in a payload and assert that identity as the sender. A caller can also present another caller's reference, or replay a credential that no longer binds to an active agent.

Required constraint:

- The only sender identity is the Agent Identity inside an `AuthenticatedAgentPrincipal` produced by a trusted authentication boundary (SEC-001).
- That type cannot be parsed from the payload. The local identity snapshot parser must not be used as a substitute.
- A missing, unauthenticated, inactive, or unbound caller fails closed with no protected disclosure (SEC-002, SEC-005).
- A Discovery reference does not identify the sender. Discovery already refuses payload-asserted callers; messaging must not reopen that hole at a second door.
- No production authenticator exists. Preparation must not claim SEC-001 is implemented. A synthetic principal used by Discovery tests is not messaging evidence and is not a production mode (SEC-015).

Blocking if implementation starts without a credential binding: any path that copies a payload identifier into a principal, trusts `authenticatedAt` supplied by the client, or accepts a reference as a session.

### Replay

An attacker can resend bytes that were once valid, including before and after approval or revocation. A client can also retry and cause a second side effect. `issued-at` and `expiry` inside the payload are claims, not proof. `authenticatedAt` on a principal is evidence from a future trusted boundary, not a message timestamp and not a replay key.

Required constraint:

- SEC-006 requires integrity protection and a binding to sender, recipient, request ID, issued-at, and expiry. The binding is normative. The encoding is reserved.
- A duplicate request ID has one deterministic safe outcome and must not duplicate approvals, actions, context evaluation, or disclosure (SEC-007, REL-002, AC-MSG-001). "Safe" does not mean "return the previous protected result again."
- Stale, not-yet-valid, and expired messages fail closed (AC-VAL-001, REL-003).
- The numeric window and acceptable clock skew are not decided. Choosing them is an engineering and security decision before implementation, and it becomes a product decision if it changes what a person can observe or retry.
- ADR-0004 requires transactional persistence for replay protection once persistence is authorized. Process-local memory is not MVP acceptance evidence. The driver stays unselected, so no store is designed here.
- Replay handling must not call the unstable policy interface to decide whether the duplicate is allowed.

Blocking if a later design treats TLS session resumption, a cache of ALLOW results, or an in-memory set as sufficient acceptance evidence.

### Misdirection

A message accepted by one node can be presented to another. A payload recipient can be rewritten. A caller-scoped Discovery reference can be shown to the wrong node or reused by the wrong caller. A response can be aimed at a node that did not authenticate the corresponding request.

Required constraint:

- The recipient in the SEC-006 binding is the receiving node, not a recipient string chosen by the sender.
- The sender in that binding is the authenticated principal, not the payload.
- A reference remains usable only for the caller and grant that produced it, and only while that grant and the target stay eligible (ADR-0005). Another holder of the same bytes does not become that caller.
- Misdirection fails safely (AC-MSG-001) and must not reveal whether the recipient, a relationship, a policy, or private context exists (SEC-018, PRV-006).
- This note does not define the field, URL, certificate identity, or response channel that carries the recipient. Those are the reserved wire protocol.

Blocking if a reference is decoded into an internal agent id, or if a node accepts a message because the payload names that node.

### Tampering

An attacker can alter the body, skill, purpose, scope, request ID, timestamps, recipient, or any integrity metadata, including through a proxy. The same path carries prompt injection: instructions to change policy, self-approve, reveal context, or call a tool (AC-SEC-001).

Required constraint:

- Integrity protection is required (SEC-006). The threat model names TLS and binding as the kind of control, not a new signature algorithm.
- This preparation does not invent cryptography and does not specify how TLS is terminated. A later study of existing TLS is the allowed next step.
- TLS byte protection, even if later adopted, would not by itself bind application sender, recipient, request ID, issued-at, and expiry to an Agent Identity. That binding remains a separate fail-closed check. It is not a license to design a custom MAC.
- Remote content cannot create policy, grant capability, approve itself, expand context or tools, or override rules (SEC-004, SEC-013).
- Only validated structured fields could ever be evaluated, and this note defines none. Unexpected fields fail closed (DEV-004's posture on accepted contracts; AC-VAL-001).
- Size, depth, time, and resource bounds are required later (SEC-014). No numeric limit is chosen here.
- Logs, traces, metrics, and audit must exclude raw message bodies, secrets, and credentials (PRV-004). A tamper failure is auditable without storing the body (OBS-002). The audit schema is not defined.

Blocking if message text is passed to a model, a policy engine, or a relationship command, or if a custom signature scheme appears.

### Relationship mutation

A message can ask the receiver to create a relationship, revoke one, invert a direction, or treat Discovery as consent. A later orchestrator can act as a confused deputy by copying those fields into the local relationship control path.

Required constraint:

- Non-mutation is stable. Relationships are directed and node-local. A message must not create or revoke either direction, and it must not imply the opposite record.
- A remote message, a Discovery reference, a model output, or another node's assertion cannot create or revoke a relationship here (SEC-004; Relationships specification, remote-input rule).
- Who may mutate through a local control path remains a Relationships decision. Messaging does not authenticate that actor and does not expose a mutate path.
- Discovery's no-side-effect rule stays in force (AC-DIS-001 scenario 5, FR-002). Successful ingress must not weaken it.
- An active relationship, even when one exists, does not authenticate the caller and does not authorize the request (FR-003, AC-DOM-001). Messaging must not read the relationship boolean to fill that gap.
- The rest of the Relationships draft, including invitation, restart survival, and read allowlists, is not adopted here.

Blocking if any ingress type can reach relationship create or revoke, or if a payload field is defined for that purpose.

## Provisional assumptions

Each assumption below is provisional. None is a product decision, an ADR, or a contract.

1. Provisional: the eventual messaging responsibility is ingress authentication binding, bounded validation, recipient binding, freshness, and duplicate suppression. Policy, skills, approval, context, and audit storage remain other modules. This follows the architecture sketch and is not approved module scope.
2. Provisional: the sender used for any later decision is only the Agent Identity on an `AuthenticatedAgentPrincipal`. A matching identifier in the payload does not strengthen that evidence.
3. Provisional: transport protection will be studied as existing TLS, and credential-to-principal binding will be studied as an existing HTTP authentication mechanism or mutual TLS. Neither study has started, and neither mechanism is selected.
4. Provisional: duplicate suppression is local to the receiving node and is keyed so one request ID cannot disclose twice. The key width, window, and store are unset.
5. Provisional: authentication, integrity, replay, misdirection, and validation failures are externally non-revealing and do not confirm a relationship, a policy, or context. The status family is unset because choosing it would start the wire protocol.
6. Provisional: a Discovery `agentReference` may later be offered as an address input. It still needs an independent principal and a fresh usability check. This note does not define that offer.
7. Provisional: acceptance evidence for replay, when that module is eventually authorized, follows ADR-0004 rather than a process-local set. No schema is implied.
8. Provisional: correlation for a future minimized event is minted by the receiver after validation. A caller-supplied correlation value is data, not authority, and is not logged as a body.

## Reserved product decisions

These decisions are isolated so later work does not close them by accident. This note does not recommend asking the Product Owner to close them yet.

### User-visible chat behavior

- Recommendation: leave chat unspecified. The MVP already excludes arbitrary chat. Do not add transcripts, folders, read receipts, typing, or a human-visible message store.
- Alternatives: free-form chat between agents; a conversation resource with history; user-visible delivery and read state; retaining message bodies for the owner.
- Impact: chat adds retention, disclosure, injection surface, and a second product. It also forces a durable body schema and an authorization rule for who can read history. Those are privacy and product-scope changes.
- Reversibility: omitting chat is reversible. Shipping a transcript or receipt model is expensive to withdraw once clients and owners depend on it.
- Affected work: UI, conversation storage, body retention, notification, and any fixture that looks like a chat message. None of that work starts from this note.

### Wire protocol that would be expensive to reverse

- Recommendation: do not select a protocol. The architecture note that versioned REST/JSON is a leading proposal is not an accepted protocol ADR, and this preparation does not promote it. The later study, still not an ADR, should examine existing TLS and an existing HTTP authentication mechanism or mutual-TLS binding. Do not choose a library in that study's framing here.
- Alternatives: freeze REST/JSON and an error catalog now; adopt an external agent protocol or MCP as the bus; invent a signed envelope; publish an OpenAPI contract before authentication exists.
- Impact: a public envelope becomes an interoperability commitment under DEV-004 and AC-DEV-003. Custom signing would be a new cryptographic and identity protocol, which the MVP excludes. Using a Discovery reference or a skill body inside that envelope would couple Discovery, skills, and authorization to a shape that is costly to change. SEC-006 can be satisfied only after the binding mechanism exists; writing the fields first would pretend otherwise.
- Reversibility: a study is reversible. A published schema, framework choice, certificate identity layout, or client SDK is not.
- Affected work: protocol ADR, library evaluation, routes, schemas, reference-to-destination encoding, replay metadata encoding, and status codes. All remain unstarted.

### Who may authorize a request

- Recommendation: do not decide. An authenticated principal, a relationship, a Discovery reference, and payload text are four different facts. None of them is authorization. Leave the authorizer, the purpose, and the approval actor to later policy and approval decisions.
- Alternatives: any authenticated agent may request; an active relationship means ALLOW; the Discovery reference is a capability; the sender declares ALLOW or ASK; the message names an approver; every request waits for the human owner.
- Impact: the authorizer is a privacy and authorization semantic. MVP scope already treats purpose and ASK behavior as Product Owner decisions. SEC-003 requires a current server-side decision. SEC-004 forbids the message from making that decision. The policy interface is not stable enough to orchestrate, so choosing an authorizer now would also invent that interface.
- Reversibility: leaving the decision open is reversible. Putting an authorizer, approval verb, or policy result on the wire couples this decision to the protocol decision and is expensive to reverse.
- Affected work: policy calls, relationship reads for allow or deny, approval creation, skill permission checks, and egress. That work does not start.

## Engineering choices left unset

These are not closed and are not the reserved product decisions above.

- Authentication lifecycle, rotation, and revocation of credentials. The threat model requires an ADR before implementation. Do not draft that ADR in this preparation.
- Replay window and clock skew. No number is proposed.
- Message size, depth, and abuse budgets. SEC-014 and SEC-012 require bounds later. No number is proposed.
- PostgreSQL driver and migration layout. ADR-0004 already forbids adding them before persistent state is authorized.
- Audit access and retention. They remain TBD-PO on AC-AUD-001 and belong to Audit.
- Demonstration surface and whether acceptance runs in two processes. That is an existing MVP Product Owner decision, not a messaging protocol.

## What engineering may do next without implementation

1. Use this note as the messaging preparation record. Do not treat it as Ready for Development. Do not mark the reserved decisions closed.
2. If Identity, Discovery, or the relationship non-mutation rule changes, revisit only the dependency table. Do not absorb those modules' other drafts.
3. Later, and still without implementation, study existing TLS and an existing HTTP authentication mechanism or mutual-TLS binding. The study may compare them against SEC-001, SEC-002, SEC-006, and SEC-015. It must not select a library, must not invent cryptography, must not define an envelope, and must not be published as an accepted or proposed ADR from this preparation.
4. Security and QE may later outline AC-MSG-001 negative cases in prose: spoofed sender, tampered field, stale and future timestamps, wrong recipient, duplicate request ID, and a payload that tries to create or revoke a relationship. Outlines must use synthetic data and must not freeze bytes on the wire.
5. Do not add source files, dependencies, routes, migrations, fixtures, or an ExecPlan that assumes a protocol or an authorizer.

## Traceability

No requirement is implemented by this note.

| Accepted requirement | Preparation stance |
|---|---|
| SEC-001, SEC-002 | Contract dependency only. Production binding is absent. Owning acceptance remains AC-MSG-001. |
| SEC-004, SEC-013, AC-SEC-001 | Hard. Message text has no authority and must not reach a mutate port. |
| SEC-006, SEC-007, REL-002, AC-MSG-001 | Obligation is hard. Mechanism, window, and caller-visible duplicate response are not decided. |
| SEC-014, SEC-015, REL-003, AC-VAL-001, AC-CFG-001 | Fail closed and reject insecure production transport when configuration exists. No configuration is introduced. |
| SEC-018, PRV-004, PRV-006 | Non-revealing failures and no raw bodies. Concrete responses are reserved with the wire protocol. |
| FR-002, PRV-001, ADR-0005 | Hard constraint on references. No messaging consumer is designed. |
| FR-003, SEC-004 relationship rule | Non-mutation is hard. Relationship reads are not used. |
| FR-005, SEC-003 | Authorization stays outside messaging until a stable policy interface and an authorizer decision exist. |

## ADR assessment

No ADR is drafted.

ADR-0001, ADR-0003, ADR-0004, and ADR-0005 already hold the stable constraints above. A future ADR would be justified only after the reserved wire-protocol decision is actually studied and a Product Owner gate allows that choice. Authentication lifecycle and the replay window also require an ADR before implementation, per the threat model. Writing either document now would close a decision this preparation is required to leave open.
