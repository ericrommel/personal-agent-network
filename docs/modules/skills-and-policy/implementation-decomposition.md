# Skills and Policy Implementation Decomposition

Status: Proposal only. No code authorized by this note.

Date: 2026-10-07
Owner role: Backend Engineer
Parent: Issue #8
Branch: `docs/skills-policy-preparation`
Baseline: `c4792b0c754daa8f50f7044b2f3bebb5cf51fbf8`

This note asks whether a small deterministic policy kernel fits the current TypeScript
modular monolith, and which files later agents would own without crossing the reserved
product decisions. It does not approve product scope, privacy semantics, or authorization
semantics. Preparation creates none of the source or test paths below. The Human Product
Owner has not authorized functional implementation by accepting this note.

## Answer

Yes. A pure deny-by-default evaluator can be added as an in-process module under
`src/modules/policy/` using the existing strict TypeScript project, `Result`, and Vitest.
It needs no new npm dependency, no PostgreSQL, no network route, no policy DSL, and no LLM
call. It must not change Identity or Discovery, and it must not import Discovery.

The pure evaluator can be implemented before Relationships source merges. This branch has
no `src/modules/relationships/` tree. Its only Relationships dependency is a boolean port
for one directed agent pair: fail closed, process-local, and current at the call. That is
a contract dependency, not a hard block. Unit tests satisfy the port with a fake. Binding
the real Relationships read waits until that source is present and is an integration step.

## Feasible now versus blocked

Feasible now means the design fits the current monolith and does not require a reserved
product decision. It still waits for explicit Product Owner authorization before any code
is written. This note is not that authorization.

### Feasible now, after authorization

- A pure function that maps already validated facts to exactly `ALLOW`, `ASK`, or `DENY`.
- An internal facts guard that uses Discovery's exact-object checks and coarse `Result`
  codes.
- An in-process policy service that loads relationship, advertisement, and permission
  facts through injected ports and returns only the decision enum.
- A boolean relationship port declared and faked inside the policy module.
- A separate skills-advertisement slice: local presence and one skill version, with no
  permission fields and no interval rules.
- Developer-owned unit tests collected by the current `tests/**/*.test.ts` include.

### Blocked

These reserved product decisions are hard blocks. No later agent owns them under this
note. Do not implement them in policy files or skills files.

- Granting permission authority to a remote caller. A request body, model output, or
  Discovery reference cannot create a permission, set the relationship bit, or advertise
  a skill.
- Choosing interval timezone, half-open semantics, or horizon. The kernel does not accept
  or interpret a time interval. `FR-004`'s availability calculation stays outside this
  slice.
- Implementing approval storage. `ASK` does not insert a pending approval, bind expiry, or
  release a result. That behavior stays with Approval.
- Returning anything except the decision enum from the kernel. No reason, interval,
  availability boolean, approval id, context, or explanation rides on the decision.

Also out of scope, and not a way around those blocks: a policy DSL, a database, a network
route, an LLM call, a new npm dependency, an edit to Identity or Discovery, or a Discovery
import from policy or skills.

## Dependency classes

Classes used below:

- **Hard.** Reserved or missing product behavior. Excluded from this slice. It does not
  block the pure evaluator.
- **Contract.** A stable interface is enough. The other module's source may be absent.
- **Implementation.** Code this slice would add after authorization. No external blocker.
- **Integration.** Wiring two real implementations after both exist.
- **None.** Not used, or already present and unchanged.

- **Toolchain.** Class: none. Strict TypeScript, Node `>=22.12 <25`, Vitest, Biome, and
  `src/shared/domain/result.ts` are already present.
- **New npm package, policy DSL, LLM, or HTTP route.** Class: none. Do not add one.
- **PostgreSQL, driver, migration, or database service.** Class: none. Do not add one.
  ADR-0004 still applies when a later module first needs durable state.
