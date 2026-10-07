# Skills and Policy Threat and Privacy Analysis

## Status

Preparation analysis for Issue #8. This note does not authorize implementation, does not
change accepted Identity, Discovery, or Relationships behavior, and does not record Human
Product Owner approval.

The smallest kernel below is security advice. Naming `availability_check` as the purpose
candidate is a recommendation. It is not Human Product Owner approval.

Binding principles this note cannot waive:

- The LLM is not the Personal Agent. Model output is untrusted data.
- Discovery, identity, trust, relationship, consent, permission, and execution authority
  are distinct. Success at one layer grants nothing at the next.
- Remote messages are untrusted. Text cannot grant authority.
- A Discovery grant or reference grants no authority.
- A relationship grants no skill, context, tool, or execution authority.
- Disclosure stays minimal.
- Uncertain security state fails closed.
- No proprietary cryptographic protocol, identity standard, A2A replacement, or MCP
  replacement.

Approved Relationships behavior consumed here: directed local records and a boolean read.
Restart may drop that read. Policy must not cache an active relationship as durable
authority.

## Assets and trust boundaries

Assets this kernel can put at risk:

- Permission records: a grant is authority only when it is a separate current record, bound
  to the parties, the skill, the purpose, and the policy version.
- Skill contracts and advertisements: a versioned statement of what `availability` accepts
  and returns. An advertisement is not a grant.
- The policy decision: `ALLOW`, `ASK`, or `DENY`, always with the policy version that
  produced it.
- The relationship boolean used as an input. The boolean is not itself an asset to
  disclose, and it is not a permission.
- Private context, including anything that could answer availability. This kernel does not
  hold it, but a bad decision would cause a later module to disclose it.
- Approval state. This kernel must not mint it. A permission or an `ASK` decision is not an
  approval.
- Policy version. Omitting it makes a later exact approval binding unsound.
- Agent Identity. A Discovery reference, email, Human Identity id, or profile is not an
  agent id.

Trust boundaries:

1. Remote ingress, message text, and model output to this kernel. Untrusted. They cannot
   create or revoke a permission, choose `ALLOW` or `ASK`, approve a request, or change a
   rule. ADR-0003 and SEC-004.
2. Discovery to identity and authority. A discoverability grant is not a relationship, a
   skill advertisement, or a permission. An `agentReference` is not an Agent Identity id
   and not a bearer capability. ADR-0005.
3. Relationship state to permission. The kernel may consume one fresh directed boolean. It
   must not treat that boolean, or the existence of a relationship row, as skill, context,
   tool, or execution authority. FR-003.
4. Skill advertisement to permission. Offering `availability` does not authorize anyone to
   invoke it.
5. Consent to permission. A consent sentence, a `consent` field, or an owner-looking phrase
   in remote text is not a grant and not an approval.
6. Permission to approval. A stored permission is a standing rule input. An approval is a
   later, request-bound, single-use owner decision. `ASK` does not create that decision.
7. Policy decision to context and tools. Only a trusted policy result may ever authorize a
   context or tool adapter, and this kernel must not call either. SEC-010. `ALLOW` here is
   not a capability token and is not disclosure.
8. Freshness. The relationship boolean and the permission are current inputs to one
   evaluation. A cached `true`, a restarted process, or a caller-supplied copy is not
   current authority. SEC-009 and REL-004.
9. Local mutation to the permission store. Who may grant or revoke, if that choice changes
   who may authorize, stays a reserved decision. Remote text is never that actor.
10. Decision and errors to callers, logs, and a future remote response. No raw context, no
    private denial narrative, no email, and no profile. SEC-011 and SEC-018.
11. This node to any other node. The receiving node evaluates its own current inputs. A
    sender's claim that a relationship, permission, or approval already exists is untrusted.
12. Supply chain and algorithm choice to authority. No new package and no custom
    cryptography is required to decide `DENY`.

```text
untrusted text, model output, Discovery reference
  -> not an agent id, not a grant, not a decision
trusted local composition, same turn
  -> fresh relationship boolean for one named ordered pair
  -> separate current permission, or none
  -> skill contract identity and version
  -> purpose candidate
  -> policy version
  -> pure evaluation
       -> DENY by default
       -> ASK only as a decision value, with no approval and no result
       -> ALLOW only as a decision value, with no context read and no disclosure
```

