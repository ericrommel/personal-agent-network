# Audit Preparation

## Status

Preparation note for Issue #12. This is not implementation authorization, not Ready for
Development, and not Product Owner approval. It does not add a sink, schema, driver, query
API, or package.

Discovery and Relationships do not need to be Done for this note. Their current or proposed
events are inputs. This note does not change their contracts and does not ask either module
to finish.

Process-local sinks in earlier modules are not Audit acceptance evidence. A fake, an
in-memory array, or a producer port that only observes inside the current process can show
that a minimized event was shaped. It cannot show durable storage, access control,
retention, export, deletion, or operator reconstruction. It does not satisfy `AC-AUD-001`,
`OBS-002`, or `OBS-003`. `npm audit` is a dependency gate and is unrelated.

## Question this note answers

What minimized event and privacy model can be prepared now, and which audit-access choices
stay Reserved Product Decisions?

Prepared now: purpose, a provisional vocabulary, redaction rules, dependency classes, and
storage options that remain provisional. Reserved: who may inspect, export, retention, and
deletion. The smallest access model below is a recommendation inside those reserved
choices. It is not approved.

## Accepted constraints

These are already normative. This note does not reopen them.

- Audit reconstructs decisions and state transitions. It does not store raw private
  context, message bodies, prompts, secrets, credentials, or derived results by default
  (`SEC-017`, `PRV-004`, `OBS-003`, `AC-AUD-001`, `AC-PRV-001`, security principle 9).
- Derived-result omission is the default, including the availability boolean. MVP scope
  item 7 asks for confirmation of that omission; the omission itself is accepted. Item 7
  remains open only for who may inspect, export, and delete, and for how long records are
  kept.
- Discovery acknowledges a minimized event inside the disclosure commit and fails closed
  when that acknowledgement is missing or indeterminate (`SEC-017`, ADR-0005). The event
  is `pan.discovery-event/v1`: correlation id, caller id or `unresolved`, outcome
  `resolved` or `not-resolved`, and control `none`, `budget`, `dependency`, or
  `validation`. It has no email, target id, returned reference, credential, or
  target-existence detail.
- Relationships preparation proposes a smaller local event, `pan.relationship-event/v1`:
  contract, correlation id, source key, command `create` or `revoke`, outcome `accepted`
  or `rejected`, and control `none`, `validation`, `conflict`, or `dependency`. Party ids
  and relationship ids stay in the relationship store. That proposal is not a finished
  Audit feed.
- Remote content cannot grant authority, write policy, or approve itself (`SEC-004`,
  ADR-0003). An audit row is not a capability.
- Each node is one owner boundary (ADR-0001). Audit does not cross nodes.
- When durable state is eventually introduced, ADR-0004 already selects PostgreSQL and
  already says audit storage excludes raw private context. This note does not introduce
  that database.

There is no per-event override that turns redaction off. A caller, a model, or a producer
payload cannot set one.

## Purpose

`PRV-005` requires a purpose. The purpose prepared now is limited to these uses:

- reconstruct a request's security decisions and state transitions for the owning node by
  correlation id;
- support fail-closed acknowledgement before disclosure or before new local authority
  becomes visible;
- support later evidence for `AC-AUD-001` and `AC-PRV-001`.

That purpose is not product analytics, model training, cross-owner supervision, advertising,
or a backup of private context. External AI stays disabled for this data (`PRV-007`).

Access, retention, and deletion rules are stated below as reserved recommendations.
`PRV-005` is not met for implementation acceptance until the Product Owner selects them.

## Boundary

Audit is an append-oriented record of minimized security events with correlation and closed
reason codes. It is a separate boundary (ADR-0003). It does not decide `ALLOW`, `ASK`, or
`DENY`, does not read private context, and does not write identity, discovery, relationship,
skill, approval, or policy state.

