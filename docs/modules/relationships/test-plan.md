# Relationships Test Plan

## Purpose, scope, and ownership

This plan is preparation for Issue #7 and QE subtask #24. It does not authorize functional
implementation, infer Human Product Owner approval, or move the module to Ready for Development.
Relationships is not implemented. None of these tests exists until implementation is separately
authorized.

After that authorization, the Backend Engineer owns the unit, component, contract, and integration
tests, including fixtures, coverage configuration, and regression fixes. QE owns this risk model,
traceability and coverage review, independent sampling, and exploratory verification. QE checks do
not substitute for developer tests, and QE must not implement missing ones. Security owns
trust-boundary review; this plan does not replace that review.

When tests exist, their names include the applicable `AC-*` identifier. A skipped or quarantined
test is not acceptance evidence.

## Planning baseline

The working recommendations in Issue #24 are the planning baseline. They are not Product Owner
approval. Checks that change if a recommendation is rejected are marked conditional later in this
plan.

- Records are pre-seeded, directed, and local to the storing node.
- The only states are `active` and `revoked`.
- There is no invitation or acceptance flow.
- A relationship implies no discovery, skill, permission, context, or execution authority.

These unapproved oracles make that baseline testable without a second product:

- Endpoints are Agent Identity IDs. A reciprocal relationship is a second ordered record, not a flag
  on the first.
- Only a trusted local control path may seed or revoke a record. A remote message, Discovery
  reference or grant, or model output is not a command.
- The next authoritative read after a successful revoke is not `active`.

`FR-003` and `AC-DOM-001` already require separate records and no implied permission. That
separation is not an open Product Owner choice.

## Ranked product and abuse risks

Ranks are by impact. Ranks 1 through 4 block later acceptance if they fail. A lower rank still
blocks when the authorized slice exposes that behavior.

### 1. Relationship state becomes authority

An `active` relationship is treated as a Discovery grant, skill advertisement, skill permission,
context access, trust, or execution authority. The same failure occurs when those records are
accepted as a relationship. This is a confused-deputy and authorization-bypass risk. It violates
`FR-003` and `AC-DOM-001`.

### 2. Revoked or stale state is still usable

A successful revoke is followed by an `active` read from a cache, a duplicate row, a snapshot reused
as a capability, a failed commit reported as success, or a restart that reloads the original
`active` seed. Later decisions could keep using it. This is the relationship contribution to
`FR-009`, `SEC-009`, `REL-001`, `REL-004`, and `AC-REV-001`. Decision-time and pre-disclosure checks
are deferred below.

### 3. Direction, party, or creator is wrong

A one-direction record is treated as reciprocal. A lookup succeeds for a third agent, a sibling
agent of the same human, or a swapped pair. An untrusted remote caller creates or revokes a record,
including with a Discovery reference. The impact is self-grant or destruction of someone else's
local relationship. The baseline forbids both.

### 4. Missing or failed dependencies fail open

A missing pair, unknown state, malformed record, ambiguous duplicate, timeout, or unavailable
identity or store dependency returns `active` or another authority-bearing result. Unavailable
security state must not become access (`REL-003`). A failed revoke must not be reported as a
successful revoke.

### 5. Relationship existence leaks

A list, search, error, log, or Discovery result reveals whether a relationship exists, who the other
party is, or why it was revoked. The baseline has no public relationship directory. Accepted
Discovery behavior must still hide relationship state. Durable audit redaction remains deferred to
Audit.

### 6. Unapproved lifecycle becomes an abuse surface

Invitation, mutual, human-level, or self-reactivating lifecycles would invalidate the oracles above
and add abuse cases this suite does not cover. Treating those cases as already approved would hide
an unresolved product decision. They stay conditional and outside the default suite.

## Traceability

In-scope evidence is only a Relationships contribution. It does not complete the deferred evidence,
and it does not show that the module is implemented.

### `FR-003` and `AC-DOM-001`

In scope: relationship state is a distinct typed record. Seeding, reading, or revoking it does not
create or mutate a Discovery grant, skill advertisement, or permission. Its result is not an
authorization decision. An `active` relationship alone is not permission.

Deferred: the full criterion also needs an advertised availability skill and an invocation with no
matching permission. Skills and Authorization own that execution. This module does not inherit a
completion claim from Identity's structural evidence.

