# Skills and Policy Test Plan

## Status

This document is a preparation strategy for Issue #8. It is not execution evidence, not a
test run, and not a Definition of Done. Skills and Policy is not implemented. No test named
here exists, and none may be written from this plan alone.

This plan does not authorize functional implementation, infer Human Product Owner approval,
or move Issue #8. Product recommendations below are recommendations only. They are not
Product Owner decisions.

## Purpose, scope, and ownership

The question this plan answers is how QE can verify Skills and Policy later without becoming
the author of implementation tests.

After a later Human Product Owner authorization, the Backend Engineer owns the unit,
component, contract, and integration tests, including fixtures, coverage configuration, and
regression fixes. QE owns this risk model, the decision-table oracles, traceability and
coverage review, independent sampling, and exploratory verification. QE checks do not
substitute for developer tests. QE must not implement missing ones. Security owns
trust-boundary review. This plan does not replace that review.

In scope for that future suite:

- separate skill-advertisement and permission records;
- a versioned `availability` skill contract, without executing it;
- one fresh `ALLOW`, `ASK`, or `DENY` decision from current inputs;
- the disclosure boundary of that decision;
- the invocation-denial half of `AC-DOM-001`.

Out of this strategy's pass/fail claims, even after implementation:

- no context boolean computation;
- no approval persistence;
- no durability claim for relationship authority, permissions, or policy;
- no messaging, authentication transport, or replay store.

Reserved product behavior stays out of the pass/fail claims as well: interval timezone and
horizon, approval channel, and who may create permissions. Future tests may still assert
that those behaviors are absent. `AC-APR-001` belongs to Approval. The in-flight portion of
`AC-REV-001` remains `TBD-PO`.

When tests exist, their names include the `AC-*` identifier they actually exercise. A
skipped or quarantined test is not acceptance evidence.

## Planning baseline

Relationships is an approved dependency for this strategy: a directed boolean `readActive`
with process-local state. This plan does not assume that boolean survives a restart, and it
does not reopen the Relationships module. Policy reads the boolean. Policy does not write
it, cache it as authority, or treat it as permission.

Normative oracles already fixed by accepted requirements, not by this plan:

- Relationship state, advertised skills, and skill permissions stay independent records
  (`FR-003`, `AC-DOM-001`).
- An advertised availability skill is not permission to invoke it (`AC-DOM-001`).
- A decision considers the authenticated requester, target, current relationship, skill,
  purpose/scope, and policy before any context access (`FR-005`). This module stops before
  context access.
- Missing, ambiguous, unavailable, stale, or unmatched authorization inputs produce `DENY`
  (`SEC-005`, security principle 2). `ASK` is not the fail-closed result.
- Remote text does not create policy, grant capability, approve itself, or override a
  decision (`SEC-004`).
- `DENY` discloses no protected result and no private reason (`FR-008`, `SEC-018`,
  `AC-AUTH-002`).
- Egress rejects unexpected fields (`SEC-011`).

Exact-match rule used by the table: `ALLOW` and `ASK` are reachable only when one current
evaluation sees all of the following at once.

- A trusted authenticated principal for the requester, supplied by the test seam. Payload
  identity is not that principal.
- A distinct local target.
- The single ordered relationship the design names, read now through `readActive`, is
  `true`. Recommendation, not Product Owner approval: that call is
  `readActive(authenticatedRequester, localTarget)`. The opposite order is not a match. If
  a later Product Owner decision names the opposite order, swap this one call before
  implementation. Do not accept either direction.
- A current advertisement of `availability` at one explicit version `V`.
- One current permission that binds that same ordered pair, `availability`, version `V`,
  and one purpose/scope, and whose explicit effect is `ALLOW` or `ASK`.
- The request's structured skill, version, and purpose/scope equal that permission.
- A structured interval value is present on the request. It is not interpreted for
  timezone, DST, or horizon. A missing or non-structured interval is the Missing row.
- The permission is not revoked, and no second current permission or effect exists for
  that key.
- The evaluated request, advertisement, and permission contain no unexpected fields.
  Instruction text is not one of those fields. It is untrusted data beside them, and it
  neither grants nor vetoes.

