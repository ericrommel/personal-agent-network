# Skills and Policy Architecture

## Status

Preparation architecture for Issue #8. This document is not implementation authorization, not a public contract, and not Product Owner approval.

No source, test, adapter, or dependency is added by this preparation. Functional work waits for an explicit Human Product Owner move of Issue #8 to Ready for Development. Relationships PO-REL-1 through PO-REL-6 are already approved and are inputs here, not choices this module reopens: relationship records are directed and node-local, only trusted local mutation may change them, the policy-facing read is boolean `readActive`, the relationship store is process-local, and restart drops that state. A relationship is not permission. A Discovery reference is not authority.

ADR-0003 requires the decision itself to be a deterministic `ALLOW`, `ASK`, or `DENY`. This module evaluates that decision. It does not compute availability, open an approval channel, or define timezone or horizon semantics. Those remain reserved for Issues #10 and #11.

## Module boundary

Skills and Policy is one in-process module inside the owner's PAN node, as ADR-0001 requires. It is not a separate service, a shared cross-node policy authority, or a rule engine.

The module owns two local record kinds and the pure evaluation that reads them. It does not own Human or Agent identity lifecycle, Discovery, relationship mutation, messaging, context computation, approval persistence, audit storage, or external AI. ADR-0003 forbids collapsing those into one agent object or into this module.

```text
authenticated principal and exact local inputs
  -> policy evaluator
       -> relationship read port (boolean only)
       -> skill advertisement lookup
       -> permission lookup
       -> ALLOW, ASK, or DENY
```

Evaluation does not continue into context or approval:

```text
ALLOW or ASK  --in-process decision value-->  later Approval (Issue #11)
                                              and Context (Issue #10)
DENY          --reason stays local-->         later ingress maps one generic refusal

this module does not call those modules and has no port to them
```

The receiving node evaluates only its own advertisements and permission snapshots. Another node's assertion, a message body, model output, or a Discovery reference cannot create or replace those records.

A returned decision is evidence about the current call. It is not a bearer capability, not a signature, and not something a later module may serialize onto the wire or cache as a grant. Context access, when it exists, must call this evaluator again immediately before use. That recheck is still this module's predicate. It is not a context read.

## Component responsibilities

Three components share one module and do not share one record type.

| Component | Owns | Does not own |
|---|---|---|
| Skill advertisement | Versioned local statement that this agent's `availability` contract is offered, and trusted local create/revoke of that statement | Permission, relationship, policy outcome, interval meaning, boolean result |
| Permission snapshot | Separate local grant binding requester, target, skill contract, purpose, disclosure scope, effect, and policy version | Skill advertisement, relationship rows, approval rows, context |
| Policy evaluator | Deterministic `ALLOW` / `ASK` / `DENY` from those current inputs plus `readActive` | Writes of any kind, approval insert, context query, public HTTP shape |

The evaluator is side-effect free. `ASK` does not create a pending approval. `ALLOW` does not mean the availability boolean was derived. `DENY` does not explain itself to a remote caller.

Trusted local commands and evaluation are different entry points. Remote ingress must not receive the command entry points. A later messaging adapter that copies remote fields into a command is a confused deputy and is outside this design.

## Proposed records

Records are plain local values. Neither record contains a relationship id, a Discovery reference, an email, a human id, a label, an endpoint, a context handle, an approval id, an expiry, a timestamp, or a free-text description. Commands are exact objects: inherited prototype fields and extra own properties fail closed and write nothing.

### Skill advertisement

FR-003 requires advertised skill state to change independently of relationship state and of skill permission. FR-004 names the only MVP skill this record may advertise: versioned `availability`, conceptually a bounded interval in and a boolean out. This record does not define the interval.

Architect recommendation, not Product Owner approval. One current advertisement has only:

| Field | Role |
|---|---|
| `contract` | Provisional envelope `pan.skill-advertisement/v1` |
| `id` | `pan_skill_ad_` plus a UUID v4 |
| `agentId` | Agent Identity id of the agent offering the skill |
| `skill` | Exact `availability` |
| `skillContract` | Exact `pan.skill.availability/v1` |
| `status` | `active` or `revoked` |

The envelope version and `skillContract` are different identifiers. A row whose envelope, skill name, and skill contract disagree is not a current advertisement.

