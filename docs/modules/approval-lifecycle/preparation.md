# Approval Lifecycle Preparation

## Status

Preparation analysis for Issue #11. This note does not authorize implementation, does not move the module toward Ready for Development, and does not record Human Product Owner approval.

It answers how pending approval, concurrency, single-use, and revocation interact, and which choices stay Reserved Product Decisions. Normative behavior already fixed by the product documents is separated below from recommendations. A recommendation is not an acceptance decision.

MVP-scope item 5 remains reserved. The existing recommendation is to invalidate pending approvals and computed-but-undelivered results, and not to retract results that were already delivered. That recommendation is restated here only as a recommendation.

Relationships are directed and local. Revoking a relationship on this node does not define in-flight delivery on either node. This note does not add a notification platform, a cross-node cancel protocol, or a retraction protocol.

No functional code, schema, route, adapter, or test is created by this analysis.

## Accepted constraints

These are not open product choices. Later implementation has to satisfy them even where a reserved decision below chooses the surrounding interaction.

| Rule | What is already fixed |
|---|---|
| `FR-007`, `AC-APR-001` | An `ASK` decision creates exactly one pending approval and returns no protected result. |
| `FR-012`, security principle 7 | That approval binds requester, target, skill, purpose, input, disclosure scope, policy version, request ID, and expiry. |
| `SEC-008`, `AC-APR-002` | The approval is single-use. It is invalid if any bound field, the policy version, or the expiry changes. The protected result may be released only once, and only for that exact unexpired approval by the authenticated target owner. Rejection, expiry, a duplicate approval, a changed field, a changed policy, or another approver returns no protected result. |
| `SEC-007`, `REL-002`, `AC-MSG-001` | The same request ID must not create a second approval, action, context evaluation, or disclosure. A duplicate request ID has one deterministic safe outcome. |
| `SEC-009`, `AC-REV-001` | Authority is checked when the decision is made and again immediately before context access or disclosure. An applicable pending approval is invalidated. A cached grant is not authority. |
| `REL-001` | A successful revocation affects later decisions. The rule for in-flight work is the reserved item 5 decision; it is not approved yet. |
| `REL-004` | The release path uses current authoritative policy and revocation state, not the snapshot that created the pending approval. |
| `PRV-003` | Private context stays behind the target context boundary and is queried only after a still-valid approval. Creating the pending approval is not that query. |
| `FR-008`, `SEC-005`, `SEC-018`, `PRV-006` | `DENY`, rejection, expiry, and failed closed paths return no protected result and no private explanation. Missing or unavailable authorization inputs do not become `ASK`. |
| `SEC-004`, `AC-SEC-001` | Remote text, model output, and a field in the request cannot approve, widen scope, or alter policy. |
| `FR-011`, `AC-LIFE-001` | The request lifecycle can represent pending, completed, rejected/denied, expired, and failed. The owner can see a consistent local state. An untrusted remote party receives only disclosure-safe public state. |
| `PRV-002`, `SEC-011` | A successful availability release discloses only the authorized boolean and safe protocol metadata. |
| `PRV-004`, `OBS-002` | Approval, rejection, expiry, revocation, replay, validation failure, and disclosure are auditable without raw context, message bodies, secrets, or derived results. |
| ADR-0001, ADR-0003 | The receiving node alone authorizes. Approval is its own boundary. It is not implied by identity, discovery, relationship, skill advertisement, or an `ALLOW` decision. |
| ADR-0004 | Single-use approval and revocation need transactional concurrency when persistent state is introduced. Persistence is not part of this preparation. |

`SEC-009` and `AC-REV-001` already require applicable pending approvals to be invalidated. Item 5 does not reopen that requirement. Item 5 is the undecided boundary around in-flight work: what still counts as undelivered, how quickly revocation is visible, and whether a result that has already been delivered is retracted.

## Interaction

Pending approval, concurrency, single-use, and revocation are one control, not four sequential features.

1. **Pending is the only `ASK` outcome.** The receiving node records one bound approval and does not read private context, derive a boolean, or place that boolean in any response. A disclosure-safe indication that the request is pending can exist without violating `FR-007`. The protected result cannot.
2. **The request ID is the concurrency key.** Every create, retry, poll, approval, rejection, expiry, and release for that ID contends for the same record. Losers do not insert another approval, start another context evaluation, or disclose again.
3. **Single-use is the spend.** The record can enter a releasing transition only once. That transition re-reads the stored binding and current authority. It discloses only if the binding still matches and the fresh check still passes. Any second spend returns no protected result.
4. **Revocation is not an edit of the stored request.** It is an independent change to current authority. A pending approval whose grant no longer applies is invalidated even though its stored snapshot still says `ASK`. A human approval does not outlive that check. The same fresh check runs again immediately before disclosure, so a result computed in between is not entitled to leave the node.
5. **Failures do not repair the approval.** Expiry, rejection, policy or field mismatch, revocation, a lost race, and a failed dependency all end with no protected result. None of them is fixed by replaying the same approval. A later new request ID is a new decision, not a resurrection of the old one.

`ALLOW` does not create this record. `DENY` does not create it either. A requester field that claims `ALLOW`, or claims the owner already approved, is untrusted data and does not select either path.

## Lifecycle states

`FR-011` fixes the request states that must be representable. Approval needs a stricter internal record so revocation and single-use have a place to land. The internal names below are a preparation baseline, not an approved public contract.

```text
no approval record
  -- current policy is ASK; request ID is new; binding and expiry can be stored -->
pending
  -- authenticated target owner approves the exact unexpired record -->
releasing
  -- authenticated target owner rejects --> rejected
  -- stored expiry is reached --> expired
  -- applicable revocation, current policy no longer ASK, or policy version changed --> invalidated
  -- security dependency unavailable before any context read --> failed

releasing
  -- one context evaluation, final check passes, disclosure committed once --> completed
  -- final check fails, including revocation of an undelivered result --> invalidated
  -- evaluation cannot finish, with no disclosure --> failed

rejected | expired | invalidated | failed | completed
  -- any later approve, replay, or poll --> no new evaluation and no protected result
```