Any other combination is `DENY`. An explicit denial is also `DENY`. Conflict between
`ALLOW` and `ASK` is ambiguity, so it is `DENY`, not a precedence rule. Choosing
"ALLOW wins" or "ASK wins" would be a new product decision. This plan does not make it.

`ASK` here is only a decision. It does not create, store, or bind an approval. `ALLOW`
here is only a decision whose authorized output schema is `{ available: boolean }` plus
safe protocol metadata. This module does not fill `available` and does not read context.

Recommendation, not Product Owner approval: safe protocol metadata is a closed allowlist
with no denial reason, party graph, skill catalogue, permission id, or context. QE reviews
the allowlist. A field that differs across `DENY` causes is not safe metadata.

## Ranked risks

Ranks are by impact. P0 failures block later acceptance of this module. A lower rank still
blocks when the authorized slice exposes that behavior.

### P0 — Relationship is treated as permission

`readActive === true`, a reciprocal direction, a Discovery grant or reference, or an
advertised skill is treated as a skill permission, an `ALLOW`, or an `ASK`. The same
failure occurs when a permission creates or implies a relationship, when an advertisement
creates a permission, or when either record changes the other. This is authorization
bypass and a confused deputy. It violates `FR-003`, `FR-005`, and `AC-DOM-001`.

### P0 — Fail-open

A missing, ambiguous, stale, revoked, mismatched, extra, malformed, or unavailable input
returns `ALLOW` or `ASK`, throws in a way an orchestrator can treat as success, or
discloses a result. Using `ASK` for "unsure" is fail-open. `SEC-005` requires `DENY`.
A default fixture that already contains a grant is part of this risk.

These are also P0 when they appear in this module, from the quality strategy:

- a protected result, including a filled `available` boolean, is emitted on `ASK` or
  `DENY`, or on `ALLOW` before the disclosure boundary passes;
- a revoked or stale permission is reused;
- remote instruction text changes the decision or the stores;
- a `DENY` response reveals whether context exists or which private rule failed.

### P1 — Disclosure and bounds that are not themselves a wrong decision

Oversized or deeply nested input, a denial shape that is uniform in the enum but leaks
through logs, and a skill or permission identifier echoed in an error. Dependency failure
belongs in P0 if it can fail open, and in P1 only for the bounded-work and redaction
residue after the decision is already `DENY`.

### Not ranked as product acceptance

Interval timezone and horizon, approval channel, the local actor who may create a
permission, restart durability, messaging replay, and approval persistence. Those are
absent, deferred, or reserved. A test must not turn them into a pass.

## Decision table

Inputs are current port values unless a row says the value is a caller snapshot or message
text. The public `DENY` shape is one closed decision: no `available` value, no private
context, no reason, and no field that distinguishes these `DENY` rows from each other.
`ASK` adds no approval record and no protected result. `ALLOW` names the boolean schema
and does not compute the boolean.

| Case | Input that distinguishes the row | Expected |
|---|---|---|
| Missing | Any exact-match input is absent, including requester, target, relationship read, advertisement, permission, purpose/scope, effect, skill name, or version. The untouched default fixture is this row. | `DENY` |
| Ambiguous | Two current effects, two permission rows for one key, a non-boolean relationship result, an unrecognized effect, or more than one version that claims to match. | `DENY` |
| Stale | A prior `ALLOW` or `ASK`, or a cached `true` relationship or permission, is reused after a current read no longer matches. Includes a relationship read that became `false` because process-local relationship state was dropped. | `DENY` |
| Revoked | The matching permission is revoked. Relationship and advertisement may still be current. | `DENY` |
| Reversed relationship direction | Only the ordered pair opposite the named `readActive` pair is true. A permission may exist. | `DENY` |
| Advertised skill without permission | Named `readActive` is `true`, and `availability` version `V` is advertised. No matching permission exists. | `DENY` |
| Permission without relationship | A matching current permission and advertisement exist. The named `readActive` is `false`. | `DENY` |
| Mismatched purpose | Exact match except the request purpose/scope differs from the purpose/scope bound on the permission. | `DENY` |
| Mismatched skill version | Advertisement, permission, and request do not all name the same `availability` version. | `DENY` |
| Extra fields | The request, advertisement, permission, or output candidate contains an unexpected field, such as a timezone, horizon, approval channel, tool name, context event, or instruction object. This row wins over an otherwise exact match. | `DENY` |
| Remote instruction text | Text tells the receiver to allow, self-grant, alter policy, skip approval, reveal context, call a tool, or ignore rules, and the structured inputs are not an exact match. | `DENY` |
| Remote text beside an exact match | The same text is present only beside a clean exact `ALLOW` or exact `ASK` object, not as a field of that object. | Unchanged `ALLOW` or `ASK` |
| Exact `ALLOW` | Every exact-match input is current and the single effect is `ALLOW`. | `ALLOW` |
| Exact `ASK` | Every exact-match input is current and the single effect is `ASK`. | `ASK` |
| Explicit denial | The binding matches and the explicit effect is `DENY`. | `DENY` |
| Unavailable dependency | The relationship, skill, or permission port times out, throws, or returns a malformed value. | `DENY` |

