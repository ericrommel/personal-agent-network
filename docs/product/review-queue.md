# Product Review Queue

The Human Product Owner reviews this queue asynchronously. Engineering does not
stop for that review unless an item below says a specific workstream is
blocked.

GitHub Issue #33 is the standing queue index:
<https://github.com/ericrommel/personal-agent-network/issues/33>. This file is
the versioned record. When they differ, update the Issue to match this file.

Status values:

- `Ratified`: the Human Product Owner already made this decision.
- `PO review pending`: engineering chose or completed the work inside delegated
  authority. Ratification has not happened. Do not backdate it.
- `Blocked`: a Reserved Product Decision stops only the listed workstream.

## PRQ-001 — Delegated autonomous delivery

- Module: cross-cutting delivery process.
- Decision: Product Owner checkpoints are asynchronous review points. Engineering
  continues unless work is explicitly unsafe or a Reserved Product Decision.
- Recommendation chosen: the operating model authorized on 2026-10-07 and
  recorded in `docs/engineering/development-process.md` and `AGENTS.md`.
- Reason: the Human Product Owner authorized long-running autonomous delivery.
- Alternatives rejected: keep synchronous `Ready for PO` and `Ready for PO
  Acceptance` as stop-the-line gates.
- Security and privacy impact: binding PAN principles stay in force. Reserved
  Product Decisions and critical trust-boundary findings still stop the affected
  work. They do not stop unrelated work.
- Reversibility: a later Human Product Owner instruction can restore narrower
  gates. Merged module behavior is unaffected until a separate change lands.
- Implementation status: process documentation updated in the autonomous-delivery
  change.
- Tests and evidence: documentation review. No runtime behavior changes.
- Residual risks: a later agent could treat a reserved choice as autonomous.
  The reserved list and this queue are the control.
- Deferred limitations: the engineering GitHub token cannot update the Project
  board. Module Issues remain the delivery record.
- Human PO review status: `Ratified` on 2026-10-07 by the authorizing prompt.

## PRQ-002 — Relationships development decisions

- Module: Relationships, Issue #7.
- Decision: PO-REL-1 through PO-REL-6, plus the approved lifecycle rules on
  Issue #7.
- Recommendation chosen: pre-seeded directed node-local records; owner-only
  local mutation; boolean local read; process-local memory with an explicit
  restart limitation; new id after revoke; failed create leaves no active row;
  stored revoke survives an observer failure; ineligible agents do not delete
  history but fail closed on read.
- Reason: the Human Product Owner approved those options on Issue #7.
- Alternatives rejected: invitation flow, undirected or mutually revoked
  records, remote mutation, remote relationship queries, and treating in-memory
  state as restart-safe MVP evidence.
- Security and privacy impact: remote input cannot grant relationship
  authority. A relationship is not skill, context, or execution authority.
  Restart can drop a revoke. That limitation is explicit and is not durable
  security evidence.
- Reversibility: invitation, durability, and remote protocol behavior were not
  built, so those later choices remain open. The in-memory semantics can be
  replaced by a PostgreSQL adapter behind the same port.
- Implementation status: `In Development` in PR #46. Local verification passed.
  Final engineering acceptance is not claimed. Security and QE review of the
  code are still required.
- Tests and evidence: preparation package in PR #32. PR #46 has developer tests
  for the next local read, direction, rollback, and separation. In-flight
  revocation is not claimed.
- Residual risks: preparation Security and Architecture runs timed out. An
  independent implementation review is still required. In-memory revocation
  disappears on restart.
- Deferred limitations: no invitation UX, no remote relationship API, no
  PostgreSQL in this slice, no skill permission, and no in-flight approval
  behavior.
- Human PO review status: `Ratified` for development on Issue #7. Completion
  ratification waits until engineering records `Engineering Accepted`. The
  2026-10-06 note that asked engineering to stop at final acceptance is
  superseded for process by PRQ-001. It is not rewritten into an earlier final
  acceptance.

## PRQ-003 — Fixed availability purpose

