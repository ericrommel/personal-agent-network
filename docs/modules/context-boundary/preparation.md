# Context Boundary and Availability Preparation

Status: preparation note only. Issue #10 stays **Backlog** until the Engineering Coordinator
records a different state. This file is not Product Owner approval, not Definition of Ready, and
not implementation authorization. No interval rule below is decided.

Owner roles: Product Analyst, Software Architect, Quality Engineer  
Issue: #10, Context Boundary and Availability  
Requirements already in force: `FR-004`, `FR-005`, `FR-006`, `FR-010`, `PRV-002`, `PRV-003`,
`SEC-009`, `SEC-010`, `SEC-011`, `AC-AUTH-001`, `AC-PRV-001`

## Question

What context-boundary preparation is safe now, which availability semantics stay Reserved
Product Decisions, and which dependencies are hard?

Safe now: document the accepted local boundary, the egress allowlist, and the fail-closed rules
that do not invent interval arithmetic. Not safe now: context access on a request path, a real
calendar provider, or any default for the reserved time and budget rules.

## Accepted baseline

These points are closed. This note does not ask the Product Owner to reopen them.

- The receiving node alone holds simulated private availability context. No real calendar,
  directory, or external AI provider is involved (`FR-010`, MVP scope, ADR-0001).
- Context is queried only after valid authorization or approval, and only through a local
  least-privilege port (`PRV-003`, `FR-005`, `SEC-010`, architecture trust boundary 4).
- A successful disclosure is a boolean plus safe protocol metadata. Raw calendar data never
  leaves the boundary (`FR-004`, `FR-006`, `PRV-002`, `AC-AUTH-001`, `AC-PRV-001`).
- `available: false` is a disclosed result, not a failure. Failures omit the boolean.
- Relationship state, skill advertisement, and permission stay independent (`FR-003`,
  ADR-0003). None of them is context authority by itself.

`FR-004` and `PRV-002` already require the boolean. `AC-AUTH-001` and `AC-PRV-001` already
test it. Issue #10 and MVP-scope item 2 still mention a confirmation that output is strictly
boolean. That wording is stale. Reconciling it is outside this note. It is not an open product
decision here.

The narrative example in `docs/product-overview.md` (a 20:00 query against two labeled events)
motivates minimal disclosure only. It does not approve instant evaluation, a timezone, or an
overlap rule.

## Scope

In scope for this module once development is later authorized, and only after the blockers
below are cleared:

- A node-local simulated store of private availability, seeded with synthetic data.
- A narrow in-process port that reads that store only for one exact, currently authorized
  availability request.
- Deterministic derivation of one boolean from simulated busy intervals.
- An egress allowlist of `{ available: boolean }` plus safe protocol metadata.
- A final current-policy and revocation check immediately before the read and again
  immediately before disclosure.
- Fail-closed behavior when authority, validation, the store, or the reserved budget check
  is missing, stale, or indeterminate.
- Minimized local evidence that contains no raw context and no derived boolean.

The port sequence, once implementation is allowed, is:

```text
trusted in-process orchestration
  -> re-check current policy and revocation for the exact binding
  -> reserved budget check
  -> reserved interval validation
  -> read simulated busy intervals only
  -> pure derivation to one boolean
  -> fresh allowlisted object
  -> re-check again immediately before disclosure
```

There is no HTTP route, status code, or wire schema in this note. The transport ADR is not
part of this module.

### What the port may accept

The caller is trusted orchestration inside the receiving node. The port requires a current
decision for the exact binding: requester, target, versioned `availability` skill, purpose,
interval, disclosure scope, policy version, request id, and unexpired decision. Disclosure
scope is boolean availability only. Remote text, a model string, a relationship row, a skill
advertisement, a discovery reference, or an approval record that has not been re-checked as
current policy is not that decision.

This shape is a dependency sketch. It is not a stable policy contract. See the contract
dependency below.

### What stays inside the boundary

Simulated records may hold busy intervals and, for later negative tests, labels such as title,
people, and location. Derivation must be able to run on busy intervals alone. Labels exist so
`AC-PRV-001` can prove they do not leave. They are not a second output channel. A hostile
label is data, not an instruction (`AC-SEC-001`).