- **Discovery.** Class: none. Do not import `src/modules/discovery/`.
- **Identity public types and `parseAgentIdentityId`.** Class: contract. The service may
  import the existing public API. Do not edit Identity. The pure function does not import
  Identity.
- **Relationships boolean read for one directed pair.** Class: contract. Declare the port
  in the policy module and fake it in tests. Relationships source is not required.
- **Binding the real Relationships function.** Class: integration. One later adapter file,
  and only after that source is on the integration branch.
- **Advertisement presence and skill version.** Class: contract. The evaluator sees a
  fact. It does not need skills source to compile or to be unit tested.
- **Skills advertisement store.** Class: implementation. Parallel skills owner, after
  authorization. Not a blocker for the evaluator.
- **Explicit permission decision or absence.** Class: contract. Injected fact. The kernel
  does not grant it.
- **A real permission store or grantor.** Class: integration. Not this slice. A remote
  grant remains a hard block.
- **Pinned internal version tokens.** Class: contract. Provisional constants below. Not a
  wire standard.
- **Guard, pure evaluator, policy service, and policy tests.** Class: implementation.
  Policy owner, after authorization.
- **Interval timezone, half-open bounds, or horizon.** Class: hard. Reserved. Do not
  implement.
- **Approval storage and `ASK` side effects.** Class: hard. Reserved. Do not implement.
- **Any kernel return other than the decision enum.** Class: hard. Reserved. Do not
  implement.
- **A remote caller granting permission or advertisement.** Class: hard. Reserved. Do not
  implement.
- **Context boolean, disclosure, messaging, and audit storage.** Class: integration.
  Later modules. The kernel must not perform them.

Identity and Discovery are already implemented. `package.json` has no runtime
dependencies. `vitest.config.ts` already includes `tests/**/*.test.ts` and sets 100
percent coverage floors for Identity and Discovery. Those facts are why the kernel is
implementable here. They are not permission to start.

## Provisional internal evaluator contract

This contract is provisional. It is an internal engineering proposal for a later
authorized slice. It is not a public wire contract, not an ADR, and not Product Owner
approval. A breaking change after it is actually introduced needs a new version and
`AC-DEV-003` review. `DEV-004` applies when the constants exist in code, not because they
are written here.

The pure function takes one facts object and returns exactly one of `ALLOW`, `ASK`, or
`DENY`. It does not return `Result`, a reason, a wrapper object, or a derived
availability boolean.

Inputs:

- Current relationship boolean for one directed pair. Only the boolean `true` is current.
  The service obtains it from the boolean port. The request must not supply it.
- Advertisement presence and skill version, from the local advertisement port. Presence
  is not permission.
- Explicit permission decision or absence, from a local permission port. A present
  decision is `ALLOW`, `ASK`, or `DENY`, and it carries the purpose and scope that the
  local decision was bound to. Absence is not a decision to ask.
- Purpose and scope requested by the caller. These are comparison inputs, not authority.
- Policy version requested by the caller. It must equal the pinned kernel version.

The requested purpose cannot satisfy itself. The purpose and scope bound to the local
permission are part of that explicit decision. The requested purpose and scope are
separate fields. They must be equal to the bound values. The service must not copy the
requested purpose or scope onto the permission fact.

Provisional facts shape. The outer object has these exact keys and no others:

```text
contract: "pan.policy-facts/v1"
relationshipActive: boolean
advertisementPresent: boolean
skillVersion: string
permission: exact permission object
purpose: string
scope: string
policyVersion: string
```

`permission` is one of two exact objects. Absence has only `decision: "absent"`. An
explicit decision has only `decision` (`ALLOW`, `ASK`, or `DENY`), `purpose`, and `scope`.
Those bound purpose and scope come from the local permission port. The outer `purpose` and
`scope` come from the request. Mixing the keys of the two permission objects fails the
guard.

Provisional constants, reversible and internal:

- Facts contract: `pan.policy-facts/v1`
- Untrusted request contract: `pan.policy-request/v1`
- Pinned policy version: `pan.policy/v1`
- Pinned skill version: `pan.skill.availability/v1`

The untrusted request has only `contract`, `purpose`, `scope`, and `policyVersion`. It
has no relationship, advertisement, permission, interval, instruction, or decision field.
Extra keys fail validation. They are not stripped and then accepted.

The pure function imports neither Relationships nor Discovery. It performs no I/O, reads
no clock, and calls no model. Same facts always produce the same enum.

## Deny-by-default mapping

Relationship is a gate, not a permission. Advertisement is a gate, not a permission.
Neither one, nor both together, can select `ALLOW` or `ASK`.

The pure function returns `ALLOW` or `ASK` only when every line below is true. Otherwise
it returns `DENY`.

1. `policyVersion` equals `pan.policy/v1`.
2. `relationshipActive` is exactly `true`.
3. `advertisementPresent` is exactly `true`.
4. `skillVersion` equals `pan.skill.availability/v1`.
5. `permission` is the explicit object, and its `decision` is `ALLOW` or `ASK`.
6. Outer `purpose` and `permission.purpose` are the same token.
7. Outer `scope` and `permission.scope` are the same token.

When all seven hold, the result is that permission decision and nothing else. `ASK` stays
`ASK`. It is not promoted to `ALLOW`. `ALLOW` is not demoted to `ASK`.

Required deny cases:

- Relationship `false`, including when advertisement is present and the local permission
  says `ALLOW`. The relationship is still not the permission. The permission is not
  enough without the current relationship.
- Relationship `true`, advertisement present, permission `absent`. This is the
  `AC-DOM-001` case. The result is `DENY`, not `ASK`.
- Relationship `true`, advertisement absent, permission `ALLOW`. `DENY`.
- Skill version present but not the pinned version. `DENY`.
- Local permission `DENY`, even if every other gate matches. `DENY`.
- Purpose or scope mismatch. `DENY`. Do not trim, case-fold, or fuzzy-match. An empty
  value fails the guard, and the service still returns `DENY`.
- Policy version mismatch. `DENY`. Do not fall back to another policy.
- Any unexpected decision value that reaches the function. `DENY`.

The function does not read free text as instructions. It does not rank a list of rules.
Precedence among several permissions is not this kernel's job. The port must already have
resolved one explicit decision or absence. Ambiguous resolution is absence, and absence
is `DENY` (`SEC-005`).

The service calls the relationship port on every evaluation for the directed pair
`(requester, target)`. It does not cache `true`. It does not infer the reverse pair. It
does not treat a Discovery reference as an agent id. `parseAgentIdentityId` rejects
`pan_agent_ref_*`, and the service then returns `DENY` without consulting Discovery.

Only exact port results count, matching Discovery's use of exact `true`:

- Relationship port: `readActive(fromAgentId, toAgentId)` on the policy side returns
  `Promise<unknown>`. The approved Relationships read itself stays a boolean. Exact
  `true` or exact `false` only. A throw, `null`, `"true"`, `1`, or any object is not
  active. The service passes `false` into the facts and the evaluator returns `DENY`.
- Advertisement port: one exact record becomes presence `true` only when `agentId`
  matches the target, `skillVersion` is the pinned version, and `status` is `advertised`.
  The exact keys are `kind` (`skill-advertisement`), `id` (`pan_skill_ad_` plus a UUID
  v4), `agentId`, `skillVersion`, and `status` (`advertised` or `withdrawn`). Withdrawal,
  `null`, mismatch, and a throw become presence `false` or a dependency failure. Both end
  as `DENY`.
- Permission port: `null` is absence and becomes `{ decision: "absent" }`. An explicit
  decision must have exact keys `kind` (`skill-permission-decision`), `fromAgentId`,
  `toAgentId`, `skillVersion`, `decision` (`ALLOW`, `ASK`, or `DENY`), `purpose`, and
  `scope`. The pair and skill version must match the call. A throw or any other shape is
  a dependency failure. Both absence and failure end as `DENY`. The request body is never
  this port.