## Recommended kernel

The smallest reversible kernel is a deterministic pure evaluation over explicit current
inputs. The default decision is `DENY`. A permission record is a different type from a
relationship. The fixed purpose candidate is the literal `availability_check`. That literal
is a recommendation, not Human Product Owner approval.

Pure means the same inputs produce the same decision, with no hidden clock read, no network
call, no model call, no Discovery lookup, no relationship write, and no store write inside
the evaluator. The composition root loads inputs in the same turn. The evaluator does not
accept a pre-baked `ALLOW`.

Required inputs, each explicit:

- authenticated requester as an Agent Identity id, not a payload claim and not a Discovery
  reference;
- target as an Agent Identity id on this node;
- one fresh relationship boolean for one named ordered pair, loaded from the current
  Relationships read for this evaluation;
- skill identity and version for the versioned `availability` contract, plus whether that
  contract is currently advertised, as a separate fact;
- purpose, which this kernel compares only to the recommended candidate
  `availability_check`;
- the separate permission record, or a trusted empty result when none exists;
- policy version on the rule being evaluated.

The relationship recommendation, which is also not Human Product Owner approval, is that
the receiving node reads the directed pair requester to target. The kernel must not read or
infer the opposite direction. A caller-supplied boolean is not the Relationships read. If a
later authorized specification names a different ordered pair, the input name changes. The
opposite direction is still not implied.

`ALLOW` and `ASK` are legal only when every input matches a current permission whose effect
is that decision. `ASK` is not a fallback. Uncertainty is `DENY`, because SEC-005 names
`DENY` and because `ASK` would start an approval path that this kernel does not own.

This kernel's decision carries the policy version. It does not carry `available`, raw
context, an explanation, an email, a profile, a Discovery reference, or an approval id.
`ALLOW` does not authorize a context query, including a query over a caller-supplied time
interval. Interval meaning stays reserved.

No grant or revoke command ships in this kernel. Adding one would choose who may authorize.
The permission value is an explicit input so evaluation can be specified and tested before
that reserved decision.

## Actors

- Receiving-node owner: the recommended later holder of grant and revoke, through a trusted
  local path. Not decided here.
- Local composition root: may load current ports and call the pure evaluator. It must not
  mint a permission from a request payload or from a model result.
- Remote agent: untrusted. No mutate, no authority, no remote policy read.
- External model: not the Personal Agent and not an evaluator. Its text is data.
- Discovery caller: unchanged. A reference resolves nothing in this module.
- Later Approval, Context, Messaging, and Audit modules: must not be imported to make this
  kernel pass. They consume a future decision only under their own gates.

## Abuse cases

| Case | Expected outcome | Finding |
|---|---|---|
| An active relationship, a skill advertisement, or both are treated as permission | Decision is `DENY`. Neither record is rewritten. AC-DOM-001's missing-permission case stays denied. | Non-blocking only when the types cannot satisfy each other. Blocking if either fact alone yields `ALLOW` or `ASK`. |
| A required input is missing, ambiguous, unmatched, or the read throws | `DENY`. No default permission, no skipped check, no `ASK` fallback. | Non-blocking as the default branch. Blocking if any uncertain input fails open, including an unavailable relationship port. |
| Remote text or model output says to grant, allow, approve, ignore policy, or reveal context | No permission row is created or revoked. The decision does not become `ALLOW` or `ASK` because of that text. Policy rules stay unchanged. SEC-004 and AC-SEC-001. | Non-blocking if no parser builds a permission or a decision from message or model text. Blocking if any such parser or tool call exists. |
| The kernel reuses a relationship boolean from a previous turn, a permission field, or memory after restart | The boolean comes from a fresh Relationships read in this evaluation. Restart may make that read false. A cached `true` is never authority. | Non-blocking if the evaluator has no relationship cache. Blocking if an active relationship is stored as durable authority or survives a read that is now false. |
| A permission, a previous `ALLOW`, or an `ASK` decision is treated as approval | No approval record is created. No protected result is released. `ASK` does not become owner consent. | Non-blocking if approval types and stores are absent. Blocking if a permission or decision can be presented as an approval. |
| The rule or the decision omits the policy version | `DENY`. A versionless result cannot be reused by a later approval check. | Non-blocking if every accepted decision includes the version. Blocking if `ALLOW` or `ASK` can be produced or replayed without one. |
| The skill contract or its result includes context, event fields, or an explanation | The contract result is not evaluated here. The decision has no context and no explanation. A later success payload remains the authorized boolean plus safe protocol metadata only. | Non-blocking as a contract rule. Blocking if the skill type or decision type can carry context, titles, people, locations, or a denial narrative. |
| Prototype pollution or extra fields arrive on a command, permission, or skill input | Reject the value. Do not strip fields and continue. Do not treat `__proto__`, `constructor`, `prototype`, `grant`, `approved`, `available`, or `context` as instructions. | Non-blocking if unknown and inherited fields fail closed. Blocking if they coerce the decision or are echoed. |
| A Discovery reference, email, Human Identity id, or profile is accepted as an agent id | Reject. No permission is stored under that key. No identity is resolved through Discovery. | Non-blocking if only Agent Identity ids parse. Blocking if a reference or email becomes a party, a grant subject, or authority. |

