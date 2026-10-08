# Human Product Owner Decision Packet

Resolved on 2026-10-08. The Human Product Owner approved D1 through D8 as
recorded below and ratified PRQ-002 completion, PRQ-011, PRQ-014, and the
PR #52 evidence fixes. Those decisions are not open. Engineering implements
them without another Product Owner gate.

The recommendations below are the approved text. Later notes in this file that
say a decision is waiting are historical and are superseded by this resolution.

Queue classes:

- `PO review pending — ratification only`: already implemented inside delegated
  authority. It does not block engineering.
- `Reserved Product Decision — blocking`: stops only the named workstream.
- `Resolved`: the Human Product Owner already decided it.

## Higher-level rules

Three answers unlock the next Skills and Policy implementation. The later
batches do not constrain that work.

## D1 — Local owner sets permission explicitly

- Decision IDs: PRQ-005, specification rows SP-R5 and SP-R7.
- Short title: Who may grant a skill permission, and who chooses ALLOW or ASK?
- Exact decision: which actor may create or revoke a skill permission on this
  node, and whether ALLOW versus ASK is inferred.
- Recommended default: only the human owner, through a trusted local control
  path, may create or revoke a permission. The record's explicit effect is the
  only source of `ALLOW`, `ASK`, or `DENY`. Absence is `DENY`. A relationship,
  advertisement, Discovery reference, remote message, or model output cannot
  grant permission or choose the effect.
- Why: least authority, explicit consent, fail closed, and local authority.
  It matches SEC-004 and FR-003. PO-REL-4 is the same shape for relationships,
  but that approval did not by itself transfer to permissions.
- Alternatives: remote grant; permission implied by a relationship; permission
  implied by an advertisement; always ASK; always ALLOW when a relationship
  exists; the caller or a model chooses.
- Product impact: the owner sees a separate permission from the relationship.
  There is no social default that a connected agent may be queried.
- Security and privacy impact: an implied grant would turn relationship or
  advertisement into execution authority.
- Reversibility: high while no mutate port ships. Low after a remote grant API
  exists.
- Blocks: permission create and revoke commands, and any allow/ask matrix.
- Does not block: the merged evaluator, relationship records, skill
  advertisement, or evaluation of an injected permission snapshot.
- Unlocks if accepted: local permission commands and a policy service that
  reads an explicit current permission. Together with D2, the policy service
  can be implemented.
- Follows an accepted principle: yes. SEC-004, FR-003, fail closed, and local
  authority. The exclusivity of the grantor was still reserved.
- Priority: **HIGH-LEVERAGE PO DECISION**.

## D2 — Which directed relationship authorizes a request

- Decision IDs: PRQ-010, specification row SP-R6.
- Short title: Which ordered pair must be active?
- Exact decision: before a local decision may be `ALLOW` or `ASK`, which
  directed relationship must read `true`?
- Recommended default: on the receiving node, require a fresh
  `readActive(requester, local target)`. The reverse pair is neither necessary
  nor sufficient. A missing, thrown, or cached read is not active.
- Why: PO-REL-2 already made relationships directed. Inferring the reverse
  would reopen that decision. This is the least authority that still matches
  an owner-created edge toward the node being queried.
- Alternatives: reverse only; either direction; both directions; an undirected
  edge.
- Product impact: the owner action that matters is the edge from the requester
  to the target on the target's node. The opposite edge does not consent to
  the query.
- Security and privacy impact: the wrong pair denies honest requests or treats
  a different owner action as consent.
- Reversibility: moderate. It is local. Seeds and tests will encode it. No wire
  field has to publish it.
- Blocks: the policy service's choice of `readActive` arguments, if that choice
  is treated as the approved rule.
- Does not block: Relationships, the boolean-input evaluator, or a failed-closed
  read when the boolean is missing.
- Unlocks if accepted: the adapter from the merged Relationships read into
  policy. With D1, the policy service is unblocked.
- Follows an accepted principle: yes, as a reading of PO-REL-2. The pair itself
  was not chosen in that approval.
- Priority: **HIGH-LEVERAGE PO DECISION**.

## D3 — One availability purpose

- Decision IDs: PRQ-003, specification row SP-R1.
- Short title: Is the MVP purpose fixed?
- Exact decision: is the only MVP purpose the literal `availability_check`, or
  may a caller or owner supply another?
- Recommended default: the only purpose is `availability_check`. Any other
  purpose is unmatched and denies.
- Why: minimal disclosure, smallest consent surface, and no free-text injection
  into an approval.
- Alternatives: an owner-configured list; free-text caller purpose; omitting
  purpose.
