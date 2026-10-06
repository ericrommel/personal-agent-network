# Relationships Architecture

## Status

Preparation proposal for Issue #7 and subtask #20. These ports are proposals. They are not
an approved public contract, and they do not authorize implementation.

The Software Architect preparation run timed out before it wrote this file. The Engineering
Coordinator wrote it from Issue #20, ADR-0001, ADR-0003, ADR-0004, ADR-0005, and the Backend
Engineer's decomposition. It does not open a new product choice.

## Responsibilities

Relationships owns directed local records and the current boolean read used by a later policy
module. It does not own identity lifecycle, discoverability, skill contracts, permission
grants, authorization decisions, messaging, approval, or audit storage.

The module lives in-process inside the owner's PAN node, consistent with ADR-0001. Only a
trusted local control adapter may call create and revoke. Remote ingress must not receive a
relationship port.

## Domain model

Proposed types, after authorization:

- `RelationshipId`: `pan_relationship_` plus a UUID v4, branded like the existing identity
  ids. No parser accepts an arbitrary object as an id.
- `RelationshipStatus`: `active` | `revoked`.
- `Relationship`: id, source Agent Identity id, target Agent Identity id, and status.
  Source and target differ. There is no label, email, or Discovery reference field.
- `TrustedRelationshipSource`: a nominal `{ kind, key }` value with no public constructor
  and no parser from JSON, following `TrustedDiscoverySource`.

Invariants:

- At most one current row per ordered pair. `A -> B` and `B -> A` are different keys.
- The same row never returns from `revoked` to `active`. A later trusted create allocates a
  new id and replaces that pair's stored row.
- A `revoked` row is never read as active.
- Commands are exact records. Inherited prototype fields and extra own properties fail
  closed.
- The module does not mint Agent Identity ids or authenticated principals.

## State model

Baseline transitions:

```text
(none) -> active -> revoked
revoked pair --new trusted local create--> active (new id)
```

`pending` is absent. Adding invitation later means a new state and a new Product Owner
decision, not a silent extension of this port. PO-REL-1 through PO-REL-6 in the module
specification remain the open product choices. This architecture implements only the
recommended side of each one, and only after authorization.

## Proposed ports

Names match the Backend decomposition. They are in-process proposals. No HTTP route is
proposed.

- `RelationshipService.create`, trusted local only. Inputs are a branded source and the two
  Agent Identity ids. It rejects identical ids, ineligible agents, untrusted callers,
  remote-shaped payloads, and a second active pair. A create whose minimized event throws
  rolls back and leaves no active row.
- `RelationshipService.revoke`, trusted local only. It rejects a missing pair and does not
  create a row. If the revoke write completes, the row stays `revoked` even when the
  non-durable observer throws.
- `RelationshipService.readActive`, local only. Returns boolean `true` only for the matching
  active direction when both agents are currently eligible. Every other outcome is `false`.
  It has no list operation and returns no identifiers.
- `RelationshipPartyPort.findAgent`, satisfied later by a composition root over the accepted
  Identity module. Relationships does not reimplement identity and must not ship a
  permit-all adapter.
- `RelationshipStorePort`, with synchronous check-and-write. The in-memory adapter must not
  await between the uniqueness check and the map update.
- Clock is not required for the boolean read. Timestamps are omitted from the first slice so
  the record stays minimal. A later durable adapter may add them without putting them on the
  authorization read.

Rejected operations:

- create or revoke from a message body, model output, or Discovery reference;
- enumerate relationships to any remote caller;
- return email, profile, endpoint, label, or relationship id from `readActive`;
- write skill, permission, discovery-grant, or approval rows;
- cascade-delete relationships when an agent is disabled.

Dependency direction:

```text
Identity  <--- Relationships ---> (later) Authorization / Policy
Discovery has no edge to Relationships
Messaging, Approval, Audit, and External AI must not write relationship state
```

A later policy module may depend on `readActive`. Relationships must not depend on policy,
messaging, or audit storage. The minimized event is a value the store records in the same
turn as a mutation. Durable audit remains Issue #12.

## Persistence

ADR-0004 selects PostgreSQL for the first approved persistent state and says in-memory state
is not MVP acceptance evidence. It also says not to add a database dependency before it is
used.

Preparation recommendation, matching PO-REL-6:

- The store port is storage-agnostic.
- The first authorized implementation ships an in-memory adapter inside the module and
  documents restart loss.
- PostgreSQL, migrations, and a driver decision wait until an approved module introduces
  persistent state. That must happen before Issue #13 acceptance evidence.
- This preparation adds no dependency.

## Contract version

Local command and event constants, when implementation is authorized, are
`pan.relationship-command/v1` and `pan.relationship-event/v1`. They are not a remote wire
contract. A breaking change requires a new version and AC-DEV-003 review. DEV-004 applies
when the contract is actually introduced.

The minimized event fields are contract, correlation id, source key, command (`create` or
`revoke`), outcome (`accepted` or `rejected`), and control (`none`, `validation`,
`conflict`, or `dependency`). Party ids and relationship ids stay in the store, not on the
event.

## ADR assessment

No new ADR is justified.

- ADR-0001 already fixes the node boundary and in-process ports.
- ADR-0003 already forbids collapsing relationship into skill, policy, or messaging, and
  already forbids remote text from granting authority.
- ADR-0004 already selects PostgreSQL for the first persistent state and permits in-memory
  state only outside MVP acceptance evidence.
- ADR-0005 stays Discovery-specific. Relationships must not extend it.

A future ADR would be justified only if the Product Owner selects a cross-node relationship
protocol or an invitation flow. That choice is PO-REL-1 and PO-REL-3. The recommendation is
not to take it.

## Requirements affected

FR-003, FR-005, FR-009, SEC-004, SEC-009, REL-001, REL-003, REL-004, AC-DOM-001, and
AC-REV-001. This assessment does not implement them.