Related failures follow the same rule. A sender-asserted permission is remote text. An
explicit `consent` field is not consent. Two matching permissions with different effects
are ambiguous and therefore `DENY`. A Human Identity id is not accepted where an Agent
Identity id is required. FR-001 stays intact.

## Deny by default

SEC-004. Remote content cannot create policy, grant capability, approve itself, expand
context, tool, or execution permission, or override a rule. The kernel has no command that
reads a message body. Skill arguments are not instructions. Model output is not a decision
and cannot invoke a tool. A test that only quotes an injection string is not enough; the
grant and decision constructors must be unreachable from untrusted JSON.

SEC-005. Missing, ambiguous, unavailable, or unmatched authorization inputs produce `DENY`.
That includes an absent requester, target, skill, purpose, permission, or policy version; a
relationship read that was not performed in this turn; a thrown or timed-out dependency; an
ineligible agent; an unknown skill version; a purpose other than the candidate under test;
and more than one applicable permission. `ASK` is not the fail-closed result. Skipping a
failed check is failing open.

SEC-010. Context and tool adapters may accept authority only from a trusted policy result,
never from remote text or model output. This kernel does not call those adapters, does not
import a context port, and does not return a token they can cache. A future adapter must
refuse to run on a decision that was parsed from a payload. `ALLOW` from this kernel is not
yet that execution authority, because the interval, approval, and disclosure decisions are
still reserved.

SEC-011. Egress must enforce an authorized output schema and reject unexpected fields. This
module does not build the remote response. Its decision schema still must reject unexpected
fields rather than copy them through. The decision must not contain raw context or an
explanation. The future success schema stays `{ available: boolean }` plus safe protocol
metadata. This note does not add fields to that schema.

SEC-018. Unauthorized responses must not reveal whether protected context exists or why
private policy denied access. Every failure in this kernel is `DENY` without a private
reason. `no relationship`, `revoked`, `no permission`, `empty calendar`, and `policy store
down` are not distinct public outcomes. A local coarse class may exist for a later
minimized audit consumer, but this module has no remote DTO and no durable audit store, so
that class must not be serialized as the caller response.

REL-003 and REL-004 say the same thing in operational form: an unavailable security
dependency fails closed, and a stale cached grant is not policy.

## Privacy

Policy records store Agent Identity ids, skill identity and version, the purpose candidate,
a policy version, and the decision effect. They do not store email addresses, human-facing
profiles, display names, Discovery references, endpoints, credentials, or raw context.
FR-003's separation is also a data-minimization rule. Copying a Discovery identifier into a
permission creates a second store of the same personal identifier.

The kernel does not query context and does not derive `available`. PRV-003 stays intact
because there is no context read to leak. PRV-002 is not implemented here; it is a ceiling
for a later invocation. Returning a boolean from this kernel would either be invented or
would be a context result crossing the boundary early.

Public and remote failures carry no private denial reason. FR-008 and SEC-018. Logs,
thrown errors, and test diagnostics must not interpolate the command object, the
permission, the relationship parties, or a context fixture. PRV-004. Synthetic fixtures
only. No real personal data.

