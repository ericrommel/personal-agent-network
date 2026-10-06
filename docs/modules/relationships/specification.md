# Relationships Specification

## Status and objective

This document prepares the Relationships module for Human Product Owner review on Issue #7.
It is not implementation authorization. Functional code waits for an explicit Ready for
Development approval.

The Product Analyst preparation run for Issue #21 timed out before it wrote a file. The
Engineering Coordinator wrote this specification from Issue #21, the accepted requirements,
and the specialist notes that did arrive. It is not a second product.

Objective: represent explicit relationship state between two Agent Identities so later policy
evaluation can tell those records apart from discovery, skill advertisement, and permission.
A relationship MUST NOT imply discovery permission, skill permission, context access, or
execution authority.

Issue #7 also names humans. The human owner is the authority for local create and revoke.
The relationship record itself binds Agent Identities, because Human Identity and Agent
Identity stay distinct under FR-001.

## Scope

### In scope

- A directed, local relationship from one Agent Identity to another.
- Pre-seeded creation through a trusted local control path.
- States `active` and `revoked`, and the transitions between them.
- Immediate local effect of revocation on later reads in the same process.
- A minimized local change result that a later Audit module can consume.
- Separation from Discovery grants, Discovery references, skills, permissions, and
  authorization decisions.

### Non-goals

- A full social graph, contact manager, or group relationship.
- Invitation, acceptance, or any owner-facing relationship UX, unless the Product Owner
  later approves that scope.
- Cross-node replication or a remote create/revoke command.
- Skill policy, messaging, approval, context access, and durable audit storage.
- Using a Discovery reference as proof that a relationship exists or may be created.
- Changing accepted Discovery or Identity behavior.

## Working lifecycle

These semantics are the preparation baseline. Product Owner decisions below can replace
them. They are not approved behavior.

### Record

A relationship is a local record with:

- a relationship id of the form `pan_relationship_<uuidv4>`;
- `sourceAgentId` and `targetAgentId`, both Agent Identity ids;
- status `active` or `revoked`;
- the node-local time of creation and of revocation, when revoked.

The ordered pair is the product identity of the relationship. At most one `active` record
may exist for a pair. A reciprocal relationship is a second record with the agents swapped.
The two records do not update each other.

Creation requires a trusted local actor, two distinct Agent Identities that are eligible
under the accepted Identity rule, and no existing `active` record for that ordered pair.
Creation does not accept a Discovery reference, an email address, a remote payload, or a
claim that the other node already consented.

### States and transitions

```text
(no record) --trusted local create--> active --trusted local revoke--> revoked
```

- `active` is the only status later authorization may treat as a current relationship.
- `revoked` is not active. The same row never returns to `active`. A repeated revoke of that
  same id is recognized and does not create a new active row.
- A later trusted local create for the same ordered pair allocates a new id and replaces the
  stored row. That is a new explicit seed, not reactivation of the revoked id.
- There is no `pending`, `invited`, or `blocked` state in this baseline.
- Revoke of a missing pair changes nothing and does not create a record.
- Disabling an Agent Identity does not delete relationship rows. A read used by later
  authorization MUST report the relationship as not currently usable when either agent is
  ineligible. The stored status stays `active` until an explicit revoke.

### Revocation

The human owner of this node revokes through the trusted local control path. A remote
message cannot revoke a record on this node. Revocation applies to the one directed record.
It does not revoke the opposite record if one exists.

After a successful revoke, every later read on that node MUST treat the record as not
active. This module does not decide in-flight approval or computed-but-undelivered results.
Those remain AC-REV-001 product decisions for Approval and Authorization. This module's
promise is limited to subsequent local reads.

If the revoke write itself does not complete, the previous status remains and the command
does not report success. Create rolls back when its minimized event cannot be recorded, so
a failed create leaves no active row. After a revoke write has stored `revoked`, a throw
from the non-durable observer does not restore `active`. The command still reports revoked,
and a retry is idempotent. This slice has no durable audit log to lose. The authorization
read is a boolean. It is true only for the matching active direction when both agents are
still eligible. It does not return a human identifier, a relationship id, or an event.