`releasing` is an internal concurrency state. It is not a sixth remote lifecycle state. Remotely, the request is still pending until it is completed or has reached a non-disclosure terminal state. `DENY` is a request outcome of rejected/denied without an approval row.

| Internal outcome | Request lifecycle (`FR-011`) | Protected result | Context read |
|---|---|---|---|
| `pending` | pending | none | no |
| `releasing` | pending to the remote party | none yet | at most once, only after the pre-read check |
| `completed` | completed | the bound boolean, once | already performed |
| `rejected` | rejected/denied | none | no |
| `expired` | expired | none | no |
| `invalidated` | rejected/denied, with a distinct local and audit reason | none | no, or discarded if already computed |
| `failed` | failed | none | no completed disclosure |

Owner-local state and the later audit record need to distinguish owner rejection, expiry, revocation, policy or binding invalidation, dependency failure, and disclosure. `OBS-002` already requires that separation. The remote requester does not inherit the owner's reason codes. How much those terminal outcomes collapse into one public non-disclosure response is part of reserved decision PO-APR-5.

Recommended projections, not an approved vocabulary:

- The authenticated target owner can inspect the internal outcome and reason for approvals on this node.
- The authenticated bound requester can see disclosure-safe public state for that request ID only: pending, the one completed boolean, or non-disclosure. Pending here is the fact of waiting, not private context and not the policy explanation.
- Any other caller, including another agent of the same human, receives the same non-revealing unauthorized outcome for an unknown ID and for an ID it does not own. That response has no protected result.

Terminal records stay terminal. A repeated reject, a late approve, or a replay does not return a record to `pending` or `releasing`. Recreating a relationship or permission after revocation creates a new authority for a future request. It does not revive the invalidated approval. That follows `SEC-008` and `SEC-009` plus the directed relationship rule that a revoked relationship id is not reactivated.

Expiry comparison is part of the binding, not a grace period. The recommendation is that the stored instant is exclusive: at or after that instant the approval is expired. The receiving node sets and checks that instant. Message freshness (`SEC-006`) is a different window and stays an open messaging decision. This note does not reuse it as the human-approval lifetime.

## Concurrency and race cases

The outcomes marked accepted do not depend on the reserved decisions. Where a cell is only a recommendation, implementation must not treat it as a passing acceptance oracle until the Product Owner decides.

| Case | Accepted outcome | What stays reserved | Recommendation |
|---|---|---|---|
| Two concurrent `ASK` deliveries with the same request ID and the same canonical binding | Exactly one pending approval. No context read. No protected result. The loser does not insert a second row. | Whether the loser receives a distinct "duplicate" explanation | Both callers observe one disclosure-safe pending outcome for that ID. |
| Same request ID, different requester, target, skill, purpose, input, disclosure scope, policy version, or expiry | No second approval and no disclosure. `SEC-007`, `SEC-008`. | None for the prohibition | The stored binding is immutable. The mismatched delivery fails closed and does not patch the original. |
| Distinct request IDs with the same parties, skill, and input | Not decided by `SEC-007`, which keys on request ID | PO-APR-6 | Do not coalesce them. Each ID is its own approval and its own owner decision. A bounded local queue fails closed, without disclosure, when pending work exceeds an engineering limit. |
| Two owner approvals at once | At most one release. The other approval action returns no protected result. `SEC-008`, `AC-APR-002`. | None for single release | One transaction compares and swaps `pending` to `releasing`. The loser cannot start a second evaluation. |
| Approve racing an owner reject | No double outcome and no protected result from the loser | PO-APR-5, if reject is not offered at all | Whichever decision commits first is the only terminal decision. Reject commits no context read. |
| Approve at or after expiry | No protected result. `SEC-008`. | The duration only (PO-APR-3) | The spend transaction checks the stored expiry against the node clock and then refuses. |
| Policy version changes after `pending` and before spend | The approval is invalid. No protected result. `SEC-008`. | None | Re-read the current version inside the spend transaction. Do not upgrade the old approval to the new policy, including when the new policy would be `ALLOW`. A new request ID can be evaluated fresh. |
| Owner client submits a modified copy of scope, input, or expiry with the decision | The approval remains bound to the stored record. A changed field cannot release. `SEC-008`. | None | The owner command carries the approval identity and the decision only. The server does not accept a replacement binding from the client. |
| Revocation after `pending` and before context access | The applicable pending approval is invalid. Later approve returns no result. No context read. `SEC-009`, `AC-REV-001`. | Latency only in the sense of item 5; no grace is required by the accepted text | The spend transaction re-reads current authority and invalidates before any context call. |
| Revocation or policy change after derivation and before disclosure | The final check must fail closed. `SEC-009`. | Whether that computed value is undelivered work, and latency (PO-APR-7) | Treat it as undelivered. Discard it. Do not disclose it. Do not store it. |
| Revocation after the protected result was delivered | Later decisions on this node no longer use the revoked grant. `FR-009`, `REL-001`. | Whether delivery is retracted (PO-APR-7) | Do not retract and do not send a follow-up erasure. The other node is not instructed what to do with what it already received. |
| Revoke of the opposite relationship direction, or revoke on the other node | This node's opposite direction is a different record. The other node has its own authority. | None in this module | Invalidate only approvals on this node whose current bound authority no longer holds. Do not infer a peer delivery rule. |
| Status read or poll racing the one release | A duplicate must not create a second evaluation or disclosure. `SEC-007`. | Polling versus notification (PO-APR-4), and whether the boolean can be read twice (PO-APR-6) | The release transaction is the only writer of the protected response. A concurrent reader gets pending or a terminal non-disclosure, never a second boolean. |
| Context or policy dependency fails during `releasing` | Fail closed. No protected result. `REL-003`. | Whether the same approval can be evaluated again (PO-APR-6) | Record that the single evaluation was spent, without storing the derived value. End in `failed` or `invalidated`. Do not return to `pending`. |
| Process crash after disclosure is committed but before the response is written | No second evaluation, and no stored derived result to replay. `SEC-007`, `PRV-004`. | This is the undelivered crash case inside PO-APR-6 and PO-APR-7 | Fail closed on recovery. Do not recompute and do not disclose. The owner uses a new request if a later attempt is wanted. |
| Grant or relationship is created again after invalidation | The old approval stays unusable. | None for resurrection | Only a new request ID can reach a new `ASK`. The new decision still needs its own pending approval. |
| Target agent becomes ineligible while `pending` | A current eligibility failure cannot be used as authority. Relationships already define an ineligible agent as not an active read. | Whether the approval pauses until eligibility returns | Fail closed and invalidate. Do not resume the same human decision later. |
| Requester or model says the request is already approved | No mutation and no disclosure. `SEC-004`. | None | Ingress cannot call the owner decision port. |
| Many distinct request IDs from one caller | No protected disclosure on failure. Abuse resistance is required in the threat model. | The numeric quota, which remains an open abuse-limit decision | Bound the pending set. Excess fails closed with a non-revealing response and creates no approval. |