`ASK` versus `DENY` can tell a caller that some standing rule asked for approval. That
distinction is already in the product vocabulary. It must not be enriched with a reason, a
calendar hint, or an owner-visible preview. What an approval screen shows stays reserved.
Repeated boolean probing can still infer a calendar once disclosure exists. This kernel
does not set a query budget and does not disclose the boolean. PRV-008 remains a later
constraint, not a number chosen here.

A minimized local reason class, if returned at all, is limited to coarse security outcomes
such as missing input, unmatched inputs, unavailable dependency, ambiguous inputs, and
rejected shape. It is not a sentence about the owner's data. It is not remote disclosure.
Messaging must not forward it.

## Incremental review checklist

Use this list on a future implementation. It is not permission to start that implementation.

- The evaluator is a pure function. Tests can replay one input and observe one decision
  without a listener, a clock, a socket, or a model.
- The uncovered branch is `DENY`.
- `ALLOW` and `ASK` each require a distinct current permission. Relationship `true` and an
  advertisement do not satisfy that requirement. AC-DOM-001.
- Permission absent, relationship `false`, advertisement absent, and skill version
  mismatch each deny on their own, so the records change independently. FR-003 and FR-005.
- Constructors for a trusted permission and a trusted decision are not JSON parsers and are
  not reachable from message fixtures or model fixtures. SEC-004.
- A Discovery reference, email, Human Identity id, and profile string fail agent-id parsing
  and create no row.
- Inherited prototype fields and extra own properties reject the value. The error does not
  echo them.
- The relationship boolean is loaded once per evaluation from the current read. No field on
  the permission stores it. A restart that drops the Relationships read produces `DENY`,
  not a remembered `ALLOW`.
- A thrown relationship or identity dependency produces `DENY` and writes nothing.
- Every `ALLOW` and `ASK` includes the policy version. A missing version cannot be cast to
  a current version.
- `ASK` creates no approval and contains no protected result. `ALLOW` contains no
  `available` value and does not call a context port.
- The skill contract type has no context, explanation, confidence, or event field.
- Two contradictory permissions deny as ambiguous.
- A purpose other than the recommended candidate denies, unless a recorded Human Product
  Owner decision has replaced that candidate.
- No grant or revoke port is exported while the grantor decision is still reserved.
- Module imports do not reach messaging ingress, approval persistence, a context store, an
  LLM client, or an audit database.
- Logs and errors stay on the allowlist. No email, profile, raw context, or private reason.
- No new package and no custom signature, token, or capability mac.
- Tests use synthetic ids only and name the acceptance ids they actually exercise. They
  must not claim that AC-AUTH-001, AC-APR-001, AC-REV-001, or disclosure is complete.
- A later reviewer repeats this list if grant, interval, purpose, approval display, or
  disclosure changes.

## Blocking and non-blocking findings

No blocking finding remains inside the recommended kernel. The kernel does not disclose,
does not approve, does not read context, and fails closed.

The following become blocking if an implementation departs from that kernel. They match the
repository blocking rule for authorization bypass, untrusted instruction authority,
premature approval disclosure, revoked or stale access, context leakage, and sensitive
audit leakage.

- Relationship, advertisement, Discovery, consent text, or model output yields `ALLOW` or
  `ASK`.
- Any missing, ambiguous, or unavailable security input yields something other than `DENY`.
- Any path from remote text or model output creates, revokes, or rewrites a permission or a
  rule.
- A relationship `true` is cached on the permission, in process memory, or across restart.
- A permission, decision, or extra field is accepted as an approval or releases a protected
  result.
- A decision omits its policy version, or a missing version is treated as current.
- The skill contract or decision can return raw context, an explanation, or a private
  denial reason.
- Prototype or extra fields change the decision or are copied into the result.
- A Discovery reference, email, Human Identity id, or profile is accepted as an agent id or
  stored on a policy record.
- The kernel queries context, opens messaging ingress, writes a durable audit store, or
  starts an approval lifecycle.
- `ALLOW` is reused as authority to query a caller-supplied time interval, or as a token
  that skips a fresh evaluation.
- A custom cryptographic grant or proprietary identity protocol appears.
- A new dependency is added for evaluation.

Non-blocking while the kernel stays inside the recommendation:

- An in-memory permission fixture that disappears on restart, so the next evaluation has no
  grant and denies. That is fail closed. It is not a durability claim and not MVP
  acceptance evidence. ADR-0004 still requires PostgreSQL before persistent revocation can
  be cited.