### `FR-009` and `AC-REV-001`

In scope: trusted local revocation moves a baseline relationship to `revoked`, and later
authoritative reads on that node do not return `active`.

Deferred: revoking a skill-permission grant, denying a later request, invalidating a pending
approval, and the final check before disclosure. `AC-REV-001` still has an unresolved in-flight
boundary and latency decision. This module must not claim that the criterion is met.

### `SEC-009`

In scope: the module exposes current local state, does not serve a stale `active` result after a
successful revoke, and does not treat an indeterminate read as `active`.

Deferred: the authorization check at decision time, cache invalidation inside Authorization, and the
re-check immediately before context access or disclosure. Those call sites are not part of this
module.

### `REL-001`

In scope: a successful revoke changes the state seen by the next authoritative read in the same
process.

Deferred: effect on later authorization decisions, in-flight work, and pending approvals. Restart
durability is conditional. It is not a default pass.

### `REL-003`

In scope: invalid parties, unsupported states, malformed records, and unavailable identity or
relationship-store dependencies fail closed. Failure does not yield `active`, does not report a
successful revoke, and does not mutate another domain.

Deferred: malformed messaging envelopes and unavailable policy dependencies during a live request.
Those belong to Messaging and Authorization. This module covers only the relationship-store
contribution.

### `REL-004`

In scope: state from this module is current relationship data, not a cached grant. A read snapshot
is not a capability and is not a permission. If a cache is introduced, revoke invalidates it before
the next `active` answer. No cache is the preferred baseline, and tests must lock whichever choice
is implemented.

Deferred: Authorization consulting this state, rather than a stale grant, at decision time. That
integration is not evidence for this module.

### `AC-QE-001`

In scope after implementation is authorized: synthetic fixtures only; relationship revocation;
malformed relationship input; a repeated local command that must not restore `active`; no
relationship directory; untrusted text that must not change relationship state.

Not completion of this criterion: `ALLOW`, `ASK`, and `DENY` outcomes, network replay, Discovery
enumeration timing, and end-to-end prompt injection. Later suites still need those classes.
Relationship tests are not a citation for them.

## Future developer-owned tests

The Backend Engineer adds these tests only after implementation is authorized. QE reviews them and
does not author them. Names include `AC-DOM-001`, `AC-REV-001`, or `AC-QE-001` where that criterion
is actually exercised.

### Domain and transition tests

Cover every baseline branch with one table:

- seeding `active` for ordered pair A to B makes an exact read `active`;
- the reverse pair stays missing, not `active`, unless a second record exists;
- seeding or revoking B to A does not change A to B;
- a missing pair, a third party, a swapped pair, and a sibling agent are not `active`;
- a Human Identity ID, Discovery reference, Discovery grant ID, skill ID, or permission ID is
  rejected as an endpoint;
- a pair that uses the same agent twice is rejected and stores nothing;
- unknown states, including invitation-like states, are rejected;
- the same record does not move from `revoked` back to `active`;
- a second `active` row for one ordered pair fails closed on read, not as `active`;
- relationship operations do not call identity mutation, Discovery grant mutation, skill
  advertisement, or permission ports.

### Component and contract tests

Drive the application port through fakes for identity lookup, the relationship store, clock, and the
local control gate:

- trusted local seed and revoke are the only mutating commands;
- a remote payload, Discovery reference, Discovery grant, or free-text instruction cannot seed,
  activate, or revoke, and its text has no authority;
- repeating revoke is deterministic and never restores `active`;
- revoking a missing pair creates no record, leaves the pair not `active`, and does not report that
  an `active` relationship was revoked;
- the read result cannot be supplied where a Discovery grant, skill advertisement, permission, or
  `ALLOW`, `ASK`, or `DENY` decision is required;
- unexpected fields are rejected, including embedded permission, skill, trust, or disclosure fields;
- if a versioned relationship contract is exported, cover that contract under `AC-DEV-003`. Do not
  add a public HTTP contract to satisfy this plan.

### Failure, staleness, and concurrency tests

- If identity lookup is unavailable, unknown, or malformed, do not seed and do not read `active`.
- On store timeout, throw, malformed row, or indeterminate result, the read is not `active` and
  revoke does not report success.