- Product impact: every approval binds the same purpose. The product does not
  gain a purpose catalog.
- Security and privacy impact: free text is an injection and scope-expansion
  channel.
- Reversibility: high before a message contract accepts free text. Low after
  clients depend on it.
- Blocks: caller-supplied purpose grammar and approval records that store a
  caller-supplied purpose.
- Does not block: exact-match denial, the evaluator, or skill advertisement.
- Unlocks if accepted: pinning that literal in request validation and in later
  approval binding.
- Follows an accepted principle: yes. Minimal disclosure and the smallest MVP
  scope. The literal was not previously ratified.
- Priority: **HIGH-LEVERAGE PO DECISION**. It is one sentence and removes an
  injection decision before any request schema is frozen.

## D4 — Local approval, then stop on revoke

- Decision IDs: PRQ-006, PRQ-007, specification rows SP-R4 and SP-R8.
- Short title: How does ASK reach the owner, and what does revoke do to work
  that has not been delivered?
- Exact decision: approval channel, owner-visible content, expiry, notification,
  rejection, duplicates, and the fate of pending or undelivered results.
- Recommended default: the owner acts locally on the exact bound request. The
  prompt contains no raw context, no other person's email or profile, and no
  model-written justification. Expiry is short. No notification transport is in
  the MVP. A duplicate request id does not create a second approval or
  disclosure. Revoke invalidates pending approvals and results computed but not
  delivered. A result already delivered is not retracted.
- Why: explicit consent, minimal disclosure, fail closed, and no new
  remote-delete protocol. This is the existing MVP-scope recommendation for
  in-flight results.
- Alternatives: remote notification with context snippets; long-lived approval;
  implied approval; let in-flight work finish; attempt to retract delivered
  results.
- Product impact: ASK returns nothing until the owner acts. Revoke stops
  anything not yet delivered.
- Security and privacy impact: the owner prompt can leak private request
  contents. Finishing in-flight work can disclose after revoke.
- Reversibility: moderate to low once an external client depends on a channel
  or observes late results.
- Blocks: approval storage, owner-facing approval UX, and the final disclosure
  path after revoke.
- Does not block: `ASK` as a decision enum, Relationships revoke-and-read, or
  skill advertisement.
- Unlocks if accepted: Approval Lifecycle implementation, still behind a
  current policy decision.
- Follows an accepted principle: yes for fail closed and minimal disclosure.
  The channel and the in-flight boundary were explicitly left open.
- Priority: high, but not on the current critical path. It can be answered in
  the same reply. It does not unblock the next policy-service slice by itself.

## D5 — Availability window and query budget

- Decision IDs: PRQ-004, specification rows SP-R2 and SP-R3.
- Short title: What time window and query budget may produce one boolean?
- Exact decision: instant versus half-open interval, timezone and DST, maximum
  horizon and duration, and the repeated-query budget. Boolean output is
  already required and is not part of this decision.
- Recommended default: one half-open UTC interval `[start, end)`, entirely
  inside the next 7 days on the node's trusted clock, lasting at most 4 hours,
  with no lookback. Process-local budget: 8 authorized reads per caller and 32
  per node per 24 hours. No caller timezone. Output remains a boolean.
- Why: smallest inference surface. A shifted or unbounded window reveals more
  of a private schedule. These numbers are the preparation recommendation, not
  an approval.
- Alternatives: instant only; owner-local timezone with DST; unbounded horizon;
  no budget.
- Product impact: the owner can tell which future window was asked about only
  through the boolean. Repeated probes are capped.
- Security and privacy impact: interval shape and budget change how much
  private schedule data a caller can infer.
- Reversibility: moderate before two-node clients depend on the window.
- Blocks: availability computation and any public interval contract.
- Does not block: boundary notes, the policy kernel, or boolean-output checks.
- Unlocks if accepted: Context Boundary computation. A query still waits for an
  `ALLOW` from policy.
- Follows an accepted principle: yes for boolean output and minimal disclosure.
  The window and the numbers were reserved.
- Priority: not the current critical path.

## D6 — Local minimized audit

- Decision IDs: PRQ-008.
- Short title: Who can see audit records, and for how long?
- Exact decision: inspect, export, retention, and deletion. Derived results
  stay omitted by the existing PRV-004 rule.
- Recommended default: the local authorized operator only, short retention,
  deletion that cannot recreate raw context, and no availability boolean in the
  event.
- Why: smallest access set and the accepted minimization rule.
- Alternatives: remote audit query; long retention; storing the boolean for
  debugging.
- Product impact: audit explains decisions to the local operator. It is not a
  second copy of private context.