### What a relationship does not authorize

An active relationship does not:

- make either agent discoverable;
- reveal a human identifier, profile, endpoint, or Discovery reference;
- advertise a skill or create a permission;
- allow context access or tool execution;
- approve a request;
- authenticate a caller.

AC-DOM-001 remains the acceptance criterion. This module can prove that its commands do
not write skill, permission, discovery, or identity records. The invocation half of
AC-DOM-001, where a missing permission denies availability, belongs to Skills and Policy.

## Distinction from neighboring concepts

| Concept | What it is | What it is not |
|---|---|---|
| Relationship | Directed local state between two Agent Identities | Permission, skill support, or discoverability |
| Discovery grant | Caller-specific permission to resolve one email to an opaque reference | A relationship or a bearer capability |
| Discovery reference | Opaque, caller-scoped result of an active Discovery grant | An agent id, a relationship key, or authority |
| Skill advertisement | A statement that an agent offers a versioned skill contract | Authorization to invoke it |
| Permission | A separate grant binding parties, skill, purpose, and scope | Implied by a relationship or an advertisement |
| Authorization | A fresh ALLOW, ASK, or DENY decision from current policy | A stored relationship status |

FR-003 requires these records to change independently. FR-005 requires later requests to be
evaluated against the current relationship, not against a stale copy and not against
Discovery state.

## Traceability

| Proposal in this specification | Existing ids | Acceptance note |
|---|---|---|
| Independent relationship record | FR-003, AC-DOM-001 | Module proves it does not write skill or permission state. Invocation denial stays with Skills and Policy. |
| Current relationship is an input to later policy | FR-005 | Consumed by Skills and Policy. This module exposes a current-read port only. |
| Owner can revoke; later reads do not treat it as active | FR-009, SEC-009, REL-004, AC-REV-001 | In-flight and pending-approval behavior stays TBD-PO on AC-REV-001. |
| Failed commands leave prior state unchanged | REL-001, REL-003 | Restart durability is the Product Owner decision below, not a silent durability claim. |
| Remote input cannot mutate relationships | SEC-004 | Covered by the trusted-local-actor rule. |
| No public relationship directory | PRV-001, SEC-012 | Discovery's prohibition on relationship disclosure stays in force. |

No new requirement id is minted here. If the Product Owner accepts the baseline, engineering
updates the FR-003 and AC-REV-001 wording in the product documents to cite this local
directed behavior. That edit is part of the readiness integration, not a grant of
implementation approval.

## Product Owner decisions

Implementation of Relationships stays stopped until the Product Owner authorizes the module.
The decisions below are the ones that change relationship semantics. Storage drivers,
identifier grammar, and in-process port shapes are engineering choices inside the selected
semantics.

### PO-REL-1. How an MVP relationship is formed

- Decision statement: Are MVP relationships pre-seeded by trusted local configuration, or
  does this module include an invitation and acceptance flow?
- Recommended option: Pre-seeded local records only. No invitation state and no acceptance
  UX.
- Alternatives considered: A bilateral invitation flow. A hybrid that keeps seeding as a
  test shortcut and adds invitation for the demo.
- Product/security implications: Pre-seeding matches Issue #7's non-goal and the MVP scope
  recommendation. It avoids a new consent surface and a cross-node protocol. The two-node
  demo must configure both nodes. An invitation flow would expand scope and needs its own
  privacy review.
- Blocked implementation: Pending or invited states, invitation commands, and any
  owner-facing acceptance interaction.

### PO-REL-2. Direction and reciprocity

- Decision statement: Is a relationship one mutual fact, or a directed record that does not
  imply the opposite direction?
- Recommended option: Directed. At most one active record per ordered pair. Reciprocity is
  a second explicit record. Revoking one does not revoke the other.
- Alternatives considered: One undirected edge. One mutual record that disappears when
  either side revokes.