A structurally absent interval is a missing input and follows the Missing row. A
structurally present interval is not accepted or rejected for a timezone, DST, or horizon
rule. This table has no such column.

Remote text beside an exact match must not widen purpose, version, parties, or the output
schema, and it must not turn `ASK` into a completed approval. Text is not a second policy.
If that text is instead an extra field on the evaluated object, the Extra fields row
applies and the decision is `DENY`. Do not strip unknown fields in order to recover
`ALLOW` or `ASK`.

## Traceability

Future in-scope evidence is only a Skills and Policy contribution. This document does not
show that the module is implemented. It does not complete deferred evidence.

### `FR-003` and `AC-DOM-001`

In scope: advertisement and permission are distinct records. Creating, changing, or
revoking one does not write the other and does not write relationship or Discovery state.
`readActive` is not mutated by this module. The invocation-denial half is in scope: an
active named relationship plus an advertised availability skill and no matching permission
stays `DENY`, and that path creates no permission.

Not a completion claim by itself: Identity's structural evidence and Relationships' own
record tests. Full `AC-DOM-001` still needs those contributions plus this denial path.
This plan does not cite them as already done.

### `FR-004`

In scope: a versioned `availability` contract whose structured input is an interval and
whose authorized output is a boolean `available`, with advertisement separate from
permission.

Not claimed: computing that boolean, choosing timezone or horizon, or executing the skill.
Those are not pass/fail claims of this strategy.

### `FR-005`

In scope: the decision consults authenticated requester, target, current `readActive`,
skill and version, purpose/scope, and explicit policy effect before it can return `ALLOW`
or `ASK`. It does not reach context.

Not claimed: a live authenticated message or a context query. The principal is a trusted
test seam, not Messaging acceptance.

### `FR-006` and `AC-AUTH-001`

In scope: the `ALLOW` decision and its disclosure boundary only. The authorized schema is
`{ available: boolean }` plus the reviewed safe metadata allowlist. Unexpected output
fields are rejected. No source event or unrelated context is attached. The boolean is not
populated here.

Not claimed: a derived availability result, a real or simulated context read, or the
end-to-end response in `AC-AUTH-001`. A stub boolean must not be reported as this
criterion.

### `FR-008`, `SEC-018`, and `AC-AUTH-002`

In scope: `DENY` and explicit denial return no protected result and no private reason. The
public decision objects for the `DENY` rows in the table match each other. `ASK` also
returns no protected result, as a policy-decision fact, without becoming Approval evidence.

Not claimed: HTTP status, headers, or retry behavior. Those wait for Messaging. Uniformity
here is the decision object, not a transport.

### `SEC-004`

In scope: remote instruction text and payload identity do not create an advertisement or a
permission, do not change `readActive`, and do not change an `ALLOW`, `ASK`, or `DENY`
that the structured current inputs already determine.

Not claimed: envelope authentication, integrity, or `AC-SEC-001` as a whole. This is the
policy-port contribution. A message that never reaches this port is Messaging's test.

### `SEC-005`