- Module: Skills and Policy, Issue #8. Also binds later Approval requests.
- Decision: is the MVP purpose fixed to `availability_check`, or may a caller or
  owner supply one?
- Recommendation: fixed literal `availability_check`.
- Reason: smallest consent surface, least injection exposure, and easiest
  approval binding.
- Alternatives: owner-configured purpose list; free-text caller purpose.
- Security and privacy impact: free text becomes an injection and disclosure
  review problem. A fixed purpose does not disclose private context.
- Reversibility: inexpensive before an external message contract is accepted.
  Expensive after clients depend on free text.
- Implementation status: not chosen as an approved contract. Skills preparation
  may name it as a provisional assumption. Caller-supplied purpose grammar stays
  unblocked from other Skills work and blocked as its own slice.
- Tests and evidence: none yet. This item records the open decision.
- Residual risks: implementing free-text purpose would widen untrusted input.
- Deferred limitations: no purpose catalog beyond the single recommended literal.
- Human PO review status: `Blocked` for caller-supplied purpose only. This is a
  Reserved Product Decision because it changes consent semantics and the
  externally visible request contract.
- Affected workstreams: purpose grammar and any Approval binding that stores a
  caller-supplied purpose. Policy preparation, relationship implementation, and
  deny-by-default evaluation over an explicit purpose input continue.

## PRQ-004 — Availability interval semantics

- Module: Context Boundary and Availability, Issue #10. The Skills contract must
  not silently settle it.
- Decision: is availability an instant or a half-open interval, what timezone
  and DST rules apply, and what maximum horizon, duration, and query budget are
  allowed?
- Recommendation: half-open UTC intervals, a small documented horizon, and a
  small query budget. Boolean output stays required by FR-004 and PRV-002.
- Reason: privacy-preserving, small, and testable. The exact numbers need Human
  Product Owner ratification before context behavior is user-visible.
- Alternatives: instant-only checks; owner-local timezone with DST; unbounded
  horizon.
- Security and privacy impact: interval shape changes what private schedule
  data can be inferred. Output remains a boolean either way.
- Reversibility: moderate before two-node clients depend on it.
- Implementation status: reserved. Context computation does not start.
- Tests and evidence: none yet.
- Residual risks: a Skills implementation could hard-code interval meaning.
  Preparation must keep interpretation out of the policy kernel.
- Deferred limitations: no real calendar provider.
- Human PO review status: `Blocked` for interval interpretation, horizon, and
  query budget.
- Affected workstreams: availability computation and any public interval
  contract. Boundary analysis, egress allowlisting, and boolean-output checks
  can be prepared.

## PRQ-005 — Who may grant or revoke a skill permission

- Module: Skills and Policy, Issue #8.
- Decision: which actor may create or revoke a skill permission on this node?
- Recommendation: only the human owner, through a trusted local control path.
  Remote messages, relationships, advertisements, and discovery references
  cannot grant permission.
- Reason: matches the accepted local-owner mutation rule for relationships and
  the binding separation of relationship and permission. Least authority.
- Alternatives: remote counterparty grant; permission implied by an active
  relationship; permission implied by advertising the skill.
- Security and privacy impact: implied permission would turn relationship or
  advertisement into execution authority. That would violate accepted
  principles.
- Reversibility: the recommendation is the fail-closed default. A broader grant
  authority would be a new trust boundary and would be expensive to unwind
  after callers depend on it.
- Implementation status: permission mutation stays blocked. A pure evaluator
  that consumes an already-supplied permission snapshot does not decide this
  question and may proceed only when its other inputs stay inside delegated
  authority.
- Tests and evidence: none yet.
- Residual risks: a convenient test fake could become a permit-all composition
  root. Implementation must not ship that root.
- Deferred limitations: no remote permission protocol.
- Human PO review status: `Blocked` for permission-grant authority. Reserved
  because it decides who may authorize.
- Affected workstreams: permission create and revoke commands. Evaluation of an
  injected snapshot, Skills preparation, and Relationships implementation
  continue.

## PRQ-006 — ASK approval interaction