- A failed revoke commit leaves the prior `active` record and is not reported as `revoked`.
- After a revoke acknowledgement, a later read is not `active`. A race may observe the old state
  only until that acknowledgement.
- A value returned before revoke is not a reusable capability.
- With no cache, assert that no second store can still return `active`.
- With a cache, assert that an acknowledged revoke cannot be read back as `active`.
- Same-process restart behavior follows the durability rule below. Do not call an in-memory adapter
  crash-durable unless that rule was authorized.

### Coverage configuration

When implementation is authorized, state-transition and revocation decision files need 100% branch,
line, statement, and function coverage. That is the quality-strategy bar for a revocation module.
Other relationship code stays at the repository defaults, 80% lines, statements, and functions and
75% branches, unless it can choose `active`. Limit exclusions to generated, configuration, or
type-only code and review them. The Backend Engineer owns this configuration. Preparation does not
change the test runner.

## Independent QE checks

These checks start after developer tests exist. They do not replace those tests.

- Trace every in-scope behavior to a developer test and to a requirement or acceptance ID. Missing
  developer coverage is a blocking review finding, not work for QE to code.
- Inspect fixtures against the synthetic-fixture rules and `AC-QE-001`.
- Sample the decision table instead of trusting a green suite: missing, `active`, `revoked`,
  reversed direction, both directions, wrong party, sibling agent, type-confused inputs, and each
  fail-closed dependency.
- Show that assertions fail if direction is ignored, revoke is a no-op, a missing pair returns
  `active`, or a Discovery grant parses as a relationship. A temporary perturbation may show this.
  The permanent regression stays developer-owned.
- Review coverage exclusions. Confirm relationship tests do not weaken accepted Discovery privacy
  behavior or Identity separation.
- After an authorized build exists, explore command order, concurrent revoke and read, replay of a
  local revoke, payload creation, and logs or errors that echo payloads, party graphs, or permission
  data.
- Report only a bounded Relationships contribution. Do not report `AC-DOM-001`, `AC-REV-001`,
  `SEC-009`, `REL-001`, or `REL-004` as fully met.
- Do not change Issue #7 state. This plan is not Product Owner acceptance.

## Negative and edge cases

Each case needs a developer-owned automated test under the baseline. QE samples that test. Expected
results use the unapproved oracles in this plan.

### Missing relationship

An exact read for a pair with no record is not `active`, creates nothing, and is not permission.
Revoking that pair also creates nothing. IDs: `FR-003`, `REL-003`, `AC-DOM-001`, and `AC-QE-001`.

### Revoked relationship

After an acknowledged local revoke, every later authoritative read of that ordered pair is not
`active`. The revoke grants nothing and does not alter a Discovery grant, skill advertisement, or
permission. A second revoke does not restore `active`. IDs: `FR-009`, `SEC-009`, `REL-001`,
`REL-004`, and `AC-REV-001`.

### Reciprocal versus one-direction confusion

A to B does not satisfy B to A. Seeding or revoking one direction leaves the other unchanged. Two
directions require two explicit records. Neither direction is permission. IDs: `FR-003` and
`AC-DOM-001`. This oracle changes if an undirected model is approved.

### Wrong party

A stored record is not returned for a third agent, a swapped endpoint, a Human ID, or another agent
owned by the same human. The failed lookup does not change stored endpoints. IDs: `FR-003`,
`REL-003`, and `AC-DOM-001`. This oracle changes if human-level or inherited relationships are
approved.

### Stale read

Do not return `active` from a cache or duplicate row after an acknowledged revoke. A pre-revoke
snapshot cannot be submitted as authority. An uncommitted or failed revoke still reads `active` and
is not success. IDs: `SEC-009`, `REL-001`, `REL-004`, and `AC-REV-001`. Cross-request enforcement
remains deferred.

### Type confusion with a Discovery grant or skill permission

Reject a Discovery grant, Discovery reference, skill advertisement, or permission as a relationship
record, ID, or state. A shared word such as `active` is not sufficient. Relationship writes do not
change those stores, and a relationship result is not acceptable at their ports. IDs: `FR-003`,
`AC-DOM-001`, and `AC-QE-001`.