In scope: every Missing, Ambiguous, Stale, and Unavailable row is `DENY`, including a
non-boolean relationship result and an unrecognized effect. `ASK` is not used as the
fallback.

### `SEC-011`

In scope: the disclosure boundary rejects unexpected fields on an output candidate,
including a candidate that also contains `available`. Rejection discloses nothing. Extra
input fields follow the Extra fields row.

Not claimed: a context adapter's egress in production. The candidate in this suite is a
fixture, not a computed result.

### Related requirements that this plan must not mark done

| Id | Boundary |
|---|---|
| `FR-007`, `FR-012`, `AC-APR-001`, `AC-APR-002` | Approval's module. This decision may be `ASK`. It must not persist or bind an approval. |
| `FR-009`, `SEC-009`, `REL-001`, `REL-004`, `AC-REV-001` | A later decision after a revoked permission or a now-false `readActive` is `DENY`. In-flight work, pending-approval invalidation, and latency stay `TBD-PO`. |
| `FR-010`, `PRV-002`, `PRV-003`, `SEC-010` | No context boolean and no context port. |
| `SEC-001`, `SEC-002`, `SEC-006`, `SEC-007`, `AC-MSG-001` | No messaging and no replay store. |
| `AC-QE-001` | Fixture obligations below are a contribution. Replay, Discovery enumeration, and network injection suites are not. |
| `AC-VAL-001` | Unknown skill, extra or oversized fields, and unavailable policy inputs fail closed here. The reserved interval rules are not this criterion's completion. |

## Evidence developers must produce

The Backend Engineer adds the following only after implementation is authorized. QE does
not write these tests, fixtures, or coverage settings. Preparation does not change the
test runner.

### Decision tests

One table-driven suite covers every row above, including both remote-text rows. Each
`DENY` row asserts the shared public shape, not only the enum. The exact `ALLOW` and
exact `ASK` rows are named opt-ins. The untouched default fixture is the Missing row.

The suite also asserts store independence on each row: no write to `readActive`, no
Discovery mutation, and no mutation of the record the row did not intend to change.
Revoking a permission leaves the advertisement in place. Removing an advertisement leaves
the permission in place and the next decision `DENY`. Flipping the relationship fake to
`false` leaves both skill records in place and the next decision `DENY`.

A second call after a revoke or a dropped relationship read is `DENY` even if the first
call was `ALLOW` or `ASK`. The first result is not a capability.

### Contract and disclosure tests

- Export an explicit skill-contract version and an explicit decision-schema version, and
  cover that introduction under `AC-DEV-003`. Do not add an HTTP API to satisfy this plan.
- Reject a range or a second version as an exact match.
- Compare public `DENY` objects across missing, revoked, reversed, mismatched, explicit
  denial, and dependency failure.
- Show that an otherwise exact `ALLOW` whose output candidate has an extra field
  discloses nothing and is not `AC-AUTH-001` evidence.
- Show `ASK` and `DENY` objects contain no `available` value and no approval id.
- Show errors and any local logs omit remote text, payload bodies, permission contents,
  and context.

### Negative component tests

Drive the decision through fakes for the trusted principal, `readActive`, advertisement
read, permission read, and output schema. There is no context fake that returns a boolean.
There is no approval repository.

- A Discovery grant, Discovery reference, relationship record, or advertisement object is
  not accepted as a permission.
- A Human Identity id, permission id, or skill id is not an agent endpoint.
- A sibling agent of the same human does not inherit the pair.
- Payload `requester` text does not replace the trusted principal.
- Unknown skill names, including other examples from the product overview, are not
  invocable here.
- The module exposes no timezone database, horizon constant, approval channel, or
  messaging ingress as a behavior this suite treats as success.

### Coverage configuration

When implementation is authorized, add per-file thresholds for every future file that
selects `ALLOW`, `ASK`, or `DENY` or that builds the disclosure object. Those files need
100% branch coverage, and 100% line, statement, and function coverage so a decision cannot
hide in an unexecuted line. That is the quality-strategy bar for a policy module.