Producers own their decisions. Audit owns whether a minimized event is accepted, how it is
later stored, and how an authorized reader reconstructs it. Discovery owns its commit port.
Relationships owns its local mutation. Neither ownership moves in this note.

```text
trusted local producer
  -> build a flat allowlisted event
  -> Audit accept or refuse
  -> provisional store
  -> local reconstruction by correlation id
```

Messaging, approval, policy, and context are later producers. This vocabulary leaves slots
for them. It does not specify those modules and does not require them.

The authoritative store keeps subject detail. Audit keeps the transition. Discovery's
caller id is the accepted exception: that field is already part of the minimized Discovery
event. Audit must not generalize that exception to other producers, and must not join
another store to decorate an event.

## Provisional event vocabulary

This is a preparation vocabulary, not a versioned contract to implement now. A later
implementation that introduces `pan.audit-event/v1` needs `DEV-004` and `AC-DEV-003`.
Producer contracts stay as they are.

### Common record

A normalized record, if Audit is later authorized to form one, is a flat object. No nested
bag, no free-text detail, and no extra properties.

| Field | Provisional content | Privacy note |
|---|---|---|
| `contract` | `pan.audit-event/v1` | Constant. Not a capability. |
| `eventId` | Opaque id minted by Audit at accept time | Not derived from private content, email, or a party id. |
| `correlationId` | Bounded opaque token | Query key. Untrusted if a remote caller supplied it. Not a metric label. |
| `recordedAt` | Node receipt time from a trusted local clock | Ordering key. Not a remote timestamp. |
| `sequence` | Node-local order among accepted events | Breaks equal timestamps. Not from the producer. |
| `producer` | Closed token | Which boundary emitted the event. |
| `action` | Closed transition token | The lifecycle step, not a sentence. |
| `outcome` | Closed token | Coarse result of that step. |
| `decision` | `allow`, `ask`, `deny`, or `not-applicable` | Policy decision only. Never the derived boolean. |
| `skill` | `none` or a closed skill token such as `availability` | Identifies the contract. Not skill arguments. |
| `reasonCode` | Closed token | No narrative and no payload fragment. |
| `control` | Closed token | Validation, dependency, budget, replay, conflict, or `none`. |
| `subjectRef` | `none`, `unresolved`, or a safe actor reference the producer already emitted | Optional. See below. |
| `controlPathRef` | Bounded opaque local control-path token, or absent | Only if the producer already emitted one, such as Relationship `sourceKey`. Not a party id and not a metric label. |

`correlationId` reuses the bound already used by Discovery: one leading ASCII alphanumeric,
then up to 127 characters from `A-Z`, `a-z`, `0-9`, `.`, `_`, `:`, and `-`. Values outside
that pattern are not stored, even in redacted form. Discovery's literal `invalid` is a safe
substitute the producer already uses when the request did not parse. Audit must not replace
it with the rejected input.

`subjectRef` is how `OBS-001`'s "safe actor reference" stays small:

- `none` when the producer did not emit a party, as in the Relationships proposal;
- `unresolved` when Discovery has not bound a caller;
- an internal Agent Identity id only when the producer contract already contains that id,
  which today means Discovery's `callerId`.

It is not an email, human id, display name, Discovery reference, relationship id, credential,
source address, or raw network identifier. Audit does not add a `subjectRef` the producer
omitted.

### Closed tokens for events that can be named now

Producer tokens that can be reserved now: `discovery`, `relationship`. Later tokens, not
required and not specified here: `policy`, `messaging`, `approval`, `context`,
`disclosure`.

Actions that can be named now:

| Producer event | `action` | `outcome` | `decision` | `subjectRef` |
|---|---|---|---|---|
| Discovery `resolved` | `discovery.lookup` | `resolved` | `not-applicable` | existing caller id |
| Discovery `not-resolved` | `discovery.lookup` | `not-resolved` | `not-applicable` | caller id or `unresolved` |
| Relationship `create` | `relationship.create` | `accepted` or `rejected` | `not-applicable` | `none` |
| Relationship `revoke` | `relationship.revoke` | `accepted` or `rejected` | `not-applicable` | `none` |