### Untrusted remote creator

A remote message, a forged local command inside a payload, Discovery success, or text that says to
ignore policy cannot seed, activate, or revoke. The attempt has no domain side effect. This is only
the relationship contribution to injection and replay resistance. Network replay is deferred to
Messaging. IDs: `AC-QE-001`, `REL-003`, and the side-effect part of `AC-DOM-001`. An invitation
creator is conditional.

### Fail-closed dependency behavior

Unknown or unavailable identity validation, a store timeout or error, a malformed or oversized
record, a schema or version mismatch, and ambiguous duplicate `active` rows each produce no `active`
read and no false revoke success. No partial write creates a permission or a Discovery grant. IDs:
`REL-003` and `AC-QE-001`.

### Further edges in the same developer table

- Reject empty, malformed, and cross-kind identifiers. Do not mint a second identifier grammar
  beside Identity.
- Do not cascade agent disablement into relationship revocation. Cross-domain status changes stay
  separate writes unless a later approved requirement adds a cascade.
- Do not expose list, prefix, wildcard, or directory operations.
- Do not echo a rejected payload in an error or a log.

## Synthetic fixture rules

`AC-QE-001`, `DEV-003`, and the security principles require synthetic data only.

- Use opaque synthetic Agent and Human IDs. Do not use real names, emails, phone numbers, contact
  graphs, credentials, calendar events, or provider accounts.
- Do not invent production-shaped secrets. Relationship fixtures do not need email. If a
  type-confusion fixture must contrast one, use a reserved `example.test` value and do not store it
  as relationship state.
- Keep Discovery grants, skill advertisements, and permissions in separately typed fixtures. Do not
  reuse those objects as relationship rows.
- Include the negative cases above, not only an `active` pair. When a generator is used, a failing
  seed becomes a named fixture.
- Fixtures and CI artifacts must not contain rejected payload bodies, raw private context, or real
  personal data. Synthetic IDs must be obviously fake.
- No skipped fixture counts as `AC-QE-001` evidence.

## Evidence deferred to later modules

This evidence cannot exist until those modules are authorized. A seam fake may show that
Relationships does not call the other domain. That fake is not the other module's acceptance
evidence. Do not stub the behavior and call the requirement complete.

### Skills

A real advertised availability skill is deferred. So is evidence that changing that advertisement
leaves the relationship unchanged, and that changing the relationship leaves the advertisement
unchanged, using real skill records. The remaining `AC-DOM-001` case is also deferred: invocation
stays denied when a relationship and an advertisement exist and no matching permission exists.

### Messaging

Deferred evidence is an authenticated, integrity-protected envelope that still cannot create or
revoke a relationship, including a spoofed, misdirected, stale, or replayed envelope. Payload
identity is still not a local control path. Completing `SEC-001` or `AC-SEC-001` is out of scope
here. The port-level creator tests above are a prelude, not Messaging acceptance.

### Approval

Deferred evidence is that revocation invalidates an applicable pending approval, as required by
`AC-REV-001`, and that a relationship change does not create a duplicate or replayed approval.
In-flight `ASK` behavior also waits on the unresolved latency decision.

### Audit

Deferred evidence is that an authorized operator can reconstruct seed and revoke by correlation ID
without raw private context (`AC-AUD-001`). Access, retention, export, and deletion remain `TBD-PO`.
This module must not create that durable audit log. A minimized local error is not Audit acceptance.

### Also deferred: Authorization and context disclosure

`FR-009`, `SEC-009`, `REL-001`, and `REL-004` stay incomplete until Authorization evaluates current
relationship state at decision time and again before disclosure, and until a stale cached grant
cannot release context. The public `DENY` shape is deferred too. Relationships supplies state only.

## Checks conditional on an unresolved Product Owner decision

Each item gives the gap, the verification used now, and what changes if the recommendation is
rejected. None of these items is Product Owner approval.

### Party type and direction

Issue #7 names Personal Agents and humans, which does not fix one oracle. Baseline tests use a
directed Agent-to-Agent pair. One direction does not imply the other, and a sibling agent does not
inherit the record.

Recommendation: keep that oracle. If the Product Owner chooses human-to-human, undirected, or
inherited relationships, replace the decision table before implementation. Do not keep two expected
results. Inherited access for a sibling agent is a new authority rule and needs its own abuse cases.