Leave the repository floors at 80% lines, statements, and functions and 75% branches. Do
not lower the existing 100% thresholds on Discovery, Identity, or shared identity ids.
Other files in this module stay at the repository floors unless they can select a decision
or disclose a field. Limit exclusions to generated, configuration, or type-only code and
review them. Do not meet 100% by deleting a negative branch or by shrinking this table.

## Evidence QE will review

These checks start after developer tests exist. They do not replace those tests, and they
are not a second implementation of the suite.

- Trace every in-scope row to a developer test and to a requirement or acceptance id.
  Missing developer coverage is a blocking review finding, not work for QE to code.
- Inspect the default fixture. It must deny. Confirm `ALLOW` and `ASK` are opt-in.
- Sample the table instead of trusting a green suite. The minimum sample is every P0 row:
  relationship true without permission, permission without the named relationship,
  reversed direction, missing effect, ambiguous `ALLOW` plus `ASK`, stale cached grant,
  revoked permission, unavailable dependency, extra output field, and remote text both
  with and without an exact match.
- Oracle perturbations, used only as a temporary review technique: the permanent
  regression stays developer-owned. The advertised-without-permission test must fail if
  `readActive === true` becomes `ALLOW`. The unavailable-dependency test must fail if a
  thrown port becomes `ALLOW` or `ASK`. The disclosure comparison must fail if `DENY`
  grows a reason. The version test must fail if version `V` satisfies a request for
  another version.
- Review coverage exclusions and confirm this module's thresholds did not lower
  repository or existing module floors.
- Confirm the suite did not stub an availability boolean, an approval record, a durable
  store, or a message envelope and then cite `AC-AUTH-001`, `AC-APR-001`, durability, or
  `AC-MSG-001` as met.
- Explore command order, a revoke between two decisions, type-confused records, and logs
  that echo payloads. Confirmed defects become developer-owned regressions.
- Do not change Issue #8 state. A QE review of this plan is not Product Owner acceptance.

## Negative cases and oracle checks

Each case needs a developer-owned automated test under the baseline. QE samples that test.
The oracle is the decision plus the side-effect and disclosure checks.

### Missing

The default fixture, with no permission and a false relationship read, is `DENY` and
creates nothing. Removing any one exact-match field from an otherwise exact fixture is
also `DENY`. Ids: `FR-005`, `SEC-005`, `AC-AUTH-002`.

### Ambiguous

Two effects or two rows for one key are `DENY`, not `ALLOW` and not `ASK`. An
unrecognized effect is `DENY`. Ids: `SEC-005`, `AC-AUTH-002`.

### Stale

Authority is the current read. A snapshot, a cached `true`, or a previous decision object
does not authorize the next call after the ports change, including after process-local
relationship state is gone. Ids: `SEC-005`, `FR-005`. This is not a durability pass.

### Revoked

After the permission read returns revoked, the decision is `DENY`. The advertisement and
the relationship boolean stay whatever they were. A revoked grant is not reused. Ids:
`AC-AUTH-002`, and only the later-decision portion of `AC-REV-001`. In-flight behavior is
not asserted.

### Reversed relationship direction

The opposite `readActive` order does not satisfy the named order. The decision is `DENY`
even when advertisement and permission look complete. Ids: `FR-003`, `FR-005`,
`AC-DOM-001`.

### Advertised skill without permission

This is the invocation-denial half of `AC-DOM-001`. Named relationship true, availability
advertised, no matching permission, decision `DENY`, and no permission is created. Ids:
`FR-003`, `AC-DOM-001`, `SEC-005`.

### Permission without relationship

A current permission does not turn `readActive` true and does not authorize by itself.
Decision `DENY`. Ids: `FR-003`, `FR-005`, `SEC-005`.

### Mismatched purpose

A different purpose or scope is unmatched. Decision `DENY`. The permission's purpose does
not change to match the request. Ids: `FR-005`, `SEC-005`.

### Mismatched skill version

Any disagreement among advertised version, permitted version, and requested version is
`DENY`. A version range is not an exact match. Ids: `FR-004`, `FR-005`, `SEC-005`.

### Extra fields