- Security and privacy impact: export and long retention duplicate private
  data.
- Reversibility: low after records are stored or exported.
- Blocks: audit storage and operator query.
- Does not block: redaction rules or the minimized events already used by
  Discovery, Relationships, and skill advertisement.
- Unlocks if accepted: the Audit module's storage slice.
- Follows an accepted principle: yes for minimal disclosure. The access and
  retention choices were reserved.
- Priority: not the current critical path.

## D7 — Two-node surface

- Decision IDs: PRQ-009.
- Short title: What does the demonstration look like?
- Exact decision: API, CLI, or minimal UI, and whether acceptance uses two
  processes.
- Recommended default: two separate processes and a thin local CLI or API. No
  product UI.
- Why: smallest surface that still shows two independently controlled nodes.
- Alternatives: a minimal UI; one process pretending to be two nodes.
- Product impact: acceptance is a command or local call, not a screen.
- Security and privacy impact: a UI can hide which node authorized the result.
  One process can blur the trust boundary.
- Reversibility: high before demonstration clients exist.
- Blocks: demonstration implementation. PO-REL-6 still requires verified
  PostgreSQL revocation before relationship state is used as restart-safe
  authority in that demonstration.
- Does not block: integration planning.
- Unlocks if accepted: the surface choice only. The demo remains hard-blocked
  on the trust-path modules.
- Follows an accepted principle: yes for the smallest MVP and for separate
  trust boundaries. The surface was reserved.
- Priority: low until D1, D2, and the trust path exist.

## D8 — Message protection and public denial shape

- Decision IDs: PRQ-012 and PRQ-013. These consolidate the open messaging
  preparation note and specification row SP-R9. They were not separate queue
  items before this packet.
- Short title: What protects a message, and what may a remote denial contain?
- Exact decision: whether MVP messaging uses an existing transport and
  authentication stack, and which fields are safe on a remote response.
- Recommended default: existing TLS, plus an existing HTTP authentication or
  mutual-TLS binding. No custom cryptography and no new agent protocol. A
  remote success that is later allowed to leave the node is the boolean alone.
  A remote denial is one non-revealing outcome. No reason code, policy version,
  or skill name on that response.
- Why: minimal disclosure, no proprietary protocol, and SEC-018.
- Alternatives: a custom cryptographic handshake; a public reason enum;
  correlation ids and expiry on the denial.
- Product impact: nodes talk over ordinary authenticated HTTPS. Callers cannot
  branch on why a request was denied.
- Security and privacy impact: extra public fields become a second disclosure
  channel. Custom cryptography adds an unreviewed protocol.
- Reversibility: low after clients depend on a wire schema.
- Blocks: wire-protocol implementation and the remote response schema.
- Does not block: threat notes, or local decisions that carry no metadata.
- Unlocks if accepted: a later messaging slice, still behind policy and
  authentication.
- Follows an accepted principle: yes. No proprietary cryptography, and
  indistinguishable denial, are already binding. The concrete stack and the
  empty metadata list were not ratified.
- Priority: not the current critical path.

## Ratification only

These do not block engineering.

- PRQ-001 is `Resolved`. Delegated autonomous delivery was ratified on
  2026-10-07.
- PRQ-002 development is `Resolved`. Completion of the approved in-memory
  Relationships slice was ratified on 2026-10-08. PR #46 merged as `2e04c6a`.
  That ratification does not make in-memory state restart-safe evidence.
- PRQ-011 was ratified on 2026-10-08. The deny-by-default evaluator merged in
  PR #47. Security found no blocking finding. The later bounded permission
  slice in PR #54 is Engineering Accepted separately. Composition with
  approval remains cross-module work.
- PRQ-014 was ratified on 2026-10-08. The process-local skill advertisement
  merged in PR #49 as `5d13fdb`. It grants nothing. Security found no blocking
  finding.
- Identity and Discovery were accepted before this packet.

## Work in progress

D1 through D8 are resolved. Sentences above that say a workstream stays blocked
describe the queue before that resolution.

These process-local slices are Engineering Accepted, with Human Product Owner
acceptance still pending: audit (PR #56), approval (PR #58), skill permission
and policy (PR #54), and availability (PR #57). Wiring the approval port is
cross-module composition, not a missing permission rule.

The availability message boundary merged in PR #55. It is not whole-module
messaging acceptance. Replay protection and handshake freshness remain a later
slice. They are not a new Reserved Product Decision. The numeric window is
not chosen.

The PostgreSQL relationship revoke merged in PR #60. Two-node acceptance still
needs two processes, replay rejection, and restart evidence. That remaining
work is not a new Reserved Product Decision.