`FR-005` is only partly addressed. The service uses the authenticated requester and the
target to choose the directed read. The evaluator then sees relationship, skill,
purpose, scope, and policy version. This slice does not access context, so it does not
complete `FR-006` or `PRV-002`.

## Proposed future paths and exclusive ownership

Create these paths only after explicit Product Owner authorization to implement. Owners
below are later implementation agents. They do not share files. QE owns none of them.

### Policy kernel owner

- `src/modules/policy/index.ts`
- `src/modules/policy/contracts.ts`
- `src/modules/policy/ports.ts`
- `src/modules/policy/policy-service.ts`
- `src/modules/policy/domain/policy-facts.ts`
- `src/modules/policy/domain/evaluate-policy.ts`
- `tests/unit/modules/policy/policy-kernel.test.ts`

`evaluate-policy.ts` is the pure function. `policy-facts.ts` is the exact-shape guard.
`ports.ts` declares the relationship boolean port, the advertisement read port, and the
permission read port. It does not implement Relationships, skills storage, or a grant
API. `index.ts` exports the function, the guard, the service, the port types, and the
constants. It does not export a remote grant parser, and it does not re-export Identity,
Discovery, or Relationships.

The policy owner does not edit skills files, Identity, Discovery, `src/shared/`,
`src/main.ts`, `src/foundation.ts`, `package.json`, or `vitest.config.ts`.

### Skills advertisement owner

Parallel with the policy owner. No shared files.

- `src/modules/skills/index.ts`
- `src/modules/skills/contracts.ts`
- `src/modules/skills/ports.ts`
- `src/modules/skills/skill-advertisement-service.ts`
- `src/modules/skills/in-memory-skill-advertisement-store.ts`
- `src/modules/skills/domain/skill-advertisement.ts`
- `tests/unit/modules/skills/skill-advertisement.test.ts`

The advertisement record uses only the exact keys listed above. The id is `pan_skill_ad_`
plus a UUID v4 from `node:crypto` `randomUUID`. It has no permission, purpose, scope,
relationship, Discovery email, interval, timezone, or horizon field. Trusted local
commands may advertise or withdraw. A remote payload must not. Withdrawal is not
revocation of a permission, because this record is not a permission.

The skills owner does not import policy or Discovery, does not edit policy files, and
does not add the availability calculator.

### Later integration owner

Not parallel with the policy owner's first slice, and not before Relationships source is
on the branch being integrated.

- `src/adapters/policy/relationship-boolean-port.ts`

That file may adapt the approved Relationships boolean read onto the policy port. It is
the only Relationships import allowed by this proposal, and it is not required to
implement or test the evaluator. It must not change the evaluator's return type. If
Relationships source is still absent, this file is not created.

No agent owns a permission-grant file, an approval file, or an interval file. Suggested
future homes, unassigned and blocked here:

- Remote or local permission grants: not `src/modules/policy/`.
- Approval storage: not `src/modules/approval/` under this note.
- Interval evaluation: not `src/modules/skills/domain/`.

`vitest.config.ts` is shared. No parallel agent edits it. After the policy source exists,
one change adds a 100 percent branch, function, line, and statement floor for
`src/modules/policy/**`, matching Identity and Discovery. If the skills slice lands, that
same single change adds `src/modules/skills/**`. Preparation does not make that edit.
The existing global floors stay as they are.

Do not add `src/modules/skills-and-policy/`. ADR-0003 keeps Skills and
Authorization/Policy as separate boundaries. Do not put a shared facts type in
`src/shared/`. Each side re-validates `unknown` at its boundary so neither owner edits
the other's files.

## Test ownership