Unexpected fields fail closed as `DENY` and are not echoed. A timezone, horizon, approval
channel, tool, raw context, or embedded instruction is an extra field, not a behavior this
module implements. On output, extra fields are rejected and nothing is disclosed. Ids:
`SEC-011`, `SEC-014` as bounded failure, `SEC-018`, `AC-AUTH-002`.

### Remote instruction text

Text that asks for a grant, a policy change, a self-approval, hidden context, or a rule
bypass does not write stores. Without an exact structured match the decision is `DENY`.
Beside a clean exact match, the decision stays that match. The same text placed as an
extra field is `DENY`, not a recovered `ALLOW` or `ASK`. Ids: `SEC-004`, and the
policy-port portion of `AC-SEC-001`.

### Unavailable dependency

A timeout, throw, or malformed value from a required port is `DENY`, with no partial
grant and no disclosed reason. Ids: `SEC-005`, and the policy contribution to `REL-003`.

### Further oracles in the same developer table

- Do not treat a shared word such as `active` on a relationship, grant, or advertisement
  as a permission effect.
- Do not disclose whether the `DENY` came from a missing relationship, a missing
  permission, or an explicit denial.
- Do not mint a filled `available` value in any row.
- Do not create an approval id in the `ASK` row.

## Coverage expectation

The future policy decision and disclosure-boundary code needs 100% decision and branch
coverage before that module can be called Ready for Development. Configure it as 100%
branch, line, statement, and function coverage on those files, as stated for developers
above. Repository floors stay 80% lines, statements, and functions and 75% branches.
Existing higher thresholds stay where they are. Coverage is evidence that branches were
exercised. It is not a substitute for the decision table, and a green coverage number
without the P0 rows is not acceptance evidence.

## Synthetic fixtures

Recommendation, not Product Owner approval: deny-by-default fixtures.

- The factory default has no advertisement, no permission, a relationship fake that
  returns `false`, and no trusted widening of a payload. Its expected decision is `DENY`.
- `ALLOW` and `ASK` fixtures opt in to every exact-match field in that test. Do not keep
  a shared grant and delete fields until the case denies. A forgotten deletion fails open.
- If a generator is used, its default seeds deny. A seed that allows without an exact-match
  opt-in is a fixture defect. A failing seed becomes a named fixture.
- Use opaque synthetic agent ids. Do not use real names, emails, phone numbers, contact
  graphs, credentials, calendar events, or provider accounts. Do not borrow Eric or Maria
  from the overview as fixture people.
- Keep relationship booleans, advertisements, permissions, and decision objects in
  separately typed fixtures. Do not reuse one object as another record.
- If a type-confusion fixture must contrast an email, use a reserved `example.test` value
  and do not store it as skill or policy state.
- Fixtures and CI artifacts must not contain raw remote instruction bodies, private
  context, or real personal data. No skipped fixture counts as `AC-QE-001` evidence.

`DEV-003` and security principle 12 require synthetic data only. This default-deny rule is
how that suite should avoid a fail-open fixture. It is still a recommendation about
fixture construction, not a Product Owner scope approval.

## Deferred claims

This strategy must not be cited as evidence for any of the following. A seam fake that
shows this module does not call the other domain is not that domain's acceptance.

### No context boolean computation

Deferred: simulated or real availability context, derivation of `available`, source
events, and any claim that `AC-AUTH-001` or `FR-006` is fully met. `FR-010` is untouched.
The disclosure schema may name a boolean. It must not contain one produced by this module.

### No approval persistence

Deferred: creating one pending approval, binding `FR-012` fields, expiry, single-use
release, rejection, and duplicate approval. `AC-APR-001` and `AC-APR-002` are Approval's.
An `ASK` decision with no stored approval is the only fact this suite may claim.

### No durability

Deferred: restart-stable permissions, restart-stable policy, and restart-stable
relationship authority. Process-local `readActive` may become `false` after a restart
without a new seed. The required oracle is fail-closed `DENY`, not survival of `ALLOW`.
Do not add PostgreSQL in order to close this gap. ADR-0004 still governs the first
persistent store when a later authorized module needs it.

### No messaging

Deferred: authenticated envelopes, payload-to-principal binding, integrity, replay,
idempotency, and transport uniformity. Injecting a trusted principal at a local seam does
not complete `SEC-001` or `AC-MSG-001`.