The store is not a general memory, profile, file, or tool store.

## Non-goals

- A real calendar provider, including CalDAV, ICS sync, Google, Microsoft, or Apple.
- Raw event, free/busy fragment, next-free, partial-availability, or confidence disclosure.
- Reopening boolean output, or returning `available: false` for errors and denials.
- General context or memory access, availability negotiation, and shared planning.
- External AI reasoning, summarization, or a model fallback on the derivation path.
- Owner-facing calendar or approval UX, and any new owner notification feed.
- Reading or writing relationships, discovery grants, skill advertisements, or policy rules.
- Messaging, replay storage, approval lifecycle, durable audit, or the two-node demo.
- PostgreSQL, a new protocol, custom cryptography, or an A2A/MCP replacement.
- Choosing the reserved interval, timezone, horizon, duration, or query-budget rules.
- Production code, tests, or adapters in this preparation step.

## Dependency classes

| Class | Meaning |
|---|---|
| Hard | An accepted upstream module or provider that must already be stable. Skipping it, or replacing it with a private stand-in, would make the context-boundary claim false. |
| Contract | An interface this module must consume. Instability blocks the consuming behavior. The owning module does not have to be Done for this note. |
| Implementation | Work inside this module after a later Ready for Development approval. |
| Integration | Later wiring to a neighbor that owns its own contract. Not a prerequisite for this note. |
| None | Not a prerequisite. Do not wait for it. Do not treat it as authority or as a provider. |

| Dependency | Class | Effect on this note and on later work |
|---|---|---|
| Policy `ALLOW`, including the fresh revocation read before access and before disclosure | Contract | Required before any request path may query or disclose context. The decision type, binding, and version are not stable. A local fake must not be wired in as if it were that contract. This is not a hard dependency of the preparation note. |
| Relationships Done | None | Not required before this note. The context port must not read relationship rows. Policy consumes that state under `FR-005`. |
| Skills Done | None | Not required before this note. Advertisement is not authority. A later skill contract must not widen egress beyond the boolean allowlist. |
| Real calendar provider | None | Out of scope. Absence is the requirement (`FR-010`), not a missing integration. |
| Identity and Discovery | None | No email lookup and no opaque reference as authority. |
| External AI | None | Stays off the path (`PRV-007`, `SEC-013`). Not a derivation engine. |
| PostgreSQL | None | Simulated context does not introduce persistent state here. ADR-0004 applies only if a later approved design persists state. It still would not add a calendar provider. |
| In-process simulated store, pure derivation, allowlist constructor, trusted clock, process-local budget counter | Implementation | Specified only at the rule level. Coding any of them is functional work and stays blocked. Parts that encode reserved rules stay blocked even after a general module approval, unless that approval includes those rules. |
| Approval release, messaging and replay, minimized audit sink, two-node demonstration | Integration | This note does not wait for them. The port is not invoked from their adapters. Duplicate suppression (`SEC-007`) stays with messaging's idempotency contract rather than a second replay store in this module. |
| Reserved interval, timezone/DST, horizon/duration, and query budget | Not a module dependency | Reserved Product Decisions. They block derivation and budget enforcement. They do not block this note. |

No hard dependency blocks this preparation note. Relationships, Skills, and a calendar provider
are specifically not hard dependencies.

The contract dependency is hard in one narrower sense: context access must not be implemented
while the `ALLOW` contract is still moving. That does not reclassify it. Preparation does not
need the contract to exist. Implementation of the read does.

Module sequence item 6 in `docs/engineering/architecture.md` is unchanged. This note does not
pull implementation ahead of Skills, Policy, or Messaging, and it does not require those
modules to be Done before the note itself.

## Egress allowlist

Successful disclosure constructs a new object. It must not be a store record with fields
removed. The only permitted keys are:

