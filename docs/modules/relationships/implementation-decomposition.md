# Relationships Implementation Decomposition

Status: Proposal only. Implementation is not authorized.
Date: 2026-10-06
Owner role: Backend Engineer
Parent: Issue #7. This note executes preparation Issue #22.
Baseline: Discovery is merged on main at `c15fc86b89296ee0d7725226e49e90f225c9c412`. This
branch, `docs/relationships-preparation`, is one documentation commit ahead of that baseline.

This document proposes how a future authorized Relationships slice would fit the current
TypeScript modular monolith. It does not approve product scope, privacy semantics, or
authorization semantics. The Human Product Owner has not authorized functional implementation.
Preparation creates none of the source or test paths listed below.

## Working recommendations used here

Issue #22 records these recommendations. They are not Product Owner approval.

- The first authorized slice stores state in process-local memory. It does not add PostgreSQL
  or any new runtime dependency.
- Only trusted local commands may create or revoke. A remote payload is not a command.
- The storage key is a directed pair. The only states are `active` and `revoked`. Reads fail
  closed.
- Identity and Discovery behavior do not change.

## Proposed future paths

Create these paths only after explicit Product Owner authorization to implement.

- `src/modules/relationships/index.ts`
- `src/modules/relationships/contracts.ts`
- `src/modules/relationships/ports.ts`
- `src/modules/relationships/relationship-service.ts`
- `src/modules/relationships/in-memory-relationship-store.ts`
- `src/modules/relationships/domain/relationship.ts`
- `tests/unit/modules/relationships/relationship.test.ts`

No other production path is required for that slice. Do not add files under
`src/modules/identity/`, `src/modules/discovery/`, `src/shared/`, `src/adapters/`, or `src/main.ts`.
Do not add a dependency, migration, CI change, or `.agent/plans/relationships.md`. The
coordinator owns the ExecPlan.

`vitest.config.ts` already includes `tests/**/*.test.ts`. The future test file is collected
without a path change. Raising the module coverage floor is an implementation task, not a
preparation change.

## Domain, port, service, and adapter split

Follow the Discovery module shape: domain rules, narrow ports, one application service, and
one in-memory adapter. Keep the work in-process. Do not add a broker, HTTP route, or network
entry point. ADR-0003 keeps Relationships separate from Identity, Discovery, Skills, and
Authorization. A relationship record must not carry skill, permission, discovery, context, or
execution fields.

### Domain

`domain/relationship.ts` owns the frozen record and pure rules.

- `RelationshipId` is a brand. Its text form is `pan_relationship_` plus a UUID v4 from
  `node:crypto` `randomUUID`. That matches Identity ids and Discovery grant ids and adds no
  package.
- `DirectedPair` is the ordered pair of two `AgentIdentityId` values. `A -> B` and `B -> A`
  are different keys. The key is derived from the two ids. It is not a second stored field
  that can drift from them.
- `RelationshipStatus` is only `active` or `revoked`.
- `Relationship` is `kind: "relationship"`, `id`, `fromAgentId`, `toAgentId`, and `status`.
- `isRelationship` uses the same structural checks as Discovery's grant guard: plain object,
  data properties only, exact keys, a valid relationship id, two parsed agent ids, and a
  known status.
- Pure `revokeRelationship` returns the same frozen record when it is already revoked.

Domain functions return `Result` from `src/shared/domain/result.ts`. They do not read a clock,
a port, or a store.

### Ports

`ports.ts` defines in-process ports. Store and party methods may return `unknown` or throw.
The service treats only an exact valid record, or an exact `true` where a boolean is
required, as success. Every other value fails closed.

- `RelationshipStorePort` exposes `insertActive`, `revokeMatching`, and `findByDirectedPair`.
  Each mutation checks and writes inside one synchronous turn. It must not `await` between
  the check and the write.
- `RelationshipPartyPort` exposes `findAgent`. It is a read port. This module does not add an
  Identity repository and does not change Identity behavior. Tests supply a fake. A future
  composition root must not ship a permit-all fake.
- `RelationshipEventSink` exposes synchronous `record(event): void`. The in-memory adapter
  calls it inside the same turn as the map write. It is not an audit store.
- `TrustedRelationshipSource` is a branded `{ kind, key }` value. Like `TrustedDiscoverySource`,
  it has no public parser and no constructor from unknown JSON.

Brands are compile-time only. There is no secret runtime token. The protection is the call
graph: remote ingress must not turn a payload into `create` or `revoke` arguments, and no
exported function may parse unknown JSON into a trusted command.

### Service