Discovery `control` maps directly to `control` and `reasonCode`. Do not split
`not-resolved` plus `none` into unknown, disabled, unlisted, or no-grant. That split would
add the target-existence detail ADR-0005 keeps out of telemetry.

Relationship `command` maps to `action`. Relationship `sourceKey` may be kept only as a
separate `controlPathRef`: a bounded opaque token from the trusted local control path, same
character bound as a correlation id. It is not a party id. It is not added to Discovery
events. It is not a metric label. If a future producer has only a raw address, it emits a
coarse control code and not the address.

Skill is `none` on both current producers.

### Slots for later producers

These names are reserved so later modules do not invent a second log. They are not a
requirement that those modules emit them, and they are not acceptance criteria for those
modules.

| Later transition | What the event may say | What it must not say |
|---|---|---|
| Policy evaluation | `policy.evaluate`; decision `allow`, `ask`, or `deny`; opaque policy version; closed reason | Interval, purpose prose, context, derived boolean |
| Approval | `approval.pending`, `approval.approved`, `approval.rejected`, `approval.expired`, `approval.consumed` | Approver secret, bound input, message body, result |
| Revocation check | `revocation.checked`; outcome `still-valid` or `invalid` | Grant document, party ids copied from the grant |
| Messaging rejection | `messaging.rejected`; control `replay`, `stale`, `tampered`, `misdirected`, `duplicate`, or `unauthenticated` | Body, signature, credential, nonce material |
| Context | `context.accessed`; outcome `queried` or `suppressed` | Titles, people, locations, notes, query text |
| Disclosure | `disclosure.released` or `disclosure.suppressed`; skill token; output schema version | Any output value, including `available` |
| Caller-side receipt | `response.received`; outcome `boolean-received`, `negative`, or `transport-failed` | The boolean or any other derived value |

An approval store may keep the exact binding required by `FR-012`. That binding is not
copied into Audit. Recording `allow` is a decision. Recording `available: true` or
`available: false` is a derived result and is forbidden on both the caller node and the
target node.

Policy version, when a later producer has one, is an opaque bounded token. Policy text is
not stored. Remote issued-at and expiry are not stored by default. A later messaging
producer may add a closed freshness token (`fresh`, `stale`, `expired`, or `skew`) without
the raw times. Adding the raw times needs a new privacy review.

### Reconstruction shape

An authorized reader, once inspection is approved, queries one correlation id and receives
the accepted events for that id in `sequence` order. Example of the shape only:

```text
messaging.accepted          decision=not-applicable
policy.evaluate             decision=ask        reason=approval-required
approval.pending
approval.approved
revocation.checked          outcome=still-valid
context.accessed            outcome=queried
disclosure.released         skill=availability
```

A denial, expiry, replay, validation failure, or suppressed disclosure is its own event
(`OBS-002`). The list still has no context, body, prompt, secret, or boolean. Empty means
nothing accepted remains for that id. A missing id and a retained-then-expired id look the
same. There is no neighbor query, no actor index, and no join to domain tables at read
time.

Audit appends. It does not collapse history by correlation id. Repeated Discovery lookups
stay repeated events. Deduplication belongs only to a later producer that defines its own
attempt id for one transition. Discovery does not have that id, and this note does not add
one.

### Ingestion rules

- Accept a known producer contract only when every field is on that contract's allowlist
  and no unknown field is present.
- Do not scrape the Discovery disclosure-commit input. That input carries the grant,
  email, target id, and reference. The audit event is the minimized event alone.
- Do not join the relationship store, or any later store, to fill in party ids.
- Reject a superset. Do not scrub and then acknowledge success. A buggy producer that
  passes the whole request must not be told the rich object was recorded.
- On rejection, do not log the rejected object. A coarse failure counter is the only
  residue.