At most one current row exists for an agent id plus `skillContract`. The same row never returns from `revoked` to `active`. A later trusted create allocates a new id. There is no `pending` advertisement status.

The advertisement does not store an input schema, an output schema, or a policy effect. Its contract constant means only what FR-004 already requires, with interval interpretation left to Issue #10. Advertising the skill does not authorize invocation.

### Permission snapshot

FR-003 requires this record to be independent of the advertisement and of the relationship. FR-005 requires evaluation against requester, target, skill, purpose/scope, and policy. FR-012 later binds requester, target, skill, purpose, input, disclosure scope, policy version, request id, and expiry. This snapshot stores only the standing decision inputs from that list. It does not store input, request id, or expiry, and it does not interpret them.

Architect recommendation, not Product Owner approval. One current snapshot has only:

| Field | Role |
|---|---|
| `contract` | Provisional envelope `pan.permission-snapshot/v1` |
| `id` | `pan_permission_` plus a UUID v4 |
| `requesterAgentId` | Agent Identity id the grant names as requester |
| `targetAgentId` | Agent Identity id whose local skill is the subject |
| `skillContract` | Exact `pan.skill.availability/v1` |
| `purpose` | Exact token copied from trusted local seed |
| `disclosureScope` | Exact token. The only recommended value is `availability_boolean` |
| `policyVersion` | Opaque version minted with the snapshot, never taken from a request |
| `effect` | `allow` or `ask` |
| `status` | `active` or `revoked` |

The match key is the tuple `(requesterAgentId, targetAgentId, skillContract, purpose, disclosureScope)`. It is not a second stored field. At most one current row exists per tuple. Revoke leaves the row unusable. A later trusted create for that tuple allocates a new id and a new `policyVersion`. The old version is not reactivated.

`effect` is not a policy language. It is the owner's pre-seeded choice between the two non-deny outcomes the MVP already requires. A stored `deny` effect is not used. No match is `DENY`.

The snapshot is not interval-scoped. A time window on the permission would require the horizon and timezone rules reserved for Issues #10 and #11. Context scope and action scope are not additional fields. The only action this permission can support is the one availability contract, and the only disclosure it can support is the boolean scope above. It does not authorize raw context.

Requester and target are distinct. A self-pair is rejected at create and matches nothing at evaluation.

Seeding a permission does not create an advertisement, a relationship, or an approval. Seeding an advertisement does not create a permission. An inconsistent pair is allowed to exist and evaluates to `DENY` until both are current. That is the FR-003 and AC-DOM-001 split.

### What is not a record here

The evaluator result is an ephemeral in-process value, not a third stored record. Relationship state stays in Relationships. Discovery grants stay in Discovery. Approval bindings stay in Approval. The FR-012 fields this module only consumes are listed under evaluation.

## Ports

All four ports are in-process. None is an HTTP route. Names are provisional.

### `RelationshipReadPort`

Contract dependency on the approved Relationships read. This module does not implement it and does not require the Relationships module to be Done.

```text
readActive(fromAgentId, toAgentId) -> unknown
```

Architect recommendation: the evaluator calls `readActive(requesterAgentId, targetAgentId)` and continues only on exact boolean `true`. It does not read the opposite direction and does not treat two directions as one mutual fact. PO-REL-2 remains directed. A later Product Owner choice can reverse that one call. It cannot be reversed by the requester.

Only exact `true` is the relationship input. Exact `false` is an unmatched input. Any other value, throw, or rejection is an unavailable dependency. The port returns no relationship id and no graph.

### `SkillAdvertisementLookupPort`

Owned by this module.

```text
findCurrent(agentId, skillContract) -> unknown
```

`null` means no current advertisement. One guard-valid `active` row is usable. Anything else is unavailable or ambiguous, as the fail-closed rules define. The lookup cannot create a row.

### `PermissionLookupPort`

Owned by this module.

```text
findCurrent(match tuple) -> unknown
```

`null` means no current snapshot. One guard-valid `active` row whose stored fields equal the tuple is usable. The lookup cannot create a row and cannot return a decision by itself.

### `PolicyEvaluatorPort`

Owned by this module. It may depend only on the three ports above and on pure guards. It has no store handle, no command handle, no context port, and no approval port.

```text
evaluate(exact local input) -> branded decision
```

There is intentionally no parser from JSON, a message body, or model output to the evaluation input or to either trusted command.