- Product/security implications: Directed records keep one owner's revoke from silently
  rewriting the other direction. They also match receiver-local authorization. A mutual
  record would hide one-way withdrawal.
- Blocked implementation: The uniqueness key and whether one revoke command affects both
  directions.

### PO-REL-3. Where the authoritative record lives

- Decision statement: Does each node store and enforce only its own relationship records,
  with no cross-node relationship protocol in this module?
- Recommended option: Yes. The receiving node uses its own current records. A remote
  message, Discovery reference, or other node's assertion cannot create or revoke a record
  here.
- Alternatives considered: A replicated shared relationship. Sender-asserted relationship
  state carried in a later message.
- Product/security implications: Local authority prevents a remote caller from granting
  itself a relationship. Both nodes must be seeded for a two-node allow path. Messaging
  must not grow a hidden relationship API.
- Blocked implementation: Any network endpoint or inbox handler that mutates relationships.

### PO-REL-4. Who may create or revoke

- Decision statement: Which actor may create or revoke a relationship record on this node?
- Recommended option: Only the human owner of this node, through a trusted local control
  path. Remote parties have no mutate authority. The owner may revoke any directed record
  stored on this node.
- Alternatives considered: Only the target agent may revoke. Either remote party may
  revoke. Create and revoke require a signature from both owners.
- Product/security implications: Local owner control matches the node trust boundary in
  ADR-0001. The counterparty's node keeps its own record until that owner revokes it.
  There is no remote "take back access on their node" operation in this module.
- Blocked implementation: The authorization rule on create and revoke commands.

### PO-REL-5. What a local read may disclose

- Decision statement: May relationship reads return a human-facing identifier, and who may
  read relationship state?
- Recommended option: Reads used for later authorization are local booleans. The stored
  record contains Agent Identity ids and status only. It has no label, email, profile,
  endpoint, or Discovery reference. There is no remote or public query. Trusted local create
  and revoke may return the relationship id to that local caller.
- Alternatives considered: Store an owner-supplied label or the canonical email. Let the
  counterparty query this node's relationship remotely. Return the full record on every read.
- Product/security implications: Email storage would copy Discovery identifiers into a
  second store and enlarge leakage. Remote queries depend on Messaging and would reveal
  relationship existence off-node. Discovery remains prohibited from disclosing
  relationships.
- Blocked implementation: The read-contract field allowlist and any remote relationship
  query.

### PO-REL-6. Restart survival

- Decision statement: Must a revoke still be in effect after this node's process restarts,
  as part of this module's acceptance?
- Recommended option: Define the port so a durable adapter can satisfy it later. For this
  module's first authorized implementation, use a process-local in-memory adapter and state
  the restart limitation in the same way Discovery stated its process-local budgets.
  Durable PostgreSQL, already selected by ADR-0004, is required before Two-Node MVP
  acceptance evidence and is not added during preparation.
- Alternatives considered: Add PostgreSQL in the first Relationships implementation.
  Accept in-memory state through final MVP acceptance.
- Product/security implications: An in-memory revoke disappears on restart, so a later
  process could again see the relationship as active. That is acceptable only as a bounded
  module limitation, not as final MVP evidence. Adding PostgreSQL now pulls driver,
  migration, and CI work into this module before the Product Owner has approved
  implementation.
- Blocked implementation: Whether the first implementation pull request adds a database
  driver and migrations. The domain model and in-memory tests are not blocked once this
  recommendation is accepted. They remain blocked until the module itself is authorized.

## Dependencies

- Identity Model is accepted. Creation uses its eligibility rule and Agent Identity ids.
- Discovery is accepted. This module does not consume Discovery references and does not
  change Discovery.
- Skills and Policy, Messaging, Approval, Audit, and the two-node demonstration are later
  modules. They may read the current-relationship port after their own approvals. They do
  not constrain this contract beyond the separation in FR-003.

## Completion of this draft

This specification is the Issue #21 deliverable, written by the Engineering Coordinator
after the Product Analyst run timed out. It does not mark Issue #7 Ready for Development
and does not record Product Owner approval.