- Remote payload fields named like audit fields are data. They are not events. Only
  trusted in-process producers may append, and only after their own decision code has run.

## Redaction rules

Allowlist by contract version. Anything not named is forbidden. Forbidden material is not
stored in Audit and is not allowed to leak through logs, traces, metrics, errors, test
artifacts, or a later export.

Forbidden by default:

- raw private context, including event titles, people, locations, notes, and attendee lists;
- message bodies, prompts, model output, and other free remote text;
- secrets, credentials, tokens, authorization headers, cookies, key material, and connection
  strings;
- derived results, including the availability boolean and any other skill output;
- lookup identifiers, including email addresses;
- Discovery references and internal target ids on Discovery events;
- relationship ids and relationship party ids;
- human ids, names, profiles, endpoints, and routing data;
- raw network addresses and unbounded source identifiers;
- policy narrative, stack traces, and payload fragments;
- hashes or other encodings of forbidden values, which remain identifying and are not a
  substitute for omission.

Closed codes cannot contain whitespace or producer-chosen sentences. A new code is a
contract change, not a runtime string.

Metrics, if a later implementation has any, may count by the closed `producer`, `outcome`,
and `control` tokens only. They must not use correlation id, subject reference, source key,
or any forbidden value as a label. Traces and application logs use the same allowlist or a
smaller one. They do not carry a richer body than Audit. No trace exporter is selected.

Public and remote errors stay non-revealing (`SEC-018`, `PRV-006`). They are not the audit
record. Internal Discovery distinctions stay at the coarse control already emitted. Owner
audit does not get a finer Discovery reason than the producer event.

Rejection behavior:

- Class C, defined below: the producer does not disclose and does not keep new authority.
- Class R: the safety write stands, and the bad event is still not stored.
- Class N: the safe public failure stands, and the bad event is not stored.

There is no admin switch, debug flag, or producer argument that stores a forbidden field
"just this once".

## Dependency classes

Dependencies are classified by what Audit failure is allowed to do. Earlier process-local
sinks sit in Class P no matter how complete the producer module is.

### Class P — process-local observation

The current Discovery event port, when backed by a test double or process memory, and the
Relationships proposal's synchronous in-memory observer. Restart drops them. They have no
operator query, no access-control decision, and no retention rule.

Process-local sinks in earlier modules are not Audit acceptance evidence.

### Class C — acknowledgement before disclosure or new authority

Exact `true` is required before a successful disclosure or before new authority becomes
visible. Throw, timeout, partial write, a non-true value, or an indeterminate result is
failure. The producer then fails closed.

This is Discovery's disclosure commit today. Relationships preparation uses the same idea
for create: if the minimized event cannot be recorded, the create rolls back. Later context
disclosure and approval release belong here when those modules exist. Audit must not weaken
Class C into best effort.

The event that is acknowledged is the minimized event, not the commit input that surrounds
it.

### Class R — safety writes that must not wait on Audit

Revocation and any later invalidation of authority must stick even if the observer fails.
Relationships preparation already does this for revoke: the row stays revoked, the command
still reports revoked, and retry is idempotent. Restoring `active` to chase an observer
would put authority back.

Audit must not expose a rollback or restore API. A missed Class R event is a completeness
gap. The gap is closed, when both sides are later durable, by the authority module writing
the minimized event in the same local transaction as the safety change. That integration is
not authorized here, and Relationships is not required to build it for this note. Until
then, the accepted residual remains: a revoke can exist without a durable audit event.

### Class N — paths that already disclose nothing

Validation failure, authentication failure, replay rejection, dependency failure, and
ordinary denial already return no protected result. The public response must not change
because Audit is down, and it must not reveal that Audit is down.

Discovery's negative path matches this class today. It asks the event port to acknowledge a
minimized `not-resolved` event, but the uniform negative response does not depend on that
call returning exact `true`. This note does not require Discovery to change that.