| Key | Value | Why it is allowed |
|---|---|---|
| `available` | boolean | The authorized derived result required by `FR-004` and `PRV-002`. |
| `contract` | version token chosen later | Safe protocol metadata. It identifies the result contract. It must not encode the boolean, the interval, or calendar data. |
| `correlationId` | the ingress correlation id | Safe protocol metadata already required for the request (`OBS-001`). Opaque and not derived from context. |

`true` and `false` use that same key set. Both are protected results.

Illustrative only, not a frozen schema:

```text
{ "contract": "pan.availability-result/v1", "correlationId": "<ingress id>", "available": true }
```

The exact contract string waits for an authorized contract change (`DEV-004`, `AC-DEV-003`).

Never egress, log, trace, metric, error text, or audit any of the following:

- event titles, participants, locations, descriptions, or identifiers;
- source intervals, overlap counts, next-free times, or partial booleans;
- owner timezone, owner identity, policy reason, relationship id, or quota remaining;
- the derived boolean itself, in logs, traces, metrics, or audit (`AC-PRV-001`, `PRV-004`).

Unauthorized, denied, pending, expired, malformed, budget-exhausted, and dependency-failure
outcomes have no `available` key and no calendar field (`FR-007`, `FR-008`, `SEC-011`,
`SEC-018`). Public failure shape belongs to the later messaging and policy contracts. This
module's duty is to withhold the result.

Audit, when a later sink exists, may carry correlation, the skill name, a coarse decision or
state code, and a timestamp. It does not carry the boolean or the store.

## Fail-closed rules

These rules follow accepted requirements. They do not settle the reserved decisions.

1. Do not read the store without a current trusted `ALLOW` for the exact binding. Missing,
   stale, ambiguous, mismatched, expired, or unavailable authority does not read and does
   not disclose (`SEC-005`, `SEC-010`, `REL-003`, `REL-004`).
2. Re-check current policy and revocation immediately before the read and immediately before
   disclosure (`SEC-009`). An indeterminate re-check stops the pipeline. Do not use a cached
   grant or a cached boolean.
3. `ASK` pending, `DENY`, rejection, and expiry do not query context and do not return a
   boolean (`FR-007`, `FR-008`, `PRV-003`). Approval without a fresh authorizing decision
   does not open the store.
4. Do not prefetch, warm, or derive "just in case" before that decision.
5. Remote or model text cannot widen the query, change policy, or select fields (`SEC-004`,
   `SEC-013`, `AC-SEC-001`).
6. An interval that is absent, malformed, unbounded, or not valid under an approved time
   rule is not queried (`SEC-014`, `AC-VAL-001`). No approved time rule exists yet, so
   implementation must not invent one to get past this gate.
7. Store overflow, a store error, a timeout, or a malformed store record does not become
   `available: true` or `available: false`. Empty of busy intervals, after a valid authorized
   query, is a successful `true`. That success is distinct from an unreadable store.
8. Budget exhaustion or an uncertain budget check does not read and does not look like a
   busy result. The numeric budget itself is reserved.
9. Egress copies only the allowlist into a new object (`SEC-011`). If `available` is not a
   boolean, disclose nothing.
10. A second evaluation of the same request id is not this module's replay store (`SEC-007`).
    Orchestration must not call the port twice. The port also has no hidden read.
11. External AI receives nothing and is not called if derivation fails (`PRV-007`).
12. Delivered results are not retracted by this module. In-flight and pending revocation
    remains the open MVP-scope item 5, owned with Approval and Authorization. This port
    must be able to drop an undelivered result when the final re-check fails. It does not
    decide that item.

Until `PO-CTX-1` through `PO-CTX-4` are explicitly approved, there is no temporary overlap
rule, timezone default, horizon, or budget. Guessing is a product decision and is forbidden.

## Reserved product decisions

The following stay open. The single privacy-preserving recommendation is **R-CTX**. It is a
package. Taking only the half-open rule, without the horizon, duration, and budget, is not
the recommendation: adaptive windows can locate private edges faster than isolated instants.

R-CTX is reserved. It is not approved behavior and it is not authorization to code.

### R-CTX, recommended and reserved