Trusted local command ports may exist beside these four so create and revoke are possible without putting mutation on the evaluator. They accept a `TrustedPolicySource` with the same rule as `TrustedDiscoverySource` and `TrustedRelationshipSource`: a nominal `{ kind, key }` value, no public constructor, and no parser from unknown JSON. Remote ingress must not be able to obtain that value.

## Evaluation

The evaluator is a fixed predicate. The same current port answers and the same exact input always produce the same outcome. It uses no clock, no randomness, and no model.

Architect recommendation for the exact input keys:

| Key | Source | Rule |
|---|---|---|
| `principal` | Already branded `AuthenticatedAgentPrincipal` | Requester is `principal.agentId`. This module does not construct or parse a principal. Payload identity is ignored because it is not an input key. |
| `targetAgentId` | Trusted local binding | The node agent being asked. Not taken from the message. |
| `skillContract` | Local input | Must be exact `pan.skill.availability/v1`. |
| `purpose` | Local input | Exact match to the snapshot token. Not defaulted from the skill name. |
| `disclosureScope` | Local input | Exact match. Recommended sole token: `availability_boolean`. |
| `input` | Local input | Opaque bounded string echoed for a later FR-012 binding. Not parsed as an interval. |
| `requestId` | Local input | Echoed for a later FR-012 binding. Not deduplicated here. |

Expiry is not an input. If a caller adds expiry, effect, policy version, relationship, permission, or any other key, the input is rejected and nothing is written. Issue #11 owns expiry. Issue #10 owns what the opaque `input` string will later mean. Until then, tests may pass a synthetic string. That string is not a calendar encoding and does not approve one.

MVP-scope item 3, whether purpose is fixed to `availability_check` or supplied by an owner or requester, stays open. The predicate does not decide it. A trusted local seed chooses the snapshot token. The request must match that token with no trimming, case-folding, or alias. Fixtures may use `availability_check` as synthetic data. That fixture is not a Product Owner decision, and there is no remote purpose registry.

Outcomes:

| Current inputs | Outcome |
|---|---|
| `readActive` exact `true`, one matching active advertisement, one matching active snapshot with `effect: allow` | `ALLOW` |
| Same, with `effect: ask` | `ASK` |
| Any required input missing, ambiguous, unavailable, or not an exact match | `DENY` |

`ALLOW` and `ASK` are branded frozen values. They carry the binding fields a later approval module must copy: requester, target, `skillContract`, purpose, `input`, disclosure scope, `policyVersion`, `requestId`, and the permission id that was current for this call. They do not carry expiry, a context result, or an `available` boolean. They are not reusable authority. A second call reads the ports again.

`DENY` carries the outcome and one internal reason class only: `missing`, `ambiguous`, `unavailable`, or `unmatched`. It carries no party id, permission id, advertisement id, input, or relationship fact. Mapping that private class to a public response belongs to later ingress, which must use one non-revealing refusal (FR-008, SEC-018, AC-AUTH-002).

Reason precedence, so tests stay deterministic while every failure still denies:

1. Classify the local object before any port call. Absent required values are `missing`. Extra fields, a non-plain object, a self-pair, or an unexpected contract constant are `ambiguous`.
2. If a port throws, rejects, or returns a value this contract does not define, the reason is `unavailable`.
3. If advertisement lookup or permission lookup returns more than one current row, or a set of rows, the reason is `ambiguous`. The evaluator must not pick the first.
4. Otherwise an exact `false`, `null`, revoked row, or field mismatch is `unmatched`.

Corrupt stored objects are `unavailable`, not silent matches. A guard accepts only a plain object, the exact keys, the expected contract constant, parsed agent ids, and the closed enumerations above.

Revocation is current-state only. After a permission or advertisement revoke, or after `readActive` becomes `false`, the next evaluation does not use the old row. This module does not define in-flight delivery or pending-approval invalidation. Those stay with AC-REV-001 and Issue #11. It also does not cache `true` or `ALLOW` beyond the call (REL-004, SEC-009).

Duplicate `requestId` handling, replay windows, and single-use approval are not this predicate. SEC-007 and SEC-008 stay downstream. Two evaluations of the same id may both return `ASK` until Approval exists to make one pending row.

## Fail-closed rules

Missing, ambiguous, unavailable, and unmatched inputs produce `DENY`. They never produce `ALLOW` or `ASK`.