Recording is still required when the sink is healthy (`OBS-002`). A miss is audit
completeness risk (quality-strategy P1), not a reason to disclose. Leakage of the attempt
payload would be P0.

### Class Q — reconstruction

A later query reads by correlation id and does not sit on the authorization path. Query
failure returns no data and must not fall back to raw logs. It also must not change an
in-flight allow or deny. Audit records never authorize a tool, a disclosure, or a grant.

Who may call Class Q is `PO-AUD-1`.

### Class X — excluded dependencies

Not dependencies of this module: a hosted log vendor, SIEM, APM, analytics platform,
cross-node audit replication, a shared multi-owner audit database, or an LLM summarizer.
Shipping events to any of them is an export and is reserved under `PO-AUD-2`. None is
selected.

## Provisional storage options

No option is adopted by this note. No driver, migration, file, or service is added.
Integrity against a compromised host is a residual from the threat model: minimization
limits what that host can leak or alter, and custom tamper-evidence cryptography is not
justified. Prefer a later database role that can insert but not update. Do not invent a
hash chain.

| Option | What it is | Why it stays provisional |
|---|---|---|
| Process-local memory | The Class P sink producers can use now | Not durable and not acceptance evidence. Restart loss is an availability limit on evidence, not a grant of authority. |
| Append-only PostgreSQL in the same node | The direction ADR-0004 already requires when some approved module first persists transactional state | Leading option for a later authorized implementation. Driver and query library stay unchosen, as ADR-0004 requires, until that implementation. Not opened here. |
| Append-only local file | A single-node log file | Weaker crash, lock, and access-control behavior. Not recommended. Not selected. |
| External log, SIEM, or analytics platform | A processor outside the node | Not selected and not compared. It is an export, a second retention regime, and a vendor decision. Out of scope for this preparation. |

Two nodes do not share a store. In-memory state remains unacceptable as MVP acceptance
evidence (ADR-0004). Choosing the PostgreSQL direction later is still reversible before the
first migration. Choosing an external platform is not, because copies outlive the decision.

Durable writes should not start until retention and deletion are decided. A query surface
should not start until inspection is decided. Those are gates for a future implementation,
not permission to start one.

## Reserved Product Decisions

`AC-AUD-001` already marks access, retention, export, and deletion as `TBD-PO`. The four
decisions below are that set. Recommendations are not approval. Alternatives are not
authorized scope.

The smallest access model, reserved as a whole, is:

- the human owner inspects only that owner's node;
- inspection is a trusted local read by one correlation id;
- there is no export;
- retention is one short fixed window;
- deletion is expiry under that window, with no edit and no agent delete;
- writers are insert-only;
- derived results stay omitted under the accepted rule.

### PO-AUD-1. Who may inspect

- Decision statement: Who may inspect audit records on a node, and by which query?
- Recommended option: Only the human owner of that node, through a trusted local control
  path. The read is one correlation id at a time and returns only the allowlisted events.
  No remote agent, counterparty, other node's operator, platform operator, or automated
  analytics principal. `AC-AUD-001`'s authorized operator means that owning human for the
  local demonstration, not a new role. The demonstration surface in MVP scope item 8 may
  call this local path later; it must not widen the audience. Item 8 is not decided here.
- Alternatives considered: The owner plus a local delegate. Both parties to a request.
  A platform operator distinct from the owner. A remote agent with a read tool. An actor
  index or a search across events.
- Product/security implications: The smallest audience matches the node trust boundary and
  avoids a second disclosure channel. Counterparty or remote reads would expose denial
  classes, Discovery caller ids, and revocation timing. A platform operator needs an
  account model the MVP does not have. An actor index turns Audit into an activity
  directory. Local owner read is enough to reconstruct a demo request without those
  expansions.
- Reversibility: High before any query API exists. Widening later is a privacy expansion
  and needs a new review. Narrowing is much harder after a remote read has shipped.