Evaluate one caller-supplied half-open window of absolute instants, `[start, end)`. The
owner is available only when no simulated busy interval overlaps that window. Contact at
`end` alone is not overlap. Return one boolean for the whole window.

Do not accept a caller timezone or a zone-less civil time. The owner's IANA zone, if a later
seed format needs one, is node-local authoring configuration and is not egress. Ambiguous or
nonexistent local seed times fail at ingest instead of being shifted.

The window must lie entirely in `[now, now + 7 days]` on the node's trusted clock, and its
duration must be greater than zero and at most 4 hours. Past windows fail closed. There is
no look-back.

Authorized reads that reach the store are capped at 8 per caller and 32 aggregate per node
for each 24 hours of node time. The counter is process-local, resets on restart, and is not
a durable or multi-instance control. The response has no quota field. A short per-minute
refill is not part of the recommendation, because a refill lets a caller scan the horizon.

Why this is the privacy-preserving option:

- One bit answers the authorized question without a fragment list or an endpoint oracle.
- Absolute instants stop a caller-chosen zone from sliding the window across a private event,
  and they keep the owner's zone out of the response.
- Four hours is enough for the initial "at 20:00" meeting question and too small to make one
  answer a whole-day disclosure. Seven days still covers "this Saturday" without opening the
  rest of the calendar.
- Eight reads are enough for a short human exchange and not enough to slice the horizon into
  every 4-hour block. No per-minute refill is the control that a rate limit would give away.
- The restart limitation is explicit, matching the honesty `PRV-008` requires of process-local
  budgets. It is weaker than a durable cap and does not pretend otherwise.

### PO-CTX-1. Instant or half-open interval

- Decision: is availability an instant, or free-for-the-whole half-open interval?
- Recommendation inside R-CTX: half-open `[start, end)`, one boolean, endpoint contact is
  not overlap. Empty or inverted windows are invalid, not vacuously available.
- Alternatives: an instant timestamp, which matches the narrative sentence but strains
  `FR-004`'s interval input and still allows a walk along the timeline. A closed interval,
  which aliases adjacent events at the shared endpoint and leaks that boundary through
  inconsistent answers. A list of sub-interval booleans, which is rejected by `PRV-002` and
  is not a real option.
- Impact: boundary fixtures and every later overlap test depend on this. Egress keys do not.
  Half-open alone does not stop reconstruction; `PO-CTX-3` and `PO-CTX-4` are part of the
  same recommendation for that reason.
- Reversibility: high before a published contract. The store can keep absolute busy intervals
  while only the comparison changes. After callers rely on the edge rule, a change is a
  versioned contract break (`DEV-004`).

### PO-CTX-2. Timezone and DST

- Decision: whose clock interprets the window, and what happens across DST gaps and folds?
- Recommendation inside R-CTX: absolute instants only on the request path. No caller zone
  and no naive local datetime. Owner zone is local seed configuration, never metadata.
  Gap and fold seed times fail closed rather than being guessed or reported as a distinct
  public error.
- Alternatives: interpret the request in the owner zone and echo that zone, which discloses
  location-relevant data and puts DST on the request path. Interpret it in the requester
  zone, which lets the caller slide Maria's private events. Return a special ambiguity
  error, which is an oracle for the owner's zone.
- Impact: the demo sentence "Saturday at 20:00" needs a local translation into instants
  before the request. It does not change the boolean allowlist. Seed tools must reject
  nonexistent local times instead of shifting them onto an event.
- Reversibility: moderate. Adding a single owner zone later is a compatible widening if
  absolute instants remain valid. Removing a zone that was already egressed is not
  compatible, and it cannot undo disclosure.

### PO-CTX-3. Maximum horizon and duration

- Decision: how far ahead, and how long, may one authorized window be?
- Recommendation inside R-CTX: start and end inside the next 7 days, no past window, and
  duration at most 4 hours. The node's trusted clock is required. If the clock is
  unavailable, do not read. These numbers are part of the reserved recommendation, not
  defaults an implementer may apply early.