- Module: Approval Lifecycle, Issue #11.
- Decision: what channel is used, what the owner sees, when a request expires,
  whether the owner is notified or polls, and how rejection and duplicates
  behave?
- Recommendation: local owner action on the exact bound request, a short
  expiry, no protected result before approval, and no extra private context in
  the prompt. Notification transport stays out of the core slice.
- Reason: smallest consent surface and least disclosure.
- Alternatives: remote notification with context snippets; long-lived
  approvals; implied approval.
- Security and privacy impact: the owner prompt can leak private request
  contents. Implied approval would cross the consent boundary.
- Reversibility: channel choice becomes expensive after an external client
  depends on it.
- Implementation status: approval implementation is blocked. Concurrency and
  revocation analysis may continue.
- Tests and evidence: none yet.
- Residual risks: analysis could be mistaken for an approved channel.
- Deferred limitations: no notification platform.
- Human PO review status: `Blocked` for the approval channel and owner-facing
  disclosure.
- Affected workstreams: approval UX and release path. Policy `ASK` as a
  decision enum can be represented without storing approvals.

## PRQ-007 — In-flight revocation

- Module: Approval Lifecycle and any later disclosure path. AC-REV-001 remains
  `TBD-PO` for this boundary.
- Decision: after revoke, what happens to in-flight work and to a result that
  was computed but not delivered?
- Recommendation: invalidate pending approvals and undelivered results. Do not
  attempt to retract a result that was already delivered.
- Reason: this is the existing MVP-scope recommendation. It fails closed before
  disclosure and avoids a new remote-delete protocol.
- Alternatives: let in-flight work finish; attempt to retract delivered
  results.
- Security and privacy impact: finishing in-flight work can disclose after
  revoke. Retraction implies a new cross-node authority.
- Reversibility: moderate. Callers can observe whether a late result arrives.
- Implementation status: blocked for release-path behavior. Relationships
  explicitly does not decide it. Relationships only guarantees the next local
  read.
- Tests and evidence: Relationships tests must not claim in-flight behavior.
- Residual risks: a later module could cache an `active` read across revoke.
- Deferred limitations: no delivered-result retraction.
- Human PO review status: `Blocked` for in-flight and undelivered-result
  behavior.
- Affected workstreams: approval release and final disclosure after revoke.
  Relationship revoke-and-read continues.

## PRQ-008 — Audit access, export, retention, and deletion

- Module: Audit, Issue #12.
- Decision: who may inspect or export audit records, how long they are kept,
  how deletion works, and confirmation that derived results stay omitted.
- Recommendation: local authorized operator only, short retention, deletion that
  cannot recreate raw context, and no derived availability result in the event.
- Reason: smallest access set and the accepted minimization rule.
- Alternatives: remote audit query; long retention; storing the boolean result
  for debugging.
- Security and privacy impact: audit can become a second copy of private data.
  Derived results are excluded by default in PRV-004.
- Reversibility: retention and export become expensive after data is stored.
- Implementation status: blocked for access-control, export, retention, and
  deletion behavior. Minimized event vocabulary preparation may continue.
- Tests and evidence: Discovery's minimized event is not Audit acceptance.
- Residual risks: process-local test sinks could be described as audit.
- Deferred limitations: no analytics product.
- Human PO review status: `Blocked` for inspect, export, retention, and
  deletion authority.
- Affected workstreams: audit storage and operator query. Redaction rules can
  be prepared.

## PRQ-009 — Two-node demonstration surface

- Module: Two-Node MVP Demonstration, Issue #13.
- Decision: is the demonstration surface an API, a CLI, or a minimal UI, and
  must acceptance use two processes?
- Recommendation: two separate processes and a thin local CLI or API. No
  product UI in the core demonstration.
- Reason: smallest surface that still proves independently controlled nodes.
- Alternatives: a minimal UI; one process pretending to be two nodes.
- Security and privacy impact: a UI can hide which node authorized the result.
  A single process can blur the trust boundary.