### Invitation and acceptance

MVP scope still leaves pre-seeding versus an invitation flow open. Baseline tests assert that no
invite, accept, decline, or pending state exists and that no remote acceptance command exists.

Recommendation: keep pre-seeded records and no invitation flow. If that choice is rejected, stop
this suite. Add a new plan for unsolicited invites, wrong-party acceptance, acceptance by remote
text, and expiry. Product Design is not assigned to that flow.

### Discovery reference as seeding input

Issue #7 keeps a Discovery reference non-authoritative for relationship creation unless a later
Product Owner decision says otherwise. Tests reject the reference as command input and as a party
ID.

Recommendation: keep that rejection. If a reference may later be only a local hint, test it only on
the trusted local path. It still has no remote authority and implies no permission.

### Who may revoke a local record

Baseline tests allow revoke only through trusted local control on the storing node. A remote party
cannot revoke that copy. A finer split between source and target owners is not claimed.

Recommendation: keep one owner boundary per node, with that local control path able to revoke local
records. If only the source owner or only the target owner may revoke, add an actor matrix before
implementation. Do not add a cross-node revoke protocol in this module.

### Recreation after revoke

Baseline tests forbid returning the same record to `active`. A second `active` row is ambiguous, not
a successful read.

Recommendation: do not reactivate a relationship in this module. If a later explicit re-seed is
approved, require a new write, keep the revoked history distinguishable for a future Audit module,
and still create no permission.

### Revocation durability

Same-process freshness is always required. An in-memory adapter does not prove survival across
restart, and the evidence must say that. A startup path that reloads a static `active` seed after a
revoke fails the revocation oracle.

Recommendation: claim only same-process subsequent reads until the authorized design makes
revocation durable. If the Product Owner requires crash survival, in-memory tests are not enough and
the developer suite needs a durable-adapter test. Do not add PostgreSQL during preparation in order
to close this gap.

### In-flight boundary and latency

`AC-REV-001` marks the in-flight boundary and latency `TBD-PO`. Relationship tests stop at the next
authoritative local read. They do not define pending approvals or results that were computed but not
delivered.

Recommendation: leave the MVP-scope preference with Authorization and Approval. That preference
would invalidate pending and undelivered results without retracting a result already delivered, but
only after the Product Owner decides. Do not encode it as a passing Relationships test.

### Remote disclosure of relationship existence

Baseline tests assert that this module has no remote read, list, or directory, and that relationship
changes add no relationship data to Discovery results.

Recommendation: keep relationship queries local. If remote status is later approved, uniform
non-revealing responses become a new privacy suite. That suite blocks an implementation that
discloses the graph.

### Not conditional

Current `FR-003` and `AC-DOM-001` already forbid implied permission. This plan must not relax that
rule. A cascade from agent disablement to relationship revocation is also out of scope unless a
later approved requirement adds it.

## Coordinator consistency resolutions

The Engineering Coordinator added this section after the QE plan, the Backend decomposition,
and the module specification were compared. It does not replace the QE analysis.

- The same relationship row never returns to `active`. A later trusted local create for that
  ordered pair allocates a new id and replaces the stored row. That keeps a mistaken revoke
  correctable inside the pre-seeded baseline. QE's conditional "do not re-seed" alternative
  stays recorded above. The resolved oracle for a future developer test is: old id stays
  unusable, new id is a new explicit seed, and two `active` rows for one direction never
  exist.
- A revoke whose store write does not complete leaves the prior `active` row and does not
  report success. If the write has stored `revoked` and only the non-durable observer
  throws, the row stays `revoked` and the command still reports revoked. Create rolls back
  when its observer throws. Restoring authority after a completed revoke would be the worse
  failure.
- The baseline stores no label and no email. `readActive` returns a boolean only.
- Minimized events omit party ids and relationship ids.

## Preparation exit

This document is a QE preparation artifact only. The risks, mapping, ownership split, negative
cases, fixture rules, deferred evidence, and conditional checks are reviewable here. They are not
implementation evidence, not a Definition of Done, and not Product Owner acceptance. Functional work
stays stopped until explicit Human Product Owner authorization of the module scope.