- Alternatives: a 24-hour cap, which supports "free all day" and discloses more in one bit.
  No cap, which allows one query to cover the whole simulated calendar. Instant-only
  duration, which collapses this decision into `PO-CTX-1`. Historical look-back over the
  same 7 days, which is more sensitive and is not required by the initial scenario.
- Impact: acceptance fixtures must fit the cap. Eric's Saturday 20:00 question fits a short
  window inside a 7-day horizon. A day-long question would not fit the recommendation.
- Reversibility: easy to loosen before publication and still a disclosure increase.
  Tightening after publication breaks callers and needs a new contract version. Prefer the
  tight cap first.

### PO-CTX-4. Query budget

- Decision: how are repeated boolean probes limited, and what does exhaustion look like?
- Recommendation inside R-CTX: 8 store reads per caller and 32 aggregate per node per 24
  hours of node time. Count a read when it is about to happen, atomically in that process,
  so parallel calls cannot share the last slot. Process-local only. Restart resets the
  counters and is not multi-instance protection. Exhaustion and an uncertain counter return
  no boolean, no remaining quota, and no body that varies with store contents. Do not use a
  per-event counter. Do not copy Discovery's 30/60/1000 per 60 seconds; those numbers are a
  different contract, and a one-minute refill is a poor fit for calendar reconstruction.
- Alternatives: no budget, which leaves `PRV-008` unmet for this module. Discovery's
  per-minute refill, which permits a full scan of a 7-day horizon. A durable counter in
  PostgreSQL, which is stronger across restarts but is an ADR-0004 persistence decision,
  not a requirement of this note. A public `retryAfter` or remaining-quota field, which
  tells the caller how to continue the scan. Using `available: false` for exhaustion,
  which fabricates a busy result.
- Impact: a normal demo of a few windows fits. Automated boundary search does not, until
  someone restarts the process. Evidence must say that restart escape hatch out loud.
  Owner-visible probe history is a separate threat-model question and is not decided here.
- Reversibility: the response shape is the costly part. Adding quota fields later discloses
  more. Changing 8 or 32 before publication is cheap. Moving the same numbers from process
  memory to a durable counter later does not change the caller-visible rule if restart
  behavior was documented as a limitation rather than as a promise.

### Explicitly not reserved here

- Boolean versus richer output. Closed by `FR-004` and `PRV-002`.
- Whether MVP purpose is fixed. MVP-scope item 3 stays with Policy and Skills. This port
  only checks that the trusted binding's purpose matches the query.
- In-flight revocation and pending approvals. MVP-scope item 5 stays with Approval and
  Authorization.
- Audit access, retention, export, and deletion. `AC-AUD-001` stays with Audit.
- Owner visibility of probes. The threat model leaves it open. This module adds no feed.

## QE evidence that would later be required

No tests are written for this note. When implementation is authorized, developers own the
automated tests. QE owns the independent check. Skipped tests and this document do not count
as acceptance evidence.

Security-critical derivation, authorization gating, and disclosure files need complete line,
statement, function, and branch coverage before Ready for Development test configuration, per
`docs/engineering/quality-strategy.md`. Coverage does not replace the cases below.

Developer evidence later, named with the `AC-*` ids:

- `AC-AUTH-001`: an exact current permission and a valid interval yield only the allowlisted
  keys. Source events are absent. `true` and `false` share that key set.
- `AC-PRV-001`: fixtures contain synthetic titles, people, and locations. Remote output is
  only the boolean plus safe metadata. Logs, traces, metrics, errors, and audit contain
  none of those labels and none of the derived boolean, for both `true` and `false`.
- `AC-VAL-001` and `SEC-014`: malformed, inverted, oversized, and non-approved intervals,
  plus an unavailable policy or store dependency, stay bounded and disclose nothing.
- `AC-SEC-001` and `SEC-010`: instructions in the message or in an event title do not change
  the boolean, the policy input, or the egress keys. A model-shaped extra field never leaves.
- `AC-AUTH-002`, `FR-007`, and `PRV-003`: `DENY`, pending `ASK`, rejection, and expiry do
  not call the store. Assert the read count.
