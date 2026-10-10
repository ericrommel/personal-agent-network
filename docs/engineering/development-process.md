# PAN Development Process

The Human Product Owner authorized delegated autonomous delivery on 2026-10-07.
Product Owner checkpoints are asynchronous review points. They are not default
stop-the-line gates.

The default behavior is: continue unless the work is explicitly unsafe or a
Reserved Product Decision. Human absence is not a pause and not a rejection.
Do not rewrite history to imply that Human Product Owner approval happened
earlier than it did.

Normative detail for triggers, merging, and the review queue lives in this
document. `AGENTS.md` is the role guide. `docs/product/review-queue.md` is the
queue the Human Product Owner can read after being away.

## Delegated authority

Engineering may, without another synchronous Product Owner approval:

- prepare modules and create module subtasks;
- make low-level technical decisions and reversible product-detail decisions;
- implement, test, review, and merge engineering-complete work inside this
  authority;
- start later modules, refactor internal implementation, and add provisional
  internal contracts, adapters, and internal infrastructure;
- fix defects, add regression tests, and reallocate specialists;
- progress independent modules at the same time.

Do not wait for Product Owner approval only because a module reaches a former
`Ready for PO` or `Ready for PO Acceptance` checkpoint. Record the checkpoint,
record autonomous decisions, and continue when the work remains inside
delegated authority.

Reversible product-detail decisions use the default decision rule below and are
written to the module decision log. That log is the ExecPlan section
`Discoveries and decision log`.

## Reserved Product Decisions

Stop only the affected workstream when a decision materially changes one or
more of these:

- what private information may cross an owner boundary;
- who can discover whom;
- who may authorize, approve, revoke, or act;
- consent semantics;
- relationship semantics in a materially user-visible way;
- autonomous execution authority;
- payment, purchase, or external side effects;
- irreversible or broadly user-visible privacy behavior;
- trust boundaries;
- externally visible protocol semantics that would be expensive to reverse;
- core MVP scope;
- a previously accepted Human Product Owner principle.

When one appears:

1. Document the exact decision.
2. Recommend one option.
3. Document alternatives.
4. Document product, privacy, and security implications.
5. Identify affected modules and workstreams.
6. Identify reversibility.
7. Isolate only the blocked portion.
8. Continue every independent workstream.
9. Redirect blocked agents to useful work.
10. Add or update the Product Review Queue item.

A Reserved Product Decision is not a project-wide stop. Critical security
findings are a separate automatic stop for the affected merge or deployment
path. See Security below.

## Default decision rule

When a decision is ambiguous and is not Reserved, choose the option that is:

1. most privacy-preserving;
2. least authoritative;
3. easiest to reverse;
4. smallest in scope;
5. easiest to test;
6. least coupled to future modules.

Record it in the module decision log and, when it is significant, in the
Product Review Queue as `PO review pending`. Do not escalate minor
implementation choices.

## Binding principles

These remain binding unless the Human Product Owner explicitly changes them.
Agents may not override them:

- an LLM is not a Personal Agent;
- Discovery, Identity, Trust, Relationship, Consent, Permission, and Execution
  Authority are distinct;
- remote messages are untrusted input;
- discovery does not grant authority;
- a relationship does not grant skill, context, tool, or execution authority;
- disclosure is minimal;
- uncertain security or privacy state fails closed;
- durable identity and relationship models stay provider-neutral;
- do not invent an unnecessary proprietary cryptographic protocol;
- the MVP proves that two independently controlled Personal Agents can exchange
  a useful result derived from private context without exposing raw private
  context.

## Delivery states

```text
Backlog
  -> In Preparation
  -> Ready for Review
  -> In Development
  -> Code Review
  -> Testing
  -> Engineering Accepted
  -> Done
```

`Ready for Review` records that preparation is coherent enough for asynchronous
Human Product Owner review. It does not stop implementation when no Reserved
Product Decision is open.

A module may move to `Done` without waiting for immediate Human Product Owner
review when all of the following are true:

- the work is inside delegated authority;
- developer tests pass;
- required coverage passes;
- required CI passes;
- required architecture review passes;
- required Security and Privacy review passes;
- QE review passes;
- no blocking review thread remains;
- no Reserved Product Decision is bypassed;
- deferred limitations are explicit;
- no later-module scope was silently introduced.

The Human Product Owner may later ratify the result, request follow-up, reopen
a decision, or change future direction. `Done` means engineering acceptance
under delegated authority. The queue item stays `PO review pending` until the
Human Product Owner ratifies it. Ratification is not backdated.

Each functional module has one GitHub tracking Issue before preparation
begins. The roadmap is Issue #15. Until Project board write access exists, the
module Issue records the current state. Pull Requests do not replace that
Issue. Maintenance and dependency Pull Requests do not advance functional
module state. A roadmap entry, specification, or future-facing design does not
by itself authorize crossing a Reserved Product Decision.

## Product Review Queue

Maintain one lightweight queue at `docs/product/review-queue.md` and on the
GitHub Issue linked from that file. For every completed module or significant
autonomous product decision, record:

- module;
- decision;
- recommendation chosen;
- reason;
- alternatives rejected;
- security and privacy impact;
- reversibility;
- implementation status;
- tests and evidence;
- residual risks;
- deferred limitations;
- Human Product Owner review status.

The queue must be readable after several days without reconstructing
repository history.

## Pipeline and dependencies

Do not work modules only one at a time. Keep later stages moving while the
critical path moves.

Classify every dependency as one of:

- hard dependency: the downstream behavior is unsafe or meaningless until this
  exists;
- contract dependency: a stable interface or semantic is enough to proceed;
- implementation dependency: code structure can be provisional;
- integration dependency: only the end-to-end demonstration needs it;
- no dependency.

Only a hard dependency fully blocks a workstream. Do not block a downstream
module only because an upstream module is not `Done`, when the required
contract is already stable enough. Mark provisional contracts and isolate the
assumption with tests.

Speculative work is allowed when the contract is marked provisional, it does
not cross a Reserved Product Decision, revision is inexpensive, assumptions
are explicit, and tests isolate the assumption. If a later decision changes
the assumption, update the implementation.

Issue #14's bounded ADR-0008 slice is Done. A broader external-AI platform is
not authorized.

## Parallel work and subtasks

The Engineering Coordinator allocates real work to specialists. Do not invent
tasks only to increase agent count. Use the maximum safe parallelism.

Typical specialists are Product Analyst, Software Architect, Security and
Privacy, Backend, Quality Engineer, DevOps or Platform, and Product Designer
when the user-facing surface needs it. Multiple Backend agents are appropriate
when file or component ownership does not overlap.

Each major module should have one parent Issue and subtasks for preparation,
implementation, Security review, QE verification, and integration. Each
subtask names its role, objective, owned files, scope, non-goals,
dependencies, blocking assumptions, expected evidence, and merge or
integration dependency.

When a subtask completes, record evidence, update the parent, start newly
unblocked work, and reassign the finished agent. When an agent is blocked or
finishes early, assign the next useful role-appropriate task. Priority is
critical-path implementation, defect fixes, security-sensitive work, QE
evidence, next-module preparation, downstream analysis, then documentation
cleanup.

If a specialist times out or fails, retry once with a smaller task. If that
fails, split the task and reassign it. The Coordinator writes the missing
artifact only as a last resort and records the loss of independent review. A
timeout does not freeze the module.

## Tests, security, and defects

Developers own the tests for the code they implement. QE independently
verifies requirement coverage, boundaries, negative cases, test quality,
missing scenarios, and whether claims match the evidence. QE does not become
the default author of implementation tests.

When QE or Security finds a defect, the responsible developer fixes it, adds a
regression test, reruns the affected verification, and gets a re-review. Do
not wait for Product Owner approval unless the fix changes Reserved Product
semantics.

Security and Privacy review starts as soon as it is useful, especially for
trust boundaries, untrusted input, disclosure, mutation authority, stale
state, revocation, malformed runtime values, prototype or object-shape abuse,
fail-open behavior, a relationship accidentally becoming permission, capability
escalation, and audit leakage. A final independent Security and Privacy review
is required before `Engineering Accepted` when the module touches those
boundaries.

A critical trust, authority, privacy, or disclosure flaw blocks the affected
merge and deployment path. Isolate the affected components, open remediation,
continue unrelated modules, and add the finding to the Product Review Queue.
Engineering does not autonomously accept that class of finding. Explicit Human
Product Owner acceptance, with security advice and a recorded rationale,
remains required to waive it.

## Branches and merging

- Never modify or commit directly on `main`.
- Use `feat/<capability>`, `fix/<defect>`, `security/<control>`,
  `docs/<topic>`, or `chore/<task>`.
- Keep commits focused. Use imperative subjects.
- The repository merge method is squash merge through a Pull Request.
- Do not force-push shared branches.

The Engineering Coordinator may merge engineering-complete work when required
CI passes, required reviews pass, no unresolved blocking review thread
remains, no Reserved Product Decision is bypassed, and the merge comment is
present. Human Product Owner merge action is not required.

Before merging, leave a persistent Pull Request comment that starts with
`Role: <project role>` and records the merge decision and gate evidence.

When CI is running, do other useful work. When CI fails, fix it, add
regression coverage when appropriate, and rerun. Do not escalate routine CI
failures. When CI and reviews pass, merge if no blocker remains, update the
linked Issues, and activate newly unblocked work.

A technical review change that does not alter Reserved Product semantics is
implemented without Product Owner approval.

## Autonomous triggers

These are mandatory. Unless a Reserved Product Decision or a critical
security stop applies, perform the action.

1. Subtask completed: record evidence, update the parent, start unblocked
   work, reassign the agent.
2. Upstream contract stable: unblock dependent preparation and safe
   implementation. Mark provisional assumptions. Do not wait for final Human
   Product Owner review of a contract dependency.
3. Pull Request opened: run CI and start applicable Security, architecture,
   and QE review. The author does not sit idle.
4. CI running: use the wait for other implementation, preparation, review, or
   documentation.
5. CI passes: merge when the merge rule is met, then update Issues and start
   newly unblocked work.