- A coarse in-process reason class that is not a remote response and not a durable event.
- Returning `ASK` as a decision enum with no side effects. The approval lifecycle remains a
  non-goal.
- Holding the purpose candidate `availability_check` in one constant, clearly labeled as a
  recommendation.
- Leaving grant and revoke unimplemented until the reserved actor decision is made.

A later module that caches this kernel's `ALLOW`, displays `ASK` to an owner, or projects a
boolean is outside this finding. Those paths are blocking until their own reserved
decisions and fresh checks exist.

## Reserved product decisions

Each item has one recommended option. None of these recommendations is Human Product Owner
approval. Implementation that needs the choice stays stopped for that choice.

### Who may grant or revoke permission

- Decision statement: Which actor may create or revoke a permission on this node, given
  that the answer changes who may authorize?
- Recommended option: Only the human owner of the receiving node, through a trusted local
  control path that cannot be built from a message, a Discovery reference, or model output.
  The owner may revoke any permission stored on this node. Remote parties cannot grant
  themselves access.
- Alternatives: The requester's owner grants on the target node. Either remote party may
  grant. Both owners must sign. The active relationship is itself the grant. The agent may
  self-grant from conversation text.
- Impact: A remote or inferred grantor collapses the boundary SEC-004 exists to protect.
  Implied grants erase FR-003. The recommended option keeps authority inside the owner
  boundary already used for Relationships.
- Affected modules: Skills and Policy, Approval, a future owner-facing control surface,
  and Messaging. Relationships must not grow permission fields to avoid this decision.
- Reversibility: High if this kernel ships no mutate port. Low if a remote grant API or an
  implied relationship grant is released, because callers will depend on it.
- This choice stays reserved.

### Caller-supplied purpose versus a fixed purpose

- Decision statement: Is the MVP purpose fixed, or may the requester or owner supply one?
- Recommended option: Fixed literal `availability_check` for the versioned availability
  skill. Any other purpose is unmatched and denies.
- Alternatives: Free-form requester text. An owner-configured list. Omitting purpose.
- Impact: Purpose is part of matching and of any later approval binding under FR-012.
  Caller-supplied purpose is an injection and scope-expansion channel. Omitting purpose
  makes two different uses of availability indistinguishable.
- Affected modules: Skills, Policy, Approval, Context, and the messaging envelope.
- Reversibility: High while the purpose is one constant and no stored grant contains
  caller text. Low after arbitrary purpose strings are persisted, because those strings
  become authority and history.
- This choice stays reserved. The constant in the recommended kernel does not approve it.

### Availability interval, timezone, and horizon

- Decision statement: Is availability an instant or a half-open interval, what timezone and
  DST rules apply, and what maximum horizon, duration, and query budget apply?
- Recommended option: Do not encode those semantics in this kernel. Do not substitute a
  default window. A missing time input cannot fail open. This kernel's `ALLOW` does not
  cover a caller-supplied interval.
- Alternatives: A single instant in UTC. A half-open interval with a fixed horizon. The
  owner's local zone with DST rules. An unbounded caller interval.
- Impact: A wide or shifted window changes what private context a later query would touch
  and what repeated booleans can infer. Inventing the rule here would close a product
  decision the MVP scope still lists as open. PRV-008 budgets are part of the same choice
  and are not set here.
- Affected modules: Skill contract, Policy matching, Context derivation, Messaging
  validation, and later abuse limits.
- Reversibility: High if the kernel keeps time opaque and refuses to authorize a query.
  Low if callers rely on a shipped horizon, especially one that is too wide.
- This choice stays reserved.

### What an ASK approval shows the owner

- Decision statement: When `ASK` later creates an approval, what does the owner see?
- Recommended option: This kernel shows nothing. It returns no owner preview. A future
  Approval design should be reviewed against minimal disclosure before any field is chosen.
  The security ceiling, which is not a product choice, is that the screen cannot show raw
  context, another person's email or profile, or model-written justification.
- Alternatives: Show the full caller payload. Show a calendar excerpt. Show only that
  someone asked. Show a model summary.