### Also deferred

Audit storage and `AC-AUD-001`. Two-node end-to-end disclosure. External AI. Query budgets
over availability results. The in-flight and pending-approval halves of `AC-REV-001`.

## Checks conditional on an unresolved Product Owner decision

Each item gives the gap, what verification does now, and what changes if the
recommendation is rejected. None of these items is Product Owner approval. Reserved items
stay outside pass/fail claims. Tests may assert the behavior is absent.

### Ordered pair

The directed boolean is approved. Which argument order policy must name is not stated by
that approval.

Verification now: exactly one order matches, and the reverse row is `DENY`.

Recommendation: name `readActive(authenticatedRequester, localTarget)`. If the Product
Owner names the opposite order, swap the call before implementation. Do not keep two
oracles, and do not treat either direction as sufficient.

### Who may create permissions

Reserved. Verification now asserts absence only: a remote message, an advertisement, a
relationship read, a Discovery result, and model text do not create a permission. The
suite does not pass or fail a local human, operator, or agent as the creator.

Recommendation: pre-seed through a trusted local path that ingress cannot call, and leave
the decision function unable to insert a permission. If the Product Owner later names a
different local actor, add an actor matrix before implementation. Do not add a remote
create path in this module.

### Interval timezone and horizon

Reserved by MVP scope. Verification now asserts absence: no timezone, DST, or horizon
branch is a pass, and those fields are extra fields that `DENY` without interpretation.
Schema size and type bounds may exist as engineering fail-closed limits. They are not a
product horizon.

Recommendation: keep the interval an opaque structured value on the skill contract until
the Product Owner decides instant versus half-open interval, timezone, and maximum
horizon. If that decision arrives, replace the interval oracle before implementation.
Do not hide a horizon constant in a test expectation now.

### Approval channel

Reserved. Verification now asserts absence on the `ASK` decision: no channel, notification,
polling handle, or persisted approval.

Recommendation: leave the channel, expiry, and owner-facing approval behavior to Approval
after its own Product Owner decision. Do not invent that channel in order to make `ASK`
observable beyond the decision enum.

### Fixed purpose vocabulary

MVP scope still leaves open whether purpose is fixed to `availability_check` or supplied
by the owner or requester. Mismatch remains `DENY` either way. Tests can use two synthetic
purpose tokens without declaring a product vocabulary.

Recommendation: fix the MVP purpose to one explicit token and ignore requester-supplied
replacements. If the Product Owner allows a supplied purpose, keep the permission binding
as the authority and still deny a mismatch. Requester text never widens purpose.

### Policy precedence beyond ambiguity

Threat-model policy precedence is unresolved. This plan uses the normative ambiguous case:
two effects `DENY`. It does not rank `ALLOW` above `ASK` or the reverse.

Recommendation: keep conflict as `DENY` until the Product Owner approves a precedence.
If a precedence is approved, replace the Ambiguous row before implementation and add abuse
cases for the effect that precedence would silently drop.

### In-flight revocation

`AC-REV-001` still marks in-flight boundary and latency `TBD-PO`. This suite stops at the
next decision. It does not define pending approvals or results computed but not delivered.

Recommendation: leave the MVP-scope preference with Approval and the later disclosure
check. That preference would invalidate pending and undelivered results without retracting
a result already delivered, but only after the Product Owner decides. Do not encode it as
a passing test here.

### Not conditional

Current `FR-003`, `SEC-004`, and `SEC-005` already forbid implied permission, remote
grants, and fail-open decisions. This plan must not relax those rules while a reserved
choice is open. A missing permission stays `DENY` whoever is later allowed to create one.
A timezone decision, if added later, still cannot come from remote text.

## Preparation exit

This document is a QE preparation artifact only. The risks, decision table, traceability,
ownership split, negative oracles, deny-by-default fixture recommendation, coverage bar,
and deferred claims are reviewable here. They are not implementation evidence, not a
Definition of Done, and not Product Owner acceptance. Functional work stays stopped until
explicit Human Product Owner authorization of the module scope.