The accepted concurrency mechanism is transactional compare-and-swap on one approval per request ID, as anticipated by ADR-0004. The exact driver, lock mode, and isolation level are engineering choices inside that requirement. They are not selected here, and this preparation does not add PostgreSQL.

Recommended order for the one legal spend:

1. Lock the one `pending` row for this request ID.
2. Reject unless the row is unexpired, the caller is the authenticated target owner, and the decision refers to the stored binding rather than a client-supplied copy.
3. Re-evaluate current relationship, permission, policy version, and agent eligibility. On any failure, mark `invalidated` or `expired`, commit, and do not call context.
4. Move the row to `releasing` and record that the one context evaluation is now spent.
5. Derive the bound availability boolean from the bound input only.
6. Immediately before forming a response, re-read current authority. On failure, discard the value, mark `invalidated`, and disclose nothing.
7. Commit `completed` only for that winner, then allow the one response to carry the boolean. Do not persist the boolean on the approval record.

A crash before step 4 leaves `pending` and no evaluation. A crash at or after step 4 follows the crash recommendation above. Holding a database transaction open across a simulated in-process derivation is acceptable for this MVP because the context source is local and bounded. The spend must not call an external provider, calendar, or notification system while serialized.

## Revocation analysis

### What is checked, and when

There are three different moments. Collapsing them is the race `SEC-009` exists to close.

| Moment | Question | Approval effect |
|---|---|---|
| Initial policy decision | Is the fresh decision `ASK`? | If yes, create one `pending` binding. If no, do not create one. If inputs are missing or unavailable, `DENY` or fail closed, with no approval row. |
| Spend, before context access | Does current authority still support this exact binding, and is the owner approval still unspent and unexpired? | If no, invalidate or expire and do not read context. |
| Final check, after derivation and before disclosure | Does current authority still support this exact binding? | If no, the computed value is not disclosed. |

The first decision's `ASK` snapshot is not a cache that the later moments may reuse. `REL-004` forbids that. Relationship `readActive`, current permission, current policy version, and current agent eligibility are read again at the later moments. A stale `true` copied into the approval row is not a grant.

### What makes a pending approval applicable

`SEC-009` invalidates applicable pending approvals and cached grants. It does not say that every pending approval on the node dies because one grant changed.

An approval is applicable when a fresh evaluation of its own bound requester, target, skill, purpose, input, and disclosure scope would no longer support that `ASK`. In particular:

- the directed relationship required for that ordered agent pair is no longer a current active read, including when one of those agents is ineligible;
- the skill permission or other grant the policy used for that binding is revoked;
- the policy version stored on the approval is no longer current;
- the bound disclosure scope is no longer allowed.

An approval is not applicable, and is not invalidated, merely because:

- the opposite direction was revoked;
- a different counterparty, skill, or purpose was revoked;
- a relationship changed on the other node;
- discovery eligibility changed, unless current policy for this binding actually depends on that fact;
- an unrelated pending approval shares a requester or a target.

Applicability is therefore a fresh policy decision over the stored binding, not a cascade delete of every approval. This module does not own relationship or permission rows and must not write them. It consumes their current reads.

### Local relationship revoke is not an in-flight delivery rule

A relationship record on this node answers only whether that directed pair is currently active here. Its revoke command does not:

- define whether a computed boolean on this node may still be sent;
- cancel or claw back a result the requester node already accepted;
- revoke the reciprocal direction;
- revoke the counterparty node's relationship, approval, or cached response;
- notify either owner or either agent.

Those limits stay even if the Product Owner accepts the item 5 recommendation. Item 5 would govern this node's pending and undelivered approval results. It still would not turn relationship revoke into a network protocol.

### Pending, undelivered, and delivered

| Stage | Accepted rule | Item 5 recommendation, not approved |
|---|---|---|
| `pending`, no context read | Invalidate if applicable. No result. | Same. No grace period in which the owner can still approve it. |
| Owner has approved, context not read | Do not read context if the fresh check fails. | Same. Invalidate rather than pause. |
| Boolean computed, response not delivered | The final check can still forbid disclosure. | Discard the value. Do not disclose it. This is the undelivered half of item 5. |
| Protected result already placed in the requester-facing response of the winning release | Later requests still see current revocation. | Do not attempt retraction. This is the other half of item 5. |

Recommended meaning of delivered: this node committed `completed` and wrote the protected boolean into the winning requester-facing response. Recommended meaning of undelivered: anything earlier, including a computed value that exists only in memory and a commit that crashed before that response was written. Derived results are not stored on the approval, in logs, or in an outbox, so recovery has nothing legitimate to retransmit. That is at-most-once disclosure and matches `PRV-004`. It is a harsher owner experience on a crash. It is not Product Owner approval.

Recommended latency: no grace period and no asynchronous "revoke will arrive shortly" window. The spend and final-check transactions read current local authority before they commit. Cross-node propagation delay is out of scope because this node does not apply the other node's revoke, and the other node does not apply this one's. A numeric latency target is not proposed. "Immediate" here means "in the releasing transaction," not "within an agreed number of milliseconds."

No recommendation in this section authorizes a service that pushes revocation, watches an inbox, or tells the requester to forget a boolean.