Developers own the tests for the code they implement. QE does not own, write, or complete
`tests/unit/modules/policy/policy-kernel.test.ts` or
`tests/unit/modules/skills/skill-advertisement.test.ts`. QE's later independent review is
outside this note and is not a reason to defer developer tests.

Tests land with the implementation. They use the existing Vitest run. They do not add a
dependency. Fixtures are synthetic. Names cite the acceptance ids they actually exercise.
The policy file must cover at least:

- Every deny row in the mapping, including relationship `true` plus advertisement `true`
  plus permission absence (`AC-DOM-001`, `FR-003`, `SEC-005`).
- The two success rows, `ALLOW` and `ASK`, and the rule that `ASK` is not stored.
- Exact-shape failures: extra keys, missing keys, arrays, wrong prototypes, accessors,
  thrown getters, string booleans, and instruction text (`AC-SEC-001`, `AC-VAL-001`).
- A request that contains `permissionDecision: "ALLOW"` while the permission port returns
  absence. The result is `DENY` (`SEC-004`).
- A Discovery-shaped reference used as a target. The result is `DENY`, and Discovery is
  not imported.
- A thrown relationship, advertisement, or permission port. The result is `DENY`
  (`REL-003`, `SEC-005`).
- Two calls with the same facts and no shared mutable state.

The skills file must cover independent advertisement state: creating an advertisement
does not create a permission, a relationship, or a Discovery grant, and a withdrawn
record reads as not present. It must not claim interval behavior.

Neither test file is acceptance evidence for `FR-004`, `FR-006`, `FR-007`, approval
expiry, or durable revocation across restart.

## Errors and validation

Follow Discovery. Domain failures use `Result` from `src/shared/domain/result.ts`. The
error object is a coarse code and nothing else, the same shape as
`{ code: "DISCOVERY_EMAIL_INVALID" }` and `{ code: "DISCOVERY_GRANT_INVALID" }`. Do not
attach a field name, agent id, purpose, scope, policy text, or payload fragment.

Internal codes, both `Readonly<{ code: string }>`:

- `POLICY_INPUT_INVALID` when an object, token, prototype, key set, or accessor fails.
- `POLICY_DEPENDENCY_FAILED` when a port throws or returns a value that is not one of its
  exact success shapes.

`parsePolicyFacts` returns `Result` of the facts object or `POLICY_INPUT_INVALID`.
`evaluatePolicy` does not return those codes. It returns only the enum. The service
method also returns only the enum. It maps a guard failure and a dependency failure to
`DENY` before returning, as Discovery maps email and dependency failures onto one
non-revealing negative result. Callers outside the module do not receive the coarse code.
Tests of the guard may observe it.

Validation rejects the whole object. It does not coerce, repair, or drop extra fields.

- Non-null, non-array objects only. Prototype is `Object.prototype` or null. Data
  properties only. String keys only. Exact expected keys. The same checks as
  `parseRequest` in `src/modules/discovery/discovery-service.ts` and `isExactRecord` in
  `src/modules/discovery/domain/discoverability-grant.ts`.
- A getter that throws is caught and fails closed.
- Purpose, scope, permission purpose, and permission scope use the token grammar
  `^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$`. Empty, over-long, whitespace, and non-ASCII values
  fail the guard. The kernel does not accept sentences or instructions.
- Skill version and policy version use that same token grammar, then must equal the
  pinned constants inside the evaluator.
- Constructed facts are frozen. The evaluator does not mutate them.
- There is no public parser from unknown JSON to `AuthenticatedAgentPrincipal` or to a
  trusted local command. Tests may cast a valid object, as Discovery tests do. The
  service rechecks the principal's exact keys, schema constant, `kind`, and agent id.
  It does not interpret `authenticatedAt` as a timezone.
- Unavailable security inputs produce `DENY`, not a partial allow (`SEC-005`, `REL-003`).

The kernel output is not a Discovery-style result object. Adding `contract` or `reason`
beside the enum would cross the reserved return-shape decision. The enum alone is the
success value.