- Reversibility: inexpensive before demonstration clients exist.
- Implementation status: blocked for the surface and for end-to-end
  implementation. Integration planning may continue. PO-REL-6 still requires
  verified PostgreSQL revocation before Relationships state is used as
  restart-safe authority in this demonstration.
- Tests and evidence: none yet.
- Residual risks: an in-memory two-node rehearsal could be reported as durable
  acceptance evidence.
- Deferred limitations: no production deployment and no external AI.
- Human PO review status: `Blocked` for the demonstration surface.
- Affected workstreams: demo implementation. Dependency and QE planning
  continue.

## PRQ-010 — Which directed relationship policy reads

- Module: Skills and Policy, Issue #8. Uses the directed record approved in
  PRQ-002.
- Decision: which ordered pair must be active before a local policy decision
  can be `ALLOW` or `ASK`?
- Recommendation: on the receiving node, require a fresh `true` for requester
  to local target. The reverse pair is neither necessary nor sufficient.
- Reason: matches directed records and receiver-local authority. Inferring the
  reverse would reopen PO-REL-2.
- Alternatives: reverse only; either direction; both directions; an undirected
  edge.
- Security and privacy impact: the wrong pair denies honest requests or treats
  a different owner action as consent to be queried.
- Reversibility: moderate. It is local. Seeds and tests will encode it. No wire
  field has to publish it.
- Implementation status: blocked as approved product behavior. A pure evaluator
  may take a boolean input without choosing the pair. Naming the candidate pair
  in preparation is allowed. Hard-coding it as an accepted product rule is not.
- Tests and evidence: Skills preparation decision SP-R6.
- Residual risks: a service could cache `true` or treat the reverse pair as
  consent.
- Deferred limitations: no cross-node relationship protocol.
- Human PO review status: `Blocked` for treating one pair as the approved
  authorization input.
- Affected workstreams: the policy service's choice of `readActive` arguments.
  Relationships implementation and a boolean-input evaluator continue.

## PRQ-011 — Skills deny-by-default details

- Module: Skills and Policy, Issue #8.
- Decision: how the evaluator treats an unadvertised skill, ambiguous matches,
  context and approval side effects, public denial detail, permission record
  fields, and whether the local skill version is a public protocol.
- Recommendation chosen: deny when the skill is not advertised; deny on zero or
  conflicting matches; do not compute availability or store an approval in the
  kernel; do not publish a denial reason; store only agent ids, skill version,
  purpose, scope, effect, and policy version; keep the version token local.
- Reason: these are the privacy-preserving, least authoritative, smallest, and
  most reversible readings of FR-003, SEC-005, and SEC-018. They are SP-A1
  through SP-A6 in the Skills specification.
- Alternatives rejected: permission without advertisement; first-match wins;
  ambiguity becomes `ASK`; the kernel reads context; distinct public denial
  errors; storing email on the permission; publishing a skill URL now.
- Security and privacy impact: the rejected alternatives would widen authority
  or disclosure. The chosen options fail closed.
- Reversibility: high before a public schema exists. Widening later is possible.
  Narrowing later is harder if a wider rule ships first, so the narrow rule is
  the one being prepared.
- Implementation status: the provisional evaluator is in PR #47. It encodes the
  deny-by-default mapping. It does not grant permission, choose interval
  meaning, or choose which requests are seeded `ASK` versus `ALLOW`. Not
  Engineering Accepted.
- Tests and evidence: `tests/unit/modules/policy/evaluate-policy.test.ts`. Local
  verification passed. Independent Security and QE review is still required.
- Residual risks: a later service could treat these autonomous choices as Human
  Product Owner ratification. They are not.
- Deferred limitations: purpose source, permission-grant authority, interval
  rules, approval interaction, in-flight revocation, safe metadata, and the
  directed pair remain PRQ-003 through PRQ-010.
- Human PO review status: `PO review pending`.

## How to update this queue

Add a new `PRQ-` item. Do not renumber old items. When the Human Product Owner
ratifies or changes an item, record the date and the new status in place.
Leave the previous recommendation visible. Update the linked GitHub Issue in
the same change.