`relationship-service.ts` exposes `create`, `revoke`, and `readActive`.

- `create` and `revoke` accept a branded command and a branded source. They still recheck the
  prototype, exact keys, source key, correlation id, and endpoint ids.
- `create` resolves both endpoints through the party port. Each must come back as an active
  agent, pass `isAgentIdentityEligibleForPrincipal`, and match the commanded id. Otherwise
  the service does not call insert.
- The service awaits party lookup before the store call. The store call itself stays
  synchronous with respect to the map and the event sink, so another command cannot interleave
  inside the mutation.
- `readActive(from, to)` accepts unknown ids. It returns `true` only when the store yields one
  guard-valid `active` record, both ids match that record, and both parties are still
  eligible. Every other outcome, including a throw, returns `false`.

The service does not call Discovery, does not read discoverability grants, and does not accept
a `pan_agent_ref_*` value as an endpoint.

### In-memory adapter

`in-memory-relationship-store.ts` is the Relationships counterpart of `InMemoryDiscoveryBudget`:
one process-local `Map`, one event loop, no cross-process coordination, and empty after
restart. The map key is the directed pair.

The adapter revalidates on every read and write. A malformed entry is treated as absent.
`insertActive` refuses when the current entry is `active`. When the current entry is
`revoked`, it replaces that entry with a new id and `active` status in the same map write.
`revokeMatching` is idempotent when the same id is already `revoked`. An unknown pair or a
mismatched id changes nothing.

Create fuses the map write and the accepted event. If `record` throws, the adapter removes
the row it just inserted when that same id is still current, then returns failure. No active
grant remains. Revoke writes `revoked` first. If `record` then throws, the adapter keeps the
revoked row and still returns it. A failed observer must not restore `active`.

The first slice keeps this adapter in the module, as Discovery keeps its in-memory budget in
the module. Architecture still places a future durable adapter under `src/adapters/`. That
move waits for an authorized PostgreSQL slice.

### Contracts

`contracts.ts` holds version constants and the readonly command and event shapes. It does not
export an HTTP route, a schema library, or a function that trusts payload identity.

Suggested constants, as an engineering choice rather than a new wire standard:

- `pan.relationship-command/v1`
- `pan.relationship-event/v1`

A create command has `contract`, `action` (`create`), `correlationId`, `fromAgentId`, and
`toAgentId`. A revoke command adds `relationshipId` and uses `action` (`revoke`). The brand
marks the object as locally trusted. `action` is rechecked so a mismatched literal fails. It
is not a remote authorization string.

### Public exports

`index.ts` exports the service, the in-memory store, the domain guard, the pure revoke helper,
port types, and contract constants. It does not export a trusted-command parser. It does not
re-export Identity or Discovery.

## Fail-closed validation

Validation rejects the whole operation. It does not coerce, repair, or partially apply it.

- Endpoints must pass the existing `parseAgentIdentityId` rule: `pan_agent_` plus a lowercase
  UUID v4. Discovery references, human ids, bare UUIDs, and uppercase hex fail.
- The two endpoints must differ. A self-pair is an invalid command, not a third lifecycle
  state.
- Parsed agent ids are already canonical. This module does not trim, case-fold, or fuzzy-match
  them.