- Impact: Too much turns the approval UI into a disclosure path and a prompt-injection
  surface. Too little makes the owner's decision uninformed. SEC-008 still requires an
  exact binding when that module exists. Channel, expiry, notification, rejection, and
  duplicates stay with that later decision and with AC-APR-002.
- Affected modules: Approval, owner-facing design, Audit, and Policy. Policy must remain
  correct without the UI.
- Reversibility: High while no preview payload exists. Low after raw context has been shown
  or written to logs.
- This choice stays reserved.

### Disclosure beyond the authorized boolean and safe protocol metadata

- Decision statement: May a successful availability invocation disclose anything beyond the
  authorized boolean and safe protocol metadata?
- Recommended option: No. Do not add explanations, confidence, reasons, alternative times,
  event counts, partial context, or a natural-language answer. This kernel does not emit
  the boolean either, because it does not query context.
- Alternatives: A denial explanation. A richer availability object. An LLM sentence.
- Impact: Every added field is more disclosure and another inference channel. A private
  reason on `DENY` violates FR-008 and SEC-018. An LLM sentence puts the model on the
  disclosure path, which ADR-0003 forbids.
- Affected modules: Skill output schema, Context projection, Messaging response, and Audit.
  Audit still omits derived results by default under PRV-004.
- Reversibility: High if no extra field ships. Low once callers or owners depend on a
  richer payload, and not recoverable for data already disclosed.
- This choice stays reserved. This note does not define which fields count as safe protocol
  metadata and does not add any.

The in-flight revocation rule for pending approvals and computed-but-undelivered results
stays reserved for Approval and for AC-REV-001. It is not decided here. This kernel has no
in-flight disclosure to classify.

## Non-goals

- No approval lifecycle: no pending approval, expiry, single-use consumption, owner
  notification, or approval screen.
- No context query and no derivation of `available`, simulated or real.
- No messaging ingress, envelope authentication, replay store, or HTTP route.
- No durable audit store, retention rule, or PostgreSQL adapter.
- No tool execution and no external AI call.
- No change to Discovery resolution, Identity eligibility, or the Relationships boolean
  contract.
- No cache of the relationship read.
- No remote permission protocol and no custom cryptography.

A reusable policy language remains out of MVP scope. Ambiguous overlap denies. It does not
grow a policy DSL.

## Dependencies and supply chain

Identity already supplies distinct Agent Identity ids. This kernel uses those ids and does
not reimplement identity or construct an authenticated principal from a payload.

Relationships supplies the directed boolean read. This kernel does not write relationship
state and does not treat restart loss of that read as a reason to remember `true`.

Discovery is not a dependency. References are rejected rather than resolved.

Approval, simulated context, messaging, and audit are later modules. They must not be
pulled forward to make a decision look complete.

No new package is recommended. If a later authorized mutate path needs an id, it can use
`node:crypto` `randomUUID`, as Identity does. PostgreSQL is not introduced here.
ADR-0004 applies only when an approved module actually persists state. No proprietary
cryptographic protocol is justified. Permissions are local records evaluated in process,
not signed capability tokens.

## Accepted residuals

- Until a durable permission store exists, a process-local fixture grants nothing after
  restart. That fails closed. It is not evidence that revocation survives restart.
- Restart may also drop the Relationships read. The safe result is `DENY`. Recovering the
  old relationship `true` from policy memory would be a defect, not a residual.
- `ASK` and `DENY` are different decisions. A later remote mapping may make that difference
  visible. It must still hide the private reason and whether context exists.
- Boolean availability, once some later module discloses it, can be probed. This kernel
  does not disclose it and does not invent the budget.
- The host process is inside the owner's trust boundary. A compromised receiving node can
  read its owner's local data. This kernel does not reduce that residual by calling a
  model or by moving policy off the node.
- A hung dependency can stall the composition root. No timeout number is invented here. The
  outcome of an abandoned evaluation is `DENY`, not a partial `ALLOW`.

## Completion

This file is the Security & Privacy preparation note for Issue #8. It answers which
trust-boundary, disclosure, and authority failures make the kernel unsafe, and which
product choices stay reserved. It does not mark Issue #8 Ready for Development. A later
independent security review of any implementation remains mandatory, using the checklist
above. The recommendation of pure evaluation, default `DENY`, a separate permission
record, and the purpose candidate `availability_check` is not Human Product Owner approval.