## Persistence, Identity, and Discovery

No PostgreSQL. The evaluator has no store. The first advertisement adapter, if
authorized, is one process-local `Map` in the skills module, with the same restart limit
Discovery documents for its budget: one process, empty after restart, not durable
acceptance evidence. Restart means advertisement absence, which denies. It must not mean
a silent grant. `package.json` stays unchanged. ADR-0004 still names PostgreSQL for the
first later module that actually introduces durable transactional state. This kernel is
not that module.

No change to Identity. No change to Discovery. Policy and skills do not import Discovery.
Discovery continues to grant no relationship, skill access, or execution authority.
A relationship boolean continues to grant no skill permission.

## Risks and reversible assumptions

Risks:

- The enum is an internal decision. If a later agent returns it unchanged on a public
  response, `ASK` versus `DENY` can reveal that a private rule exists (`SEC-018`,
  `PRV-006`). Public disclosure is a later boundary. This kernel must not grow that body.
- A service that copies the requested purpose onto the permission fact would let the
  caller satisfy the equality check. The anti-copy test is blocking for that
  implementation.
- Caching an active relationship or an `ALLOW` would violate `REL-004`. The service reads
  the port on every call. The pure function has nowhere to cache.
- An empty permission or advertisement store must fail closed. Treating empty as `ALLOW`
  or `ASK` is an authorization bypass.
- In-memory advertisement state is not MVP evidence for durable revocation. ADR-0004
  already says in-memory state is not that evidence.
- `OBS-001` reason codes are not this kernel's return value. Adding them to the enum's
  container is reserved and blocked. Audit remains a later module.
- Two agents editing `vitest.config.ts`, `src/shared/`, or one policy file would collide.
  The ownership split above is the control.
- Importing Discovery, or encoding a Discovery reference as authority, would collapse
  boundaries ADR-0003 separates.
- Implementing the interval inside the skills module because the file is "the
  availability skill" would cross the reserved timezone, half-open, and horizon decision.
- Brand-only trust of a principal is insufficient. The runtime shape still has to match.
  There is no secret runtime token; brands are compile-time.

Reversible assumptions, if a later authorized design replaces them without changing the
deny-by-default rule:

- Eight exact outer fact keys, with the permission nested as one of two exact objects.
  A flat list would also work if the guard stays exact and absence does not invent a
  purpose.
- Token grammar copied from Discovery's correlation bound and shortened to 64
  characters. Widening it to free text needs a product and security decision.
- The four pinned strings: facts contract, request contract, policy version, and skill
  version.
- Requiring relationship `true` before an explicit `ALLOW` or `ASK` can pass. This
  recommends a reading of `FR-005`. It does not treat the relationship as permission. If
  the Product Owner later allows a permission with no relationship, only that conjunction
  changes.
- Duplicate structural checks at each boundary instead of a shared type file.
- Process-local advertisement storage inside the skills module until a durable module
  exists.
- A class for the service, matching `DiscoveryService`, and pure functions for the
  domain.
- One unit file per module, and no wiring in `src/main.ts` or `src/foundation.ts`.
- Case-sensitive equality with no trimming. The token grammar already excludes
  surrounding whitespace.
- One resolved permission decision per call, not a rule list and not a DSL.

These assumptions do not choose interval semantics, approval expiry, the purpose
vocabulary in MVP scope item 3, or who may grant a local permission. The kernel compares
opaque purpose and scope tokens. It does not fix the vocabulary to `availability_check`,
and it does not define a grantor.

## Authorization gate

Implementation is not authorized. Do not add the paths above, do not add a dependency,
and do not treat this note as Product Owner approval. The pure evaluator remains feasible
before Relationships source merges because its only Relationships dependency is the
boolean port. That dependency is contractual, not hard. The reserved remote-grant,
interval, approval-storage, and non-enum return work stays blocked regardless.