### Authority that must not be confused with revocation

- Owner rejection is a decision on the approval. It is not a relationship revoke.
- Expiry invalidates by `SEC-008` even when the grant remains active.
- Policy-version change invalidates by `SEC-008` even when the human has not revoked anything.
- Agent ineligibility makes the current relationship read unusable without necessarily changing the stored relationship status. The approval check follows the current read.
- Requester cancellation, if it ever exists, is not modeled here and cannot revoke or approve the target node's record.

## Dependency classes

### A. Normative constraints this module must consume

Identity separation and ownership (`FR-001`), current authorization inputs (`FR-005`), the `ASK` / `ALLOW` / `DENY` split, exact approval binding, single-use, duplicate request IDs, revocation re-check, minimal disclosure, and fail-closed dependency behavior. The requirement IDs are listed in the traceability section. This class is accepted. It does not by itself authorize Approval implementation.

### B. Boundaries this analysis takes as given

- One node is one owner boundary (ADR-0001). The approver is the human owner of the target agent on this node. An authenticated agent principal is not that human.
- Every agent has exactly one human owner (accepted Identity model). Approval does not transfer, share, or delegate ownership.
- Relationships are directed and local. Approval may read current relationship usability. It must not write relationship state, and it must not treat a revoke as a peer delivery command.
- Discovery references, emails, and profile fields are not approval capabilities and are not copied onto the approval to make the requester recognizable.

If a later accepted relationship decision abandoned directed local records, the applicability section would have to be revised before implementation. This note does not reopen that boundary.

### C. Upstream modules that do not yet exist as approved contracts

| Upstream | What Approval will need | What this note must not invent |
|---|---|---|
| Skills and Policy | A deterministic `ASK` decision, the policy version that produced it, and a fresh re-evaluation API over a stored binding | Purpose fixed versus supplied (MVP-scope item 3), interval and timezone rules (item 2), policy precedence |
| Messaging | An authenticated, integrity-protected request ID bound to the sender, plus duplicate detection at ingress | Replay window, clock skew, or a second approval store owned by the envelope layer |
| Identity authentication | A trusted human-owner control path distinct from the agent principal | Credential technology, OAuth/OIDC selection, or a claim that the current Identity module already authenticates humans |
| Relationships and later permission state | Current local reads at decision, spend, and final check | A new grant model |

Until policy can say `ASK` and name a version, no approval implementation can be shown to meet `FR-007` or `SEC-008`. Preparation can still name the port.

### D. Downstream consumers

| Consumer | Dependency |
|---|---|
| Context boundary | Called only from the spend path, after the pre-read check, with the bound input only. One evaluation per request ID under the recommendation. Never called from create-pending, reject, expire, or remote ingress. |
| Disclosure / messaging egress | May carry the boolean only after the final check and the single completion commit. Schema allowlist stays the availability boolean plus safe protocol metadata. |
| Audit | Consumes minimized reason codes for the transitions `OBS-002` names. Approval must not wait on the Audit module to store raw context, and it must not build durable audit retention. Access, retention, export, and deletion stay MVP-scope item 7. |
| Two-node demonstration | Later end-to-end evidence for `ASK`. Not a substitute for the race tests this module owes. |

### E. Persistence class

ADR-0004 already chooses PostgreSQL for the transactional invariants of single-use approval, replay, and revocation. That choice becomes active only when an authorized module introduces persistent state. In-memory interleaving can support unit exploration later. It is not acceptance evidence for approval races or crash recovery. This preparation adds no driver, migration, or container.

### F. Explicit non-dependencies

- No notification, mail, push, webhook, or queue platform.
- No external AI provider and no real calendar.
- No custom cryptography, approval token format, or new identity standard.
- No cross-node relationship or approval replication.
- No package added for this analysis.
- No change to accepted Discovery or Identity behavior.

### G. Decisions that block implementation

PO-APR-1 through PO-APR-7 below. MVP-scope items 2 and 3 block the meaning of bound input and purpose, even though they are not Approval-owned decisions. MVP-scope item 8 constrains the owner channel once a demonstration surface is chosen. Item 7 constrains audit retention only; it does not have to be settled to describe minimized events, but it blocks audit acceptance.

## Reserved product decisions

Each decision below is unresolved. The recommendation is the Security and Product preparation position. It is not Human Product Owner approval. Alternatives are recorded so a rejection has a known consequence. Affected modules are the ones that must change plan if the choice moves. Reversibility assumes the decision is made before implementation; after a public contract ships, the cost is the cost of changing that contract.

### PO-APR-1. Approval channel

- Decision statement: Through which channel does the target owner approve or reject an `ASK`?
- Already fixed around it: the actor is the authenticated human owner of the target agent on this node. Another human, the requester, the target agent, a remote message, and model output are not approvers (`FR-007`, `AC-APR-002`, `SEC-004`). Architecture trust boundary 5 requires human authentication and decision integrity on any owner approval endpoint.
- Recommended option: a trusted local control path on the target node, in the same class as local relationship revoke. The concrete API, CLI, or minimal UI is the demonstration surface from MVP-scope item 8, not a second product. If that path is reachable outside the local owner trust boundary, it needs real human authentication. An agent credential must not be accepted as the human decision.
- Alternatives considered: email or push approval; an unauthenticated localhost endpoint exposed beyond the host; a magic link; approval asserted by the requester's node; holding the original network connection open until the human acts.
- Impact: the owner can complete `ASK` without a new delivery system. The requester still does not receive a protected result at create time. A network-exposed unauthenticated approval endpoint would be a blocking trust-boundary defect.
- Affected modules: Approval, Identity authentication for the human path, the demonstration surface, and Product Design for the interaction. Messaging does not gain an approve command.
- Reversibility: a local decision port that accepts only an approval identity plus approve or reject can later sit behind a UI. A requester-signed approval token or a peer approval protocol would be costly to remove and is not recommended.
- Blocked until decided: any owner-facing route, command, session, or UI.

### PO-APR-2. Information shown to the owner