In particular:

- No branded principal, no target, no purpose, no disclosure scope, no input, or no request id: `DENY`.
- Relationship port not exactly `true`: `DENY`. A relationship never supplies `effect`.
- No current advertisement for the target and `pan.skill.availability/v1`: `DENY`, even when a permission snapshot matches.
- No current permission snapshot: `DENY`, even when the relationship is active and the skill is advertised (AC-DOM-001).
- More than one current advertisement or snapshot for the match: `DENY`.
- Revoked rows, wrong skill contract, wrong purpose, wrong disclosure scope, or requester/target mismatch: `DENY`.
- A Discovery reference, human id, or other non-agent id used as requester or target: `DENY`, and no write.
- Port failure, timeout, or malformed port output: `DENY`.
- Any attempt to read context or insert an approval from this module is a design violation, not a fallback path.

Remote payload cannot create policy (SEC-004, AC-SEC-001):

- Message text, model output, and sender-asserted effect, grant, skill, relationship, or policy version are not command input and not evaluation input.
- No exported function parses unknown JSON into `TrustedPolicySource`, an advertisement, a permission snapshot, or an `ALLOW` / `ASK` decision.
- Evaluation does not accept the raw message body "for logging" or "for the model".
- A remote create, revoke, or self-approval request leaves both stores unchanged.
- The requester id is taken only from the branded principal. A payload agent id cannot override it.

Commands fail closed on write as well. A failed create leaves no new active row. Revoke of a missing id does not create a row. The evaluator never writes.

## Provisional internal contracts

These constants are provisional internal contracts. They are not an approved public or wire contract, not OpenAPI, and not a protocol. AC-DEV-003 applies when implementation actually introduces them. A breaking change replaces the version constant. It does not silently widen a field.

| Constant | Provisional meaning |
|---|---|
| `pan.skill-advertisement/v1` | Envelope of the advertisement record |
| `pan.skill.availability/v1` | The only skill contract this module evaluates. Boolean result. Interval meaning is not included. |
| `pan.permission-snapshot/v1` | Envelope of the permission snapshot |
| `pan.policy-decision/v1` | Envelope of the ephemeral branded decision |

`policyVersion` on a snapshot is not one of these schema constants. It identifies the owner's current snapshot so a later approval can bind FR-012 and SEC-008. The request cannot select it.

No contract in this module versions a message envelope, a discovery document, an approval document, or a context document.

## Dependencies

Classes mean:

- **Hard:** this module cannot be specified or later authorized until that dependency is Done. There is no such dependency.
- **Contract:** this module is written against a named type or port. A fake is enough. Done status of the providing module is not required.
- **Implementation:** code this module would own after authorization.
- **Integration:** a later composition root or caller. Not part of the kernel.
- **None:** no edge.

| Dependency | Class | Use |
|---|---|---|
| Identity `AgentIdentityId`, `parseAgentIdentityId`, and `AuthenticatedAgentPrincipal` | Contract | Already accepted. Consume only. Do not extend Identity or construct a principal. |
| Relationships `readActive` | Contract | Named port above. Stable enough to fake. Not a hard dependency on Relationships being Done. |
| Skill advertisement store and service | Implementation | This module, after authorization |
| Permission snapshot store and service | Implementation | This module, after authorization |
| Policy evaluator | Implementation | This module, after authorization |
| Composition root binding `RelationshipReadPort` to the real Relationships service | Integration | When both exist. Not required to test the predicate. |
| Messaging calling `evaluate` | Integration | Downstream caller. This module does not import it. |
| Approval persistence | None | Downstream. No approval port and no approval store. |
| Context computation | None | Downstream. No context port and no availability derivation. |
| Discovery | None | References are not ids and not authority. No import. |
| Audit storage | None | No sink, table, or retention rule. The decision value is what a later audit module may be given. |
| PostgreSQL or another database | None | Not selected for this module. |
| External AI | None | Must not sit on the decision path. |
| Shared `Result` | None beyond the existing primitive | No new shared protocol type is required for preparation. |

```text
Identity types
    |
    v
advertisement records          permission snapshots
    \                          /
     \                        /
      policy evaluator
             ^
             |
      RelationshipReadPort.readActive

Discovery, Context, Approval, Audit, PostgreSQL: no edge
```