- Blocked until decided: any query API, reader authentication, and any share or delegate
  surface. Not blocked by this decision: writing this vocabulary. Implementation remains
  unauthorized anyway.

### PO-AUD-2. Export

- Decision statement: May audit records leave the node, and in what form?
- Recommended option: No export. Inspection is the on-node read in `PO-AUD-1`. No support
  bundle, continuous shipper, analytics feed, or log vendor.
- Alternatives considered: A later owner-initiated export of one correlation id, using the
  same allowlist, itself recorded as a minimized audit event. Continuous export to an
  external platform. A database dump.
- Product/security implications: No export keeps retention meaningful, because expiry can
  still reach the only copy. Continuous export chooses a processor and a retention regime
  outside the owner boundary, and it pressures the vocabulary to grow. A dump will include
  whatever was wrongly stored. A one-id export can be added later if a local read already
  exists; it should not be the first surface.
- Reversibility: Choosing no export now is highly reversible. Choosing a vendor or a
  continuous shipper is not, because off-node copies survive a later reversal.
- Blocked until decided: exporters, support bundles, telemetry backends, and any off-node
  sink. Not blocked: the allowlist an export would have to obey if one were ever approved.

### PO-AUD-3. Retention

- Decision statement: How long may accepted audit events be kept, and for which purpose?
- Recommended option: One fixed node-local window, long enough to reconstruct a request
  during the two-node demonstration and the immediate review, then gone. The purpose is the
  reconstruction purpose above and no other. The clock is node receipt time. The concrete
  duration is the Product Owner's. Engineering advice is a short window on the order of
  days: not process lifetime, and not indefinite. This note does not pick the number and
  must not be read as having picked one.
- Alternatives considered: Process lifetime only. A long fixed period. Keep each record
  until the owner deletes it. Indefinite retention.
- Product/security implications: Process lifetime cannot support `AC-AUD-001` after restart
  and is already excluded as acceptance evidence. Indefinite retention, or a long window,
  makes Discovery caller ids and security metadata a durable history of the node. Per-record
  owner retention is a product surface that depends on `PO-AUD-1` and `PO-AUD-4`. A short
  fixed window bounds compromise without pretending the log is a system of record for
  private context.
- Reversibility: Easy before the first durable write. After that, shortening is a deletion
  and lengthening does not recover what already expired. The window has to be chosen before
  durable collection starts.
- Blocked until decided: a TTL, an expiry job, and any documented claim that a specific
  period is in force. Not blocked: the statement that Class P sinks have no retention claim.

### PO-AUD-4. Deletion

- Decision statement: Who may delete or edit audit records?
- Recommended option: No edit. No selective delete by an agent, a remote party, or a
  producer. Application writers are insert-only. The only deletion is whole-event expiry
  under `PO-AUD-3`, performed by the node. Expiry leaves no payload tombstone and no
  per-correlation marker. A deletion receipt, if operations need one, is a coarse count and
  time, not a copy of the deleted event. There is no owner "forget this correlation id"
  command in the smallest model.
- Alternatives considered: Owner delete by correlation id. Field-level redaction. No
  deletion, including no expiry. Cryptographic erasure.
- Product/security implications: Insert-only plus expiry matches append-oriented audit and
  stops a compromised agent from covering a deny or a disclosure by deleting the row.
  Deletion must never restore a revoked grant; authority does not live in Audit. Owner
  delete is a real privacy control, but it is also a hole in reconstruction and should be
  an explicit later decision, not the default. Field redaction is an edit. Crypto-shredding
  adds key management the MVP does not need if the row is simply removed. Uniform empty
  query results avoid a deletion oracle.
- Reversibility: Insert-only is easy to keep. Owner delete can be added later while the
  events still exist. Promising undeletable history is hard to take back once it is a
  product promise. Crypto-shredding is hard to reverse once keys are the deletion mechanism.