- Decision statement: What does the owner see before deciding, and what must they not see?
- Already fixed around it: the binding fields exist, and the release is only the authorized boolean. Untrusted request text has no authority. Audit and remote responses omit raw context and derived results. Relationships store no label, email, or discovery reference.
- Recommended option: show the bound requester as the local Agent Identity already known to this node; the skill; the purpose value policy actually bound; the canonical input; the disclosure scope, which for this MVP is boolean availability only; the expiry; and the policy version or a short local identification of that version. Say that approval can release once. Do not render a display name, email, or profile taken from the request payload or from Discovery. Do not show private context, the derived boolean, other parties' pending requests, or prompt text as if it were a reason to approve.
- Alternatives considered: show the requester's email; show a payload-supplied friendly name; show the underlying calendar so the owner can judge the boolean; show only "an agent is asking" with no binding details.
- Impact: the owner can tell one pending request from another without turning the approval record into a second profile or context store. A payload display name would let the requester impersonate a trusted party on the decision surface. Too little detail would make the approval uninformed. Private context on this screen would train later logs and support tools to retain it.
- Affected modules: Approval read model, Product Design, demonstration surface. Discovery and Relationships stay unchanged. Audit stores the reason codes, not a copy of the screen.
- Reversibility: narrowing the shown fields later is compatible. Adding email or context later is a new privacy decision and would require a new review. Store only the binding needed for `FR-012`, so the record does not have to be migrated to forget a display name that was never saved.
- Blocked until decided: owner-facing copy, field allowlist of the local inspection response, and any fixture that claims a particular screen.

### PO-APR-3. Expiry duration

- Decision statement: How long may a pending approval remain approvable?
- Already fixed around it: an expiry is part of the binding, a change invalidates it, and an expired approval returns no result (`FR-012`, `SEC-008`, `AC-APR-002`).
- Recommended option: the receiving node sets the expiry when it creates the pending approval. The requester cannot supply or extend it. Candidate duration: 15 minutes. At or after the stored instant, approval is refused. Existing rows keep the expiry they were created with; changing a live expiry is invalidation, not renewal.
- Alternatives considered: one hour; 24 hours; no stored expiry and a connection held open for the human; requester-chosen expiry; the same duration as the still-undecided message replay window.
- Impact: a short receiver-chosen lifetime limits stolen or forgotten pending approvals and approval-queue growth. Fifteen minutes may be tight for an owner who is away, which is a product cost. A long or requester-chosen lifetime leaves a standing human decision over a stale request and is the worse security option. Reusing the message replay window would couple two different clocks without a decision on either.
- Affected modules: Approval, the owner surface that displays the deadline, and Messaging only to keep the two windows distinct. Policy does not expire grants on this clock.
- Reversibility: the default for new approvals is a configuration change. It does not rewrite old bindings. Shortening a default later is the compatible direction. Lengthening it is a Product Owner change but does not require a new protocol if the instant is stored on each record.
- Blocked until decided: any accepted test that asserts a literal duration, and any owner copy that promises one.

### PO-APR-4. Notification versus polling

- Decision statement: How does the owner learn that a decision is waiting, and how does the requester learn the outcome?
- Already fixed around it: the initial `ASK` path returns no protected result. Public remote state is disclosure-safe. Private state is not exposed remotely (`FR-007`, `FR-011`, `AC-LIFE-001`).
- Recommended option: do not build a notification platform. The authenticated requester learns the outcome by a later status read for the same request ID. The owner inspects pending approvals through the local channel in PO-APR-1. The initial response, if the transport returns one, is a disclosure-safe pending acknowledgement with no boolean. Do not hold a worker blocked for the human decision.
- Alternatives considered: email, push, webhook, or inbox notification to the owner or requester; a synchronous request that waits until approval, rejection, or expiry; requester-supplied callback URL.
- Impact: polling keeps delivery inside the existing request path and makes the single-release race a property of one record. A held connection is an approval-spam and thread-exhaustion risk. A callback or push channel would be a new trust boundary, a new abuse surface, and scope this MVP explicitly does not have. The owner may need to look at the local surface to notice work is waiting; that is an accepted product limitation of the recommendation, not a hidden notifier.
- Affected modules: Approval status read, Messaging as the carrier of an ordinary request or status read, demonstration surface for the owner list. No new runtime service.
- Reversibility: adding a notifier later is additive only if the status read remains valid and no client is promised a push. Building the notifier now would be expensive to unwind and is not recommended.
- Blocked until decided: any subscription API, outbound message, template, or background worker whose purpose is to announce approval.

### PO-APR-5. Rejection semantics

- Decision statement: Can the owner reject explicitly, how does that differ from expiry and revocation, and what may the requester observe?
- Already fixed around it: rejection returns no protected result (`AC-APR-002`, `FR-008`). The lifecycle must be able to represent rejected/denied, expired, and failed (`FR-011`). Revocation, rejection, and expiry are separately auditable (`OBS-002`). Unauthorized remote responses do not explain a private denial (`SEC-018`).
- Recommended option: the authenticated target owner may explicitly reject a `pending` approval. Reject is terminal, reads no context, and releases nothing. Expiry remains a different terminal state when the owner does nothing. Revocation and policy invalidation remain different local and audit reasons. To the bound requester, all of those non-success outcomes are one disclosure-safe non-disclosure. The requester cannot reject or approve the target record. There is no cross-node cancel command. A repeated reject is a safe no-op on the same terminal record.
- Alternatives considered: no explicit reject, only expiry; distinct remote codes for reject, expire, revoke, and policy change; requester cancel that mutates the target approval; treating revocation as a pause rather than a terminal invalidation.
- Impact: explicit reject lets the owner close a request without waiting out the expiry. Collapsing the remote outcome prevents the requester from using approval errors as a policy and revocation oracle. The owner and a later authorized operator can still reconstruct which local reason occurred. Distinct remote codes would be more debuggable and more revealing. Requester cancel across nodes would be a new protocol.
- Affected modules: Approval state machine, owner channel, requester public status, Audit reason codes. Relationships remain unaware of reject.
- Reversibility: starting with a coarse remote code is compatible with a later, explicitly approved, more detailed code. Starting with detailed remote codes is harder to tighten without breaking clients. The internal reason can be detailed from the start without being part of the public contract.
- Blocked until decided: the public status enumeration beyond the disclosure-safe split, and whether the owner surface offers a reject action.