- `SEC-009`: revocation between decision and read, and between read and disclosure, leaves
  no boolean. A stale `ALLOW` is not enough.
- `SEC-007`: a duplicate request id does not cause a second read or a second disclosure.
- `SEC-011`: the allowlist is a new object. Unexpected keys, nested events, and partial maps
  fail closed rather than being copied through.
- `FR-010` and `PRV-007`: no calendar-provider client and no external-AI call. Import tests
  keep messaging, discovery, relationships, and external AI away from the store.
- Empty store after a valid authorization is `available: true`. Store failure has no
  boolean. Those paths must not share a body.
- Unauthorized paths do not vary with store size or labels (`SEC-018`).

Cases that must not be marked passed until the matching reserved decision is approved:

- overlap at `start`, at `end`, and across adjacent events (`PO-CTX-1`);
- DST gap, fold, caller zone, and naive local input (`PO-CTX-2`);
- horizon edges, past windows, and duration just inside and just over the cap (`PO-CTX-3`);
- the 8 and 32 caps, parallel last-slot races, restart reset, and exhaustion shape
  (`PO-CTX-4`).

QE later samples those tables, perturbs the allowlist to prove the tests fail, and probes
log sinks, prefetch, and interval slicing. Timing work, if any, is a measured statistical
check owned with Security. It is not a claim of constant time. Confirmed defects become
developer regressions.

`AC-AUTH-001` remains shared with Policy. This module does not satisfy it by a local unit
test alone. Two-node evidence stays with the later demonstration.

## Work that can continue

Safe preparation, without production code:

- Review of this note, including the reserved package R-CTX, by the Human Product Owner
  when the coordinator chooses to ask.
- A later ExecPlan, security review, or QE plan that keeps `PO-CTX-1` through `PO-CTX-4`
  explicitly unapproved and does not authorize implementation.
- Traceability cleanup of the stale "is output strictly boolean?" wording, owned outside
  this file, without weakening `FR-004` or `PRV-002`.
- Continued work on Relationships, Skills, and Policy. Those modules do not need this
  boundary, and this note does not need them to be Done.

This note is the preparation that is safe now. It does not need a stable `ALLOW` contract.

## Work that stays blocked

- Any code, test, fixture implementation, adapter, route, or migration for this module.
- Querying or disclosing context on a request path, including behind a stand-in `ALLOW`.
  The policy contract is not stable enough.
- Implementing overlap, timezone, DST, horizon, duration, or budget behavior, including
  "temporary" defaults for R-CTX.
- A real calendar provider or an external AI path.
- Wiring Messaging, Approval, Audit, or a two-node demo into the store.
- Marking Issue #10 Ready for Development, or treating this note as Definition of Ready.
- Final acceptance evidence for `AC-AUTH-001` and `AC-PRV-001`.

Definition of Ready still requires the reserved decisions to be resolved or explicitly
accepted, a stable policy contract for the access path, an ExecPlan, and explicit Human
Product Owner authorization. None of those are claimed here.

## Traceability

| Accepted or reserved item | Ids | What this note does |
|---|---|---|
| Simulated context, no provider | `FR-010` | In scope as a local store. Provider class is none. |
| Boolean result | `FR-004`, `PRV-002`, `AC-AUTH-001`, `AC-PRV-001` | Closed. Not reserved. |
| Query only after authorization | `FR-005`, `PRV-003`, `SEC-010` | Fail-closed rule. Access implementation blocked on the policy contract. |
| Allowlisted egress | `FR-006`, `SEC-011`, `AC-AUTH-001` | Allowlist specified. Not coded. |
| Revocation immediately before access and disclosure | `SEC-009`, `REL-004` | Rule specified. Contract not stable. In-flight product choice left where it already sits. |
| No raw context or derived result in logs | `PRV-004`, `AC-PRV-001` | Egress and audit exclusion specified. |
| Repeated queries | `PRV-008` | Reserved as `PO-CTX-4`. Discovery numbers are not reused. |
| Interval, zone, horizon, budget | MVP-scope item 2, Issue #10 | Reserved as R-CTX. Boolean clause of that item is not reused. |