- Blocked until decided: any delete API, update API, tombstone design, and any
  subject-erasure workflow. Not blocked: the redaction allowlist, which keeps the forbidden
  data from being stored in the first place.

## Abuse cases the model is built to refuse

| Case | Prepared outcome |
|---|---|
| Producer passes a message body, prompt, context, or boolean "for debugging" | Not acknowledged. Nothing stored. Class C does not disclose. |
| Implementation scrubs unknown fields and returns success | Not allowed. Supersets are rejected so the producer cannot believe a rich record exists. |
| Discovery commit input is copied into the event | Not allowed. Email, target id, and reference never become the audit record. |
| Relationship event is enriched with party ids | Not allowed. Reconstruction of parties stays with the relationship store, which is not the audit trail. |
| `not-resolved` is refined into target existence | Not allowed. Stay with the coarse Discovery event. |
| Email or other forbidden value is stored as a hash | Not allowed. Omission is the control. |
| Remote agent queries or writes audit | Not in the smallest model. No remote port. A remote field is not an append. |
| Agent deletes the deny event after a compromise | Not allowed under the recommended deletion rule. Writers are insert-only. |
| Audit row is treated as approval or as a grant | Not allowed. Readers and later modules must not authorize from an event. |
| Two owners share one audit store | Not allowed. One store boundary per node. |
| Class R failure restores `active` | Not allowed. The safety write wins. |
| Metric or trace uses correlation id, caller id, or email | Not allowed. |
| External model summarizes the log | Class X. Not a dependency. Off by default. |

## Residuals that remain even if the recommendations are accepted

- A compromised node can read or alter its own local audit. Minimization limits the
  contents. It does not create an independent witness.
- Discovery caller ids, once durably kept, are a history of which local agent ids looked
  up. The retention window is what bounds that history. This note does not remove
  `callerId` from the accepted Discovery event.
- Relationship events cannot reconstruct parties, and a replaced in-memory relationship row
  keeps no history. That is acceptable because the relationship map is not the audit trail.
  Widening the event with party ids is not recommended. If historical pair reconstruction
  becomes a product requirement, that is a new decision for the relationship store, not a
  reason for Audit to copy ids sideways.
- Class R can commit without a durable event until an authority-module transaction exists.
- Class N can miss events while the sink is down. The public path still discloses nothing.
- Class P evidence disappears on restart and is not acceptance evidence.
- Caller-chosen correlation ids can collide or be noisy. They are not capabilities. The
  recommended query audience is local, so they are not a remote oracle. They still must not
  be reflected to another caller.
- Boolean availability remains inferable from repeated authorized calls. That is a product
  residual. Audit must not make it worse by storing the boolean.

## Test and privacy evidence needed later

No evidence is collected by this note. When implementation is authorized, and only after the
reserved decisions that the test depends on are actually made, the evidence package needs
the following. Synthetic fixtures only. No real personal data, credentials, or live context.
CI artifacts must not contain lookup identifiers, references, or derived results, even when
the values are fake but shaped like production data.

Process-local sinks in earlier modules are not Audit acceptance evidence. A Discovery or
Relationships test double that captured a minimized event is a producer fixture at most.

Developer tests, owned with the implementation:

- Allowlist tests for both current producer shapes, including extra fields, wrong
  prototypes, and nested objects. Acknowledgement is not exact `true`.
- Forbidden-string tests: email, calendar title, person, location, prompt, injection text,
  bearer token, message body, relationship id, Discovery reference, and both `true` and
  `false` availability results are absent from accepted records, errors, logs, traces, and
  metrics.
- Discovery ingestion does not grow a target id, email, or reference, even if the test
  process also holds the commit input.
- Relationship ingestion does not grow party ids, even if the test process also holds the
  relationship row.
- Class C: anything other than exact `true` suppresses disclosure or new authority. This
  must remain true when the double is replaced by a durable port.