### PO-APR-6. Duplicate semantics

- Decision statement: What is the one deterministic outcome when a request ID is repeated, and do distinct IDs for the same question merge?
- Already fixed around it: the same request ID cannot duplicate an approval, a context evaluation, or a disclosure (`SEC-007`, `REL-002`). One exact approval can release once (`SEC-008`).
- Recommended option: the same ID and the same canonical binding share one approval. The same ID with any different bound field fails closed, leaves the stored binding unchanged, and discloses nothing. Different request IDs do not merge, even when the question is identical; approving one does not approve the other. After the single winning release, later reads by anyone, including the original requester, return no protected result and do not evaluate context again. A failed or crashed spend does not return the row to `pending` and does not retry the evaluation. Concurrent spends produce one winner and one non-disclosure for each loser.
- Alternatives considered: coalesce identical questions into one pending approval; idempotently return the same boolean to the same requester until expiry; store the boolean in an outbox until the requester acknowledges it; roll a failed evaluation back to `pending` for another attempt; let the second identical `ASK` create a second owner task.
- Impact: at-most-once delivery avoids a second disclosure and avoids storing the derived result. A lost response is not repaired by retry; the requester must send a new request ID, which is a new owner decision if policy is still `ASK`. Coalescing would hide two requests behind one approval and make the binding ambiguous. Idempotent replay is easier for flaky clients and weaker if a response is observed twice or logged. An outbox of booleans conflicts with the default ban on retaining derived results.
- Affected modules: Approval, Messaging duplicate handling, requester demonstration client. Context is invoked at most once per request ID. Audit records replay without the boolean.
- Reversibility: request-ID uniqueness should not be reversed. Coalescing can be added later only as a new product rule with its own privacy review. Changing at-most-once to idempotent replay later requires storing or recomputing the boolean, which is a new privacy decision. Prefer the stricter rule first.
- Blocked until decided: the replay response oracle, crash-recovery oracle, and any test that either expects or forbids a second copy of the boolean.

### PO-APR-7. In-flight and computed-but-undelivered results

- Decision statement: After a grant is revoked, what happens to work that is pending, computed but not delivered, or already delivered, and how stale may that decision be?
- Already fixed around it: later decisions and the final pre-disclosure check deny access, and an applicable pending approval is invalid (`SEC-009`, `AC-REV-001`, `FR-009`). `REL-001` still requires the approved in-flight rule, which does not exist yet. `AC-REV-001` marks the in-flight boundary and latency `TBD-PO`.
- Recommended option: keep the existing item 5 recommendation. Invalidate applicable pending approvals. Invalidate and discard computed results that have not been delivered. Do not retract a delivered result. Use the definitions of pending, undelivered, and delivered in the revocation section, including fail-closed recovery when a commit crashes before the response is written. Use no grace period. This does not define the other node's behavior and does not add a notification or clawback message.
- Alternatives considered: allow the in-flight response to finish once context has been read; allow a measured grace period; retract delivered results with a later protocol message; pause the pending approval until the grant returns; define delivery only when the requester node acknowledges receipt.
- Impact: the owner can stop a not-yet-sent boolean without pretending to erase one the requester already has. Discarding undelivered work can waste a human approval that lost the race with revoke; that approval must not be reused. Acknowledgement-based delivery would extend the undelivered window and needs a protocol this module does not have. A grace period would contradict a strict reading of the immediate final check.
- Affected modules: Approval, Policy re-check, Context discard path, Messaging egress. Relationships only supply the current local read. The peer node, Discovery, and Audit retention are not given new duties.
- Reversibility: choosing no retraction cannot later be made into reliable retraction, because the boolean may already have been seen. Choosing no grace can later be relaxed only by an explicit Product Owner decision. Choosing a grace period or an ack-based window first would be harder to tighten. The recommendation is the stricter reversible direction, except that "delivered" must be defined before clients depend on it.
- Blocked until decided: acceptance evidence for `REL-001`'s in-flight clause, any test that fixes crash or clawback behavior, and any claim that `AC-REV-001` is complete.

### Decisions owned elsewhere that this module must not close

| Item | Why Approval only binds it |
|---|---|
| MVP-scope item 2, availability interval | The bound input is whatever the approved skill contract says. Canonical comparison waits on that contract. |
| MVP-scope item 3, purpose | Purpose is a bound field whether it is fixed or supplied. Approval does not choose which. |
| MVP-scope item 7, audit access and retention | Reason codes can be named. Retention, export, and deletion cannot. |
| MVP-scope item 8, demonstration surface | PO-APR-1 follows that surface instead of creating a parallel one. |
| Message replay window and clock skew | Envelope freshness is not the approval expiry. |
| Abuse-limit numbers | The threat model leaves quotas open. Approval only requires a bounded fail-closed pending set. |

## Security findings

Findings are preparation constraints. None of them authorizes code. A finding becomes blocking on an implementation that departs from the accepted constraints or that treats a recommendation as already approved.