- Correlation ids and source keys use the Discovery bound
  `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. Empty and over-long values fail.
- Command objects must be non-null and non-array, and must use `Object.prototype` or a null
  prototype. They need data properties only, string keys only, and exactly the expected keys.
- Extra fields fail. Missing fields fail. Accessors fail. A getter that throws fails closed
  through `try/catch`.
- The guard accepts only `active` and `revoked`. Callers cannot set status by putting it on a
  command. Create always starts at `active`. Revoke always moves to `revoked`.
- A second create for a directed pair that is already `active` inserts nothing and does not
  refresh the existing id.
- Reads do not treat revoked, missing, malformed, ineligible, or store-failure states as
  active. Boolean `true` is the only active result.
- An unavailable party or store dependency fails closed. Create writes nothing. Read returns
  `false`. Revoke does not invent a record for an unknown pair.
- Identity snapshots and Discovery results are not commands. This slice adds no parser for
  `AuthenticatedAgentPrincipal` and no parser for relationship commands.

## Errors

Use coarse `Result` errors. Do not put endpoint ids, relationship ids, correlation ids, source
keys, or payload fragments on the error object. Do not throw domain failures. Catch unexpected
exceptions at the service boundary.

Proposed codes:

- `RELATIONSHIP_COMMAND_INVALID` for shape, source, correlation, self-pair, or endpoint
  failures.
- `RELATIONSHIP_CONFLICT` when an active directed pair already exists.
- `RELATIONSHIP_NOT_FOUND` when a trusted revoke names a pair or id the store does not hold.
- `RELATIONSHIP_PARTY_INELIGIBLE` when either endpoint is missing, disabled, or mismatched.
- `RELATIONSHIP_DEPENDENCY_FAILED` when the party or store port throws or returns an unusable
  value, and when a create event sink throws.

`readActive` does not return these codes. It returns `false`. Trusted local commands may see
the codes because their caller is the local boundary, not a remote agent. Do not copy the
codes into a future public response without a separate privacy decision.

Revoke of an already revoked matching record returns that revoked record. Repeating revoke
does not create a new id and does not make the pair active.

When revoke has already changed the row and the event sink then throws, the command still
returns the revoked record. The stored state and the success result agree. The missing signal
is local only, and a later retry is idempotent.

## Observability without durable audit storage

This slice must not create an audit table, an append-only file, an operator query API, or a
retention rule. Durable audit stays behind the Audit boundary. Discovery already defers that
storage; Relationships should do the same.

The minimized frozen event contains only:

- contract `pan.relationship-event/v1`;
- `correlationId`;
- `sourceKey`;
- `command`, either `create` or `revoke`;
- `outcome`, either `accepted` or `rejected`;
- `control`, one of `none`, `validation`, `conflict`, or `dependency`.

Do not put endpoint ids, relationship ids, discovery emails, skill names, policy decisions, or
remote bodies on the event. The relationship map is the only copy of the pair. Reads emit no
events. A read event would duplicate the graph outside the store and is not needed to prove
fail-closed reads.

Unit tests may pass a sink that pushes those fields into a process-local array. That array is
a test double. It is not an audit log, it has no retention claim, and it is not OBS-002
evidence. Production code in this slice must not open a durable sink.

No metric label may contain an agent id, a relationship id, or a source key. This slice
registers no metrics.

The synchronous sink is an intentional difference from Discovery's async event port. Discovery
can await inside a fused disclosure-commit port because the awaited work finishes before any
reference is returned. A relationship write is the authority change. Awaiting between the
check and the map update would let another command interleave. Fusing `record` into the
in-memory mutation avoids that without adding a transaction manager.

## Persistence recommendation

Use `InMemoryRelationshipStore` for the first authorized slice. One `Map` in that process is
the authority for that process. State the same limits Discovery states for its budget: restart
clears it, instances do not coordinate, and it is not durable protection.

Do not add a PostgreSQL driver, query library, Docker service, or migration in that slice.
`package.json` stays unchanged. ADR-0004 still applies when a later slice needs durable state:
PostgreSQL, one reviewed migration stream, and no second SQLite model. That later adapter
should live under `src/adapters/relationships/` and should implement the same store port. Until
it exists, evidence must not claim that revocation survives restart or spans processes.

Empty memory fails closed. After a restart, `readActive` is `false` until a new trusted local
create. That is lost availability, not a silent grant. Downstream policy must not cache an
`active` answer beyond the call.

## Ordered tasks for the ExecPlan

Copy this sequence only after the Human Product Owner authorizes implementation. If that
authorization is missing, do not start. Developer tests land with the code they prove.

1. Record the authorization reference on Issue #7 and in the ExecPlan. Restate the non-goals:
   no remote commands, no Identity or Discovery edits, no PostgreSQL, no durable audit store,
   and no skill or permission fields.
2. Add `domain/relationship.ts` with the branded id, directed-pair helper, frozen record,
   exact guard, and pure revoke. Test malformed prototypes, extra keys, bad UUID versions,
   self-pairs, discovery-reference endpoints, and idempotent pure revoke.
3. Add `contracts.ts` and `ports.ts` with branded source and command types and no payload
   parser. Test extra keys, wrong prototypes, bad correlation ids, and discovery references.
   Tests may cast a valid object to the brand, as Discovery tests do. They must not import a
   production parser, because none should exist.
4. Add `InMemoryRelationshipStore`. Test conflict on a second active create, replacement with
   a new id after revoke, id mismatch, unknown pair, a malformed entry reading as absent, and
   rollback of a create when the sink throws. Test that a sink throw after revoke leaves the
   row revoked.
5. Add `RelationshipService.create`. Test ineligible, missing, and disabled parties, a thrown
   party port, and a thrown sink. Each of those paths must leave the map unchanged.
6. Add `RelationshipService.revoke`. Test idempotent revoke, mismatched id, unknown pair, and
   a sink throw after a successful write. The last case must still return the revoked record.
7. Add `RelationshipService.readActive`. Test `true` only for the matching active direction.
   Test `false` for the reverse direction, revoked, missing, malformed, ineligible, and thrown
   store or party dependencies.
8. Export the supported surface from `index.ts`. In review, show that the new module imports
   only Identity's public API and shared `Result`, and that the Identity and Discovery trees
   have no implementation diff.
9. Set the Vitest coverage threshold for `src/modules/relationships/**` to 100 percent
   branches, functions, lines, and statements, matching Identity and Discovery. Run
   `npm run verify`. Do not lower an existing threshold.
10. Hand the slice to QE with this limit stated: process-local memory only, no durable audit,
    and no remote command surface. Do not mark Product Owner acceptance from these tasks.

## Feasibility risks

- Restart and a second process drop state. Fail-closed reads make that an availability limit,
  not an authorization bypass, only if no caller caches `active` outside the store. Later
  policy integration is not part of this slice.
- ADR-0004 says in-memory state is not MVP acceptance evidence for durable revocation. This
  slice can prove the domain rules and fail-closed reads. Claiming REL-001 across a restart
  would be false.
- Identity has no repository today. The party port must be injected. A root that treats every
  well-formed id as eligible would skip the check. Implementation must not register that root.
  Tests build parties with `createAgentIdentity` and a fake port.
- Party state is not in the same transaction as the relationship map. A party can change
  during the `await` before commit. `readActive` therefore rechecks eligibility. A disabled
  or missing party reads as not active even if an older row remains.
- A revoke can commit without a signal if the sink throws. That is accepted so a failed
  observer cannot restore authority. It is not durable audit loss, because this slice creates
  no durable audit. The Audit module owns any later reliable sink.
- The map keeps only the latest record for a directed pair. Earlier revoked ids disappear from
  memory. That is acceptable only because this map is not the audit trail. Visible history or
  retention would be a later product decision.
- Synchronous commit is not a distributed lock. An `await` added later between check and write
  reopens a double-create race. The store tests should fail if a mutation path awaits.
- Importing Discovery, or letting Discovery import Relationships, would couple boundaries that
  ADR-0003 separates. A Discovery reference must fail agent-id parsing.
- The global floors in `vitest.config.ts` can fail if new code lands without tests. The task
  order puts tests with each step and then raises the module floor to 100 percent.

## Non-blocking engineering choices

These choices do not change the recommended product, privacy, or authorization semantics. They
do not need a Product Owner decision.

- Keep the in-memory adapter in the module rather than under `src/adapters/`. A later
  PostgreSQL adapter can move under `src/adapters/relationships/` without changing port
  methods.
- Use `pan_relationship_`, UUID v4, `node:crypto`, and the existing `Result` type. Add no
  dependency.
- Join the two canonical agent ids with `>` for the map key. Those ids cannot contain `>`.
  Another separator is equivalent if tests stay exact.
- Use separate `create` and `revoke` methods. Recheck `action` locally. Do not accept one
  remote action enum as authority.
- Reject self-pairs during validation. No approved behavior depends on a self-relationship.
- After revoke, a new create for the same directed pair allocates a new relationship id and
  keeps the same pair key. Holders of the old id fail closed.
- Keep one current record per directed pair. Do not keep an in-memory history list.
- Reuse the Discovery correlation and source character bounds instead of inventing a new
  limit.
- Return coarse `Result` codes from trusted local commands, and a bare boolean from
  `readActive`.
- Omit endpoint ids and relationship ids from minimized events. The store already holds them.
- Use one unit file, `tests/unit/modules/relationships/relationship.test.ts`, as Discovery uses
  one unit file.
- Do not wire `src/main.ts` or `src/foundation.ts`. Tests construct the service directly.
- Do not add expiry, invitation, symmetric auto-create, groups, or skill fields. Those would
  change product scope and are outside this recommendation.

## Feasibility blockers

None. The in-memory directed-pair slice can be built with the current toolchain, `Result`,
`parseAgentIdentityId`, and the Discovery service, port, and adapter pattern. No Product Owner
decision is required for the file split, the fail-closed checks, the coarse error codes, the
non-durable event shape, or process-local storage for this first slice.

Durable cross-restart revocation, an invitation flow, symmetric relationships, and any public
disclosure of relationship state stay outside this proposal. They are not blockers for the
recommended slice, because the slice does not implement them.

## Authorization gate

Implementation is not authorized. Do not add the paths above, do not start the task sequence,
and do not treat this note as Product Owner approval. Preparation stops at this gate until the
Human Product Owner explicitly authorizes Relationships development on Issue #7.