- Class R: a failed append does not offer or perform rollback.
- Class N: sink failure does not change the safe public failure and does not store the bad
  object.
- Class Q, only after `PO-AUD-1`: one correlation id returns only that id, in order, with
  no join. Unknown and expired ids look the same. A remote principal cannot read.
- Metric and log snapshots have no forbidden labels or payload.
- Restart of a Class P adapter loses events and the test must not call that loss
  `AC-AUD-001`.
- Names include `AC-AUD-001` or `AC-PRV-001` where they exercise those criteria.
- Coverage for a later security-critical Audit module follows the quality strategy,
  including complete decision and branch coverage for accept, reject, and query paths.
  Coverage is not a substitute for the behavior tests.

QE, independently:

- Inspect sinks against the forbidden list. Deliberately perturb a producer to pass a
  superset and confirm rejection.
- Confirm the evidence package does not cite Class P sinks as Audit acceptance.
- If Discovery is not Done, use the published `pan.discovery-event/v1` fixture and say so.
  Do not block Audit preparation on that module, and do not claim its acceptance here.
- Access, export, retention, and deletion checks wait for `PO-AUD-1` through `PO-AUD-4`.
  Until they are decided, QE cannot close `AC-AUD-001`. If the recommendations are
  accepted, QE also confirms there is no export path and no delete or update path other
  than the approved expiry.

Privacy record to complete at implementation, not now:

- field dictionary with purpose, classification, reader, and retention filled from the
  Product Owner decisions;
- one synthetic reconstructed timeline that shows decisions and omits context and the
  boolean;
- an explicit residual list matching the one in this note, updated for whatever was
  actually built.

Durable PostgreSQL tests, including insert-only grants and expiry, exist only if an
authorized implementation introduces that store after `PO-AUD-3` and `PO-AUD-4`. They are
not preparation work.

## Traceability

| Prepared position | Ids | Later evidence |
|---|---|---|
| Minimized, correlated decisions without raw context or secrets | `SEC-017`, `PRV-004`, `OBS-001`, `OBS-003`, `AC-AUD-001` | Allowlist and reconstruction tests after authorization |
| Derived results omitted by default | `PRV-004`, `AC-PRV-001`, MVP scope item 7 | Boolean absent on both nodes' sinks |
| Fail closed before disclosure when acknowledgement is not exact | `SEC-017`, `REL-003`, ADR-0005 | Class C tests; Discovery's own tests are not Audit acceptance |
| Approval, rejection, expiry, revocation, replay, validation failure, and disclosure are separate events | `OBS-002` | One event per transition, when those producers exist |
| Purpose documented; access, retention, and deletion reserved | `PRV-005`, `AC-AUD-001` | Close `PO-AUD-1` through `PO-AUD-4` before claiming the criterion |
| No remote authority from an audit row | `SEC-004`, ADR-0003 | No consumer grants from an event |
| Node-local store | ADR-0001, ADR-0004 | No shared or off-node sink unless `PO-AUD-2` is explicitly changed |

No new requirement id is minted. Normative sentences in `docs/product/requirements.md` stay
as they are.

## ADR assessment

No new ADR is justified by this note.

- ADR-0001 already keeps the node as the trust boundary and defers brokers.
- ADR-0003 already separates Audit from policy, context, and messaging.
- ADR-0004 already selects PostgreSQL for the first persistent state and excludes raw
  private context from audit storage. The driver remains unchosen until a persistence
  implementation is authorized.
- ADR-0005 already fixes Discovery's minimized event and leaves durable audit, access,
  retention, export, and deletion to Audit.

A later ADR would be required only if the Product Owner chose off-node export, a second
datastore, or custom tamper-evidence cryptography. The recommendation is to choose none of
those.

## Completion

This file is the Security & Privacy preparation note for Issue #12. It does not mark the
issue Ready for Development, does not record Product Owner approval, and does not implement
storage.

Process-local sinks in earlier modules are not Audit acceptance evidence.