| Finding | Class | Consequence if ignored |
|---|---|---|
| `ASK` create returns or precomputes the protected boolean | Blocking. Violates `FR-007`, `PRV-003`, and the P0 bar for a result before approval. | Private context leaves, or is touched, before the owner decides. |
| Remote content, model output, or an agent credential can spend an approval | Blocking. Violates `SEC-004` and `AC-APR-002`. | The requester approves its own request. |
| Release uses the `ASK` snapshot instead of a fresh check, or skips the check after derivation | Blocking. Violates `SEC-009` and `REL-004`. | Revocation loses the race by construction. |
| A second spend or replay discloses again | Blocking. Violates `SEC-007` and `SEC-008`. P0 or P1 depending on whether authority was bypassed; duplicate delivery is at least P1 and is P0 if it repeats protected data after revocation. | Single-use is only a label. |
| Mismatched duplicate request ID mutates the stored binding | Blocking. Violates `SEC-008`. | The owner approves one input and the requester substitutes another. |
| Owner decision accepts a client-supplied scope or a payload display name as identity | Blocking for that design. | Confused deputy and approver impersonation. |
| This node sends a revoke, cancel, or retraction to the peer | Blocking relative to the directed local relationship boundary. | A local revoke becomes an unapproved cross-node protocol. |
| Notification platform, approval email, or callback URL appears in the design | Blocking until a Product Owner explicitly adds that scope. | New trust boundary and a contradiction of this note's non-goal. |
| Item 5 recommendation is encoded as accepted `AC-REV-001` evidence | Blocking process and evidence defect. | The in-flight rule is treated as decided when it is not. |
| Derived boolean or private context is stored on the approval, in an outbox, or in logs | Blocking for the privacy default. | Retention outlives the one response and leaks through audit. |
| Pending approvals grow without a bound | Blocking before release, as an abuse control. The numeric quota is not yet a product decision. | Approval spam exhausts the node. |
| Human approval endpoint is network-exposed without human authentication | Blocking. Architecture boundary 5. | Anyone who can reach the port can spend the approval. |
| In-memory races are offered as MVP evidence for single-use | Blocking for acceptance evidence. Not a prohibition on later unit tests. ADR-0004. | Lost updates stay invisible. |

Residuals that remain even if every recommendation is accepted:

- A compromised target node can read local context and forge the owner's local decision. Node compromise is outside this module, as already stated in the threat model.
- At-most-once delivery can drop the one boolean across a crash. The requester is not given a silent retry.
- Repeated separately approved questions can still infer more than one boolean. Approval does not replace the query-budget decision.
- The owner's local inspection is only as private as the host. This note assumes that host is inside the owner trust boundary.
- Clock steps can make expiry early or late. The requester still cannot choose the deadline. A large backward step could make an expired row look unexpired; the implementation later needs a monotonic comparison against the stored deadline and should fail closed if the trusted clock is unavailable. No NTP design is selected here.
- The other node may keep displaying a boolean this node has since revoked. No retraction is recommended, and none is currently possible without a new protocol.
- A minimized audit event can be lost if the later audit sink fails after the authority write. The authority transition must not be rolled back to `pending` or `active` merely to recreate an event. The same residual is already accepted for relationship revoke. Durable audit delivery belongs to Audit.

## Independent test scenarios QE would later require

These are oracles for a later authorized implementation. They are not tests, and they do not make `AC-APR-001`, `AC-APR-002`, or `AC-REV-001` complete. Developers would own the automation. QE would independently verify the evidence, including adversarial sequencing, and would reject skipped tests as acceptance evidence.

Quality strategy already classifies a protected result before approval, revoked-permission reuse, and context leakage as P0. Approval races and duplicate delivery are P1 unless the race also bypasses authorization, in which case they are P0. Before Ready for Development, the approval test configuration would need full decision and branch coverage on the security-critical files. That configuration is not added now.

Stable oracles, independent of the reserved choices:

| ID | Scenario | Oracle |
|---|---|---|
| QE-APR-01 | Policy is `ASK` and one well-formed request arrives. | Exactly one pending approval exists. The response and any local side effect contain no availability boolean and no private context. Context was not called. `AC-APR-001`. |
| QE-APR-02 | The same binding is submitted concurrently many times under one request ID. | One row. One public pending outcome. No context call. |
| QE-APR-03 | The same request ID is repeated with any one bound field changed, including a wider interval or a wider disclosure scope. | No second row, no edit of the stored binding, no context call, no protected result. |
| QE-APR-04 | The requester message contains instructions or fields that claim approval, `ALLOW`, a self-grant, or a demand for the calendar. | Policy and the approval record are unchanged by that text. No release. `AC-SEC-001`. |
| QE-APR-05 | The spend is attempted by the requester, the target agent, another human, another agent of the owner, or with no authenticated human. | No state change to `releasing` or `completed`. No result. |
| QE-APR-06 | Two authenticated owner approvals race, or one approval is repeated after completion. | One context evaluation and at most one protected response. The loser and the replay return no protected result. |
| QE-APR-07 | Policy version or any bound field changes between create and spend. A new policy of `ALLOW` is included. | The old approval does not release. Context is not read for it. |
| QE-APR-08 | The owner command includes a substituted input, scope, or expiry. | The server compares the stored binding. The substitution does not release. |
| QE-APR-09 | The stored expiry is already past at spend time. | No release. The configured duration and the exact stored instant are not product decisions; PO-APR-3 covers those. |
| QE-APR-10 | Policy inputs, the relationship read, or the approval store is unavailable. | No partial pending row on create. No release on spend. No protected result. `REL-003`. |
| QE-APR-11 | The applicable relationship or permission is revoked while the approval is `pending`. | The pending approval becomes invalid. A later owner approval reads no context and returns no result. `AC-REV-001` pending half only. |
| QE-APR-12 | Revocation commits after the owner decision and before the context call. | Context is not called. No result. |
| QE-APR-13 | The final authority read fails after a value was computed and before disclosure. | The response contains no boolean. The failed check is the stable part. What the row is named, and whether a sent response is clawed back, stay conditional on PO-APR-7. |
| QE-APR-14 | The opposite relationship direction is revoked, or the other node revokes its own record. | Approvals that do not use the revoked local direction remain subject to their own checks. This node sends no cancel and no retraction. |
| QE-APR-15 | A revoked or invalidated approval belongs to a grant that is later created again. | The old approval stays terminal. The new grant does not make it releasable. |
| QE-APR-16 | `DENY`, malformed input, unknown skill, or ambiguous policy. | No approval row and no protected result or private reason. |
| QE-APR-17 | Logs, errors, and minimized events from the scenarios above. | No raw context, message body, secret, credential, or derived boolean. |
| QE-APR-18 | A status read uses a guessed ID or an ID bound to a different requester. | No protected result and no private policy or context reason. Whether those two failures share one body is the PO-APR-5 projection, not a separate accepted status code. |