6. CI fails: assign, fix, add regression coverage when appropriate, rerun, and
   continue unrelated work.
7. Security or QE defect: developer fixes, adds a regression test, reruns, and
   gets a re-review.
8. Non-reserved technical review change: implement it and update evidence.
9. Engineering-complete module: mark `Engineering Accepted`, merge remaining
   engineering-complete Pull Requests, move the module to `Done`, set the
   queue item to `PO review pending`, and activate the next useful work.
10. Former Ready for PO checkpoint: if nothing is Reserved, record it and
    continue. If something is Reserved, queue it and block only that work.
11. Reserved Product Decision: document it, recommend one option, block only
    the dependent work, and continue the rest.
12. Agent blocked: record the blocker and assign other useful work.
13. Agent finishes early: steal work in the priority order in Parallel work.
14. Specialist timeout: retry once smaller, then split and reassign. Record
    lost independent review. Do not freeze the module.
15. Current module has no useful unblocked work: move agents downstream.
16. Downstream module has enough stable semantics: start safe preparation.
    Only hard dependencies fully block.
17. Module has no Reserved Product Decision: implementation may start. Record
    the autonomous decision.
18. Implementation starts: run independent domain, service, adapter, test,
    Security, QE, and integration work concurrently where ownership is safe.
19. Merge completes: update Issues, check the parent, close finished subtasks,
    and activate newly unblocked work.
20. Module `Done`: update the queue, roadmap, and dependency state, then
    activate the next modules.
21. Human Product Owner absent: delegated authority stays active.
22. Human Product Owner returns: deliver the queue and status. Do not stop
    safe work unless explicitly paused.
23. Human Product Owner changes a decision: analyze impact, open corrective
    tasks, prioritize by product and security impact, and continue unaffected
    work.
24. Critical security finding: block the affected path, remediate, continue
    unrelated safe modules, and queue the finding.
25. Critical path idle: inspect why. Reallocate, split, or decide technical
    choices. An avoidable idle critical path is a process defect.

## Scheduling loop

Repeat this loop until stopping is honest:

1. Inspect active work.
2. Inspect blocked work.
3. Inspect available agents.
4. Identify newly unblocked tasks.
5. Identify safe downstream tasks.
6. Assign all useful work.
7. Integrate completed outputs.
8. Review CI, Security, and QE evidence.
9. Merge engineering-complete work.
10. Update Issues and the Product Review Queue.

The cycle ends only when no useful unblocked work remains, or every remaining
workstream is blocked by a Reserved Product Decision or an unavailable
external dependency. Before stopping, state which condition applies and list
the blockers.

These are not reasons to stop: a Pull Request is open, CI is running, review
is running, a merge is pending, a former Product Owner checkpoint was reached,
a module is complete, a specialist finished or timed out, another module is
unfinished, or the Human Product Owner has not replied.

Do not end with a request for routine permission to continue.

## Idle critical path

A status report, the end of an agent turn, and a green CI check are not
orchestration stop conditions. When an open autonomous-delivery pull request
has green required CI and no Reserved Product Decision, missing Security or
QE evidence is started in that cycle. Evidence that already covers the head
is followed by the merge in that same cycle. Leaving the pull request idle is
a process defect under trigger 25.

On 2026-10-08 the loop stopped after review comments existed and required CI
was green. The durable relationship pull request, the remaining module merges,
and the module-issue updates were still unblocked. The stop was the end of an
agent turn. It was not a Reserved Product Decision and it was not an external
dependency.

## Traceability

Every product behavior has a stable requirement ID and at least one acceptance
criterion. Pull Requests list affected requirement and acceptance IDs, ADRs,
verification evidence, risks, and limitations. Tests include acceptance IDs in
suite or test names. GitHub Issues and Pull Requests are the persistent work
record.

`TBD-PO` marks a decision that is still unresolved. It blocks only the
behavior that depends on that decision.

## Definition of Ready

Implementation of a substantial module may start when scope and non-goals,
dependencies, requirements, acceptance criteria, architecture impact, security
risks, test strategy, and blocking assumptions are known; an ExecPlan exists;
applicable security preparation is recorded; and either the Human Product
Owner has approved the reserved semantics or the remaining work stays inside
delegated authority with Reserved Product Decisions isolated.

## Definition of Done

See the `Done` conditions above. CI success alone is not the whole gate.
Requirements are not rewritten merely to match code.

## Plans and decisions

Use `.agent/PLANS.md` for substantial or cross-cutting work. Create an ADR
when a choice establishes a trust boundary, protocol, datastore, major
dependency, interoperability constraint, or a direction that is costly to
reverse. Plans are living records. ADRs stay immutable except for status and
links to superseding decisions. Do not record Human Product Owner ratification
that has not occurred.

## Required verification

Run from a clean checkout:

```bash
npm ci
npm run verify
npm run build
npm audit --audit-level=high
```

CI also performs secret scanning and CodeQL analysis. Security-sensitive
behavior needs negative tests, including spoofing, replay, revocation,
injection, enumeration, fail-closed dependencies, and disclosure or log
redaction.