Advertisement code must not import the permission record. Permission code must not import the advertisement record. Evaluator code must not import either in-memory store or either command service. It depends on ports and pure guards only.

## Persistence

ADR-0004 selects PostgreSQL for the first approved module that introduces durable transactional state, and it says in-memory state is not MVP acceptance evidence. This preparation does not select PostgreSQL, a driver, a migration, SQLite, or a document store, and it does not become that first persistence module.

Architect recommendation, not Product Owner approval: when implementation is later authorized, keep advertisement and permission rows in separate process-local maps, document that restart clears them, and do not claim durable revocation. Empty maps fail closed, so a restart loses availability rather than granting it. Do not reload a revoked row as active from a static seed. A later durable adapter, under whatever module first takes on persistence, would have to implement the same lookup ports without putting database types on the evaluator.

The two maps are not one transaction. A command touches only its own map. There is no saga that repairs the other record.

## ADR assessment

ADR-0001 and ADR-0003 are sufficient. This preparation does not write an ADR, and it does not mark any ADR proposed or accepted.

- ADR-0001 already fixes one modular-monolith node, in-process ports, and receiver-local authorization.
- ADR-0003 already separates skill support from permission, relationship, context, messaging, and approval, and it already requires deterministic `ALLOW` / `ASK` / `DENY` with remote text unable to grant authority.
- ADR-0002 remains the toolchain. No new runtime dependency is justified.
- ADR-0004 is acknowledged and not applied. Selecting a database for this module would be a new persistence decision this preparation refuses.
- ADR-0005 stays Discovery-specific. This module must not extend it or treat a discovery reference as an input.

A later ADR would be justified only if the product moved to a reusable policy language, a cross-node policy protocol, model-mediated authorization, or durable policy replication. Those are outside the approved MVP scope. They are not opened here.

## What later implementation may build

After explicit Human Product Owner authorization of Issue #8, and before Issues #10 and #11 decide reserved semantics, implementation may build only the kernel below.

- Separate in-memory advertisement and permission records, trusted local create/revoke, and current-row lookup.
- The four ports, with `RelationshipReadPort` satisfied by a test fake.
- A pure evaluator and branded `ALLOW`, `ASK`, and `DENY` values, including the AC-DOM-001 case: active relationship and advertised availability, no matching permission, outcome `DENY`, and no cross-record writes.
- Fail-closed tests for missing, ambiguous, unavailable, and unmatched inputs, and for remote or model text that tries to create a grant, set `effect`, or mint `ALLOW`.
- Structural bounds and exact-key rejection. Recommended bounds, reversible before code lands: reuse Discovery's correlation character class `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$` for purpose, disclosure scope, policy version, and request id. Allow the opaque `input` string the same class up to 512 characters. Empty is missing. A structured interval object is not accepted under the provisional contract.
- Export of that surface from this module's barrel only.

That slice may state, in tests and module docs, that restart drops advertisements and permissions and that `ASK` persists nothing.

## What it must not build

Implementation must not build any of the following, including before or instead of the reserved decisions:

- Timezone, DST, horizon, maximum duration, interval openness, query budget, or any parser that treats `input` as a calendar.
- A non-boolean availability result, a context port, simulated private context, or derivation of `available`.
- Approval channel, owner UX, expiry, notification, polling, rejection delivery, duplicate-approval behavior, or an approval store. `ASK` must stay a decision with no insert.
- In-flight and pending-approval revocation behavior beyond "the next evaluation sees current rows".
- PostgreSQL, a driver, a migration, or a claim that revoke survives restart.
- A policy language or an embedded policy engine, including a document the owner authors. `effect` on one snapshot is the whole predicate.
- Custom cryptography, a signature over the decision, or a proprietary agent, A2A, or MCP protocol.
- An HTTP route, wire schema, or change to `src/main.ts` that accepts a network body.
- Discovery or Identity behavior changes, relationship mutation, or a cache of `readActive` or `ALLOW`.
- Durable audit, metrics labels containing ids, or a remote read of advertisements or permissions.
- A purpose catalog presented as the Product Owner's decision on MVP-scope item 3.

## File and component ownership

Create no files from this preparation. The paths below are the ownership split for a later authorized implementation, chosen so parallel backend work does not share mutable files.

Freeze first, then stop editing them while the other files proceed:

- `src/modules/skills-and-policy/contracts.ts` — provisional constants only
- `src/modules/skills-and-policy/ports.ts` — the four ports, branded decision, and trusted-source types