Conditional oracles. The recommended column is what QE should use only after the Product Owner accepts that recommendation. If it is rejected, the suite stops and the oracle is rewritten. These checks must not be marked passed on the current documents.

| ID | Decision | Recommended oracle | If the recommendation is rejected |
|---|---|---|---|
| QE-APR-19 | PO-APR-1 | Owner spend succeeds only through the trusted local human path. No network notifier and no agent credential can spend it. | Retest the newly approved channel. Unauthenticated or remotely asserted approval remains a failure even then. |
| QE-APR-20 | PO-APR-2 | Local inspection shows the binding fields in the recommendation and no payload display name, email, context, or derived result. | Replace the allowlist before implementation. Do not keep both screens. |
| QE-APR-21 | PO-APR-3 | Injected clock crosses the configured deadline and the spend returns no result. The literal 15-minute candidate is not hard-coded as accepted. | Use the approved duration. Keep the exclusive stored-instant check unless the Product Owner also changes it. |
| QE-APR-22 | PO-APR-4 | Outcome is observed by a later authenticated status read. No outbound notification exists. The create response has no boolean. | A newly approved notifier needs its own abuse, authentication, and leakage suite. Do not add that suite speculatively. |
| QE-APR-23 | PO-APR-5 | Explicit reject, expiry, and revocation are distinct in the owner and audit views, identical as remote non-disclosure, and free of context reads. | If remote codes must differ, add an inference review before those tests become acceptance evidence. |
| QE-APR-24 | PO-APR-6 | Distinct IDs are distinct approvals. The completed boolean is not returned again. A crash after the evaluation is spent does not evaluate or disclose again. | Idempotent replay or coalescing needs a new privacy oracle, including where the boolean is stored. |
| QE-APR-25 | PO-APR-7 | A computed but unsent boolean is discarded when revocation wins. A response already handed to the requester is not followed by a retraction message. There is no grace sleep in the test. | If in-flight work may finish, or if retraction is required, stop. Those are different products and different threat models. |

QE would also require the race rows in the concurrency table to be executed against the real transactional store before MVP acceptance, not only against an in-memory fake. That evidence cannot exist during preparation. Two-node demonstration evidence is additional and later. It does not replace the single-node race suite.

Relationship, Discovery, and Identity tests must not be extended to simulate these oracles and then described as Approval acceptance.

## Analysis that can continue

The following work stays inside preparation and does not require the reserved decisions to be closed first:

- Review this interaction model against a later Skills and Policy preparation, especially the shape of a policy version and the fresh re-evaluation input.
- Review it against a later Messaging preparation so request-ID uniqueness has one owner and the envelope replay window is not silently reused as PO-APR-3.
- Refine the minimized reason-code allowlist for approval, rejection, expiry, revocation, replay, validation failure, and disclosure, without raw context and without deciding retention.
- Keep the threat model's approval forgery, race, and spam rows aligned with the stable oracles above.
- Record, on Issue #11, that this note exists and that the module remains in preparation. That tracking update is coordinator work, not a product decision and not part of this file's authorization.

An ExecPlan can restate these constraints later. This note is not that plan. An ExecPlan written before PO-APR-1 through PO-APR-7 are decided cannot be used to start implementation.

## Implementation that stays blocked

- Any Approval production code, migration, dependency, route, command, UI, fixture that encodes a reserved oracle, or test that claims `AC-APR-001`, `AC-APR-002`, or `AC-REV-001`.
- Moving Issue #11 to Ready for Development or treating this note as Product Owner approval.
- Adding PostgreSQL ahead of an authorized persistence module.
- A notification platform or any owner or requester push channel.
- A cross-node cancel, replication, or retraction behavior.
- Context access on the `ASK` create path, including "optimistically compute and hold."
- Using the item 5 recommendation, the 15-minute candidate, at-most-once crash behavior, or remote reason collapsing as if the Product Owner had accepted them.
- Completing `REL-001` or `AC-REV-001`. The pending-invalidation half is specified; the in-flight boundary and latency are not.
- Implementation is also sequenced after the approved policy, messaging, and context contracts exist. Closing the reserved decisions early would not by itself make those upstream modules ready.

## Traceability

| Accepted or reserved item | IDs |
|---|---|
| One pending approval, no protected result | `FR-007`, `AC-APR-001` |
| Binding and single-use | `FR-012`, `SEC-008`, `AC-APR-002`, security principle 7 |
| Duplicate request IDs | `SEC-007`, `REL-002`, `AC-MSG-001` |
| Lifecycle representation and remote minimization | `FR-011`, `AC-LIFE-001`, `FR-008`, `SEC-018`, `PRV-006` |
| Revocation re-check and pending invalidation | `FR-009`, `SEC-009`, `REL-004`, `AC-REV-001` |
| In-flight rule not yet approved | `REL-001`, `AC-REV-001` TBD-PO, MVP-scope item 5, PO-APR-7 |
| No context until a still-valid approval | `PRV-003`, `SEC-003`, `SEC-010` |
| Untrusted approval attempts | `SEC-004`, `AC-SEC-001` |
| Disclosure shape | `FR-004`, `FR-006`, `PRV-002`, `SEC-011` |
| Fail closed | `SEC-005`, `REL-003`, `AC-VAL-001` |
| Audit minimization | `SEC-017`, `PRV-004`, `OBS-001`, `OBS-002`, `OBS-003`, `AC-AUD-001` |
| Channel, owner information, expiry, polling, rejection, duplicates | MVP-scope item 4, `AC-APR-002` TBD-PO, PO-APR-1 through PO-APR-6 |
| Transactional store, later | ADR-0004 |
| Separate approval boundary | ADR-0001, ADR-0003 |

No new requirement ID is minted here. If the Product Owner accepts a recommendation, the product documents are updated at that gate to record the decision. That update is not performed by this note.

## Completion

This file is the Issue #11 Security and Product preparation analysis. It does not mark the module Ready for PO or Ready for Development. The Human Product Owner has not approved the channel, the owner information, the expiry, notification versus polling, rejection semantics, duplicate semantics, or the in-flight and undelivered-result rule.