Workstream A, advertisement, after that freeze:

- `src/modules/skills-and-policy/domain/skill-advertisement.ts`
- `src/modules/skills-and-policy/skill-advertisement-service.ts`
- `src/modules/skills-and-policy/in-memory-skill-advertisement-store.ts`
- `tests/unit/modules/skills-and-policy/skill-advertisement.test.ts`

Workstream B, permission, in parallel with A:

- `src/modules/skills-and-policy/domain/permission-snapshot.ts`
- `src/modules/skills-and-policy/permission-service.ts`
- `src/modules/skills-and-policy/in-memory-permission-store.ts`
- `tests/unit/modules/skills-and-policy/permission-snapshot.test.ts`

Workstream C, evaluator, in parallel with A and B, against fakes only:

- `src/modules/skills-and-policy/domain/policy-decision.ts`
- `src/modules/skills-and-policy/policy-evaluator.ts`
- `tests/unit/modules/skills-and-policy/policy-evaluator.test.ts`

Integrate last, in one place:

- `src/modules/skills-and-policy/index.ts`

Do not add a relationship implementation under this module. A future `relationship-read` adapter belongs to integration, not to the first parallel slice, and it must not modify Relationships files. Do not add files under `src/modules/identity/`, `src/modules/discovery/`, `src/modules/relationships/`, `src/shared/`, `src/adapters/`, or `src/main.ts`. Add no package dependency.

`policy-evaluator.ts` must not import the in-memory stores or the command services. The store files must not import the evaluator. That import rule is the parallel boundary.

## Architect recommendations

These are defaults for details the Product Owner has not been asked to close. They are not approval. Each one is the most privacy-preserving, least authoritative, easiest to reverse, smallest, easiest to test, and least coupled option that still evaluates `ALLOW`, `ASK`, and `DENY`.

1. Call `readActive(requester, target)` only. Do not infer the reverse direction.
2. Keep the permission independent of any time window. Carry `input` as an opaque string, and only on `ALLOW` and `ASK`.
3. Match `purpose` exactly and ship no purpose catalog. `availability_check` in fixtures does not close MVP-scope item 3.
4. Recognize only `availability_boolean` as disclosure scope.
5. Represent `ASK` and `ALLOW` as snapshot `effect` values. Represent `DENY` as the failure of a unique current match, not as a stored deny grant and not as a rule document.
6. Use separate process-local maps. Restart denies. Do not select PostgreSQL here.
7. Omit clocks and timestamps so this module cannot acquire a timezone.
8. Reject self-pairs.
9. Allow an advertisement and a permission to be written independently, including when evaluation would still deny.
10. Treat decision objects as in-process branded values, not capabilities and not wire messages.
11. Use the reason precedence in Evaluation.
12. Use the character bounds in the implementation allowance, and tighten them before code if a smaller bound still fits fixtures.
13. Mint a new permission id and `policyVersion` on each trusted create. Do not edit an old snapshot in place.
14. Keep one current advertisement per agent and skill contract, and one current permission per match tuple.
15. Do not emit an audit event from the evaluator or the stores.
16. Do not wire a network entry point in the first slice.

## Requirements affected

This assessment does not implement any requirement.

The kernel is aimed at FR-003, FR-004's skill name and boolean result without interval semantics, FR-005's decision inputs before context access, and the FR-012 binding list only as consumed fields. It also constrains FR-006 through FR-009 and FR-011 by refusing to return a protected result, create an approval, or own request lifecycle.

Security and privacy constraints used here: SEC-003, SEC-004, SEC-005, SEC-008 as a version value to be bound later, SEC-009 as a fresh read rather than an in-flight rule, SEC-010 by not producing context authority from text, SEC-013 by keeping models off the predicate, and SEC-018 by keeping the deny reason local. PRV-002 and PRV-003 are honored by not disclosing or reading context. REL-003 and REL-004 are the fail-closed current read. AC-DOM-001's invocation half, AC-AUTH-002, AC-SEC-001, and the decision half of AC-VAL-001 are the intended later tests. AC-AUTH-001, AC-APR-001, and AC-APR-002 are not completable in this module.

## Completion

This file is the Software Architect preparation deliverable for Issue #8. It does not mark the module Ready for Development and does not record Product Owner approval.
