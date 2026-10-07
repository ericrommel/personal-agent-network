# Relationships

Status: Complete
Owner roles: Engineering Coordinator, Product Analyst, Software Architect, Security & Privacy Engineer, Backend Engineer, Quality Engineer
Last updated: 2026-10-07
Tracking: GitHub Issue #7; subtasks #20, #21, #22, #23, #24, #25; roadmap Issue #15

## Objective

Prepare an explicit, revocable relationship record between two Agent Identities without letting
that record imply discovery, skill permission, context access, or execution authority. Stop
before functional implementation and ask the Human Product Owner for authorization.

## Scope and non-goals

The preparation baseline is a pre-seeded, directed, node-local record with statuses `active`
and `revoked`. The human owner mutates it through a trusted local path. A later policy module
may read a boolean. Invitation UX, groups, contact management, remote mutation, skill policy,
messaging, approval, durable audit, and PostgreSQL are out of this slice.

Issue #7 authorizes `src/modules/relationships/` for the approved process-local slice. It does not authorize PostgreSQL, remote mutation, or invitation flow.

## Requirements and acceptance criteria

Primary existing ids: `FR-003`, `FR-005`, `FR-009`, `SEC-004`, `SEC-009`, `REL-001`, `REL-003`,
`REL-004`, `AC-DOM-001`, and `AC-REV-001`. The module can contribute the separation and the
next-read effect of revoke. It cannot complete invocation denial, pending-approval
invalidation, or the pre-disclosure check. Those stay with later modules. `AC-REV-001` still
marks in-flight latency `TBD-PO`.

Normative product text is intentionally unchanged until the Product Owner accepts or amends
the six decisions in `docs/modules/relationships/specification.md`.

## Context and affected components

Accepted Identity supplies agent ids and eligibility. Accepted Discovery must stay
independent: a Discovery reference is not a relationship credential, and Discovery must not
start disclosing relationships. The proposed module is `src/modules/relationships/` with an
in-memory store, modeled on Discovery's ports and fail-closed service. No Identity or
Discovery file should change in the implementation slice.

## Decisions and ADRs

No new ADR. ADR-0001, ADR-0003, and ADR-0004 already cover the node boundary, the separation
of relationship from authority, and PostgreSQL when durable state is actually introduced.
ADR-0005 stays specific to Discovery.

Coordinator resolutions inside the recommended baseline:

- The same row never returns to `active`. A new trusted create after revoke allocates a new id.
- Create rolls back if its minimized observer throws. A completed revoke stays revoked if that
  observer throws afterward.
- `readActive` is a boolean. Events omit party ids and relationship ids. No label and no email
  are stored.

## Security and privacy considerations

Remote input cannot create or revoke. Reads do not reveal whether a remote caller has a
relationship, because this module has no remote read. Restart drops process-local state and
must not be described as durable revoke. The threat write-up is
`docs/modules/relationships/threat-privacy.md`. It records no blocking finding against this
baseline. Implementation that adds a remote mutate path, a durability claim, or a disclosed
graph becomes blocking.

The Security & Privacy specialist run timed out before writing that file. The coordinator
wrote it and did not waive a trust-boundary finding. An implementation review by that role is
still required after authorization.

## Implementation sequence

Do not start this sequence until Issue #7 is explicitly Ready for Development.

1. Domain record, directed-pair key, and pure revoke.
2. Contracts and ports with no remote-payload parser.
3. Process-local store, including create rollback and revoke that stays revoked.
4. Service `create`, `revoke`, and `readActive`.
5. Export surface and 100% coverage threshold for `src/modules/relationships/**`.
6. `npm run verify`, `npm run build`, and `npm audit --audit-level=high`.
7. Security and QE review of the implementation, then stop at Product Owner acceptance.

The Backend decomposition owns the file-level detail. QE owns the independent check list and
does not own those tests.

## Developer tests

None in this preparation commit. After authorization, the Backend Engineer adds
`tests/unit/modules/relationships/relationship.test.ts` covering the QE decision table:
separation from discovery and permission, direction, revoke, fail-closed dependencies, and
the restart limitation stated as a limitation.

## QE and acceptance verification

`docs/modules/relationships/test-plan.md` is the QE deliverable. QE reviews developer tests
after they exist. This plan does not mark `AC-DOM-001` or `AC-REV-001` satisfied.

## Validation commands

Preparation changes documentation only. No test run is evidence of relationship behavior.
Before this branch is merged, required CI on the preparation pull request is the gate.
Local `git diff --check` must pass.

## Risks, assumptions, and open questions

The six Product Owner decisions are PO-REL-1 through PO-REL-6 in the specification. The
recommendations are pre-seeded directed records, node-local authority, owner-only mutation,
boolean local reads, and process-local storage until durable state is authorized for MVP
acceptance. None of those recommendations is approval.

Specialist delivery: QE (#24) and Backend (#22) finished their files. Product Analyst (#21),
Software Architect (#20), and Security (#23) runs timed out without a specialist file. The
coordinator supplied those three documents from the issue briefs and reconciled them with the
QE and Backend results. That is weaker than a finished independent security review of an
implementation, and it is enough to hold the preparation gate. It is not enough to skip a
security review after code exists.

## Progress

- [x] 2026-10-06: Discovery accepted and merged. Issue #7 moved to In Preparation.
- [x] 2026-10-06: Subtasks #20–#25 opened under Issue #7.
- [x] 2026-10-06: QE test plan and Backend decomposition delivered by those roles.
- [x] 2026-10-06: Coordinator wrote the specification, architecture, and threat analysis after
      the other specialist runs timed out, and reconciled the revoke-observer and re-seed
      rules.
- [x] 2026-10-06: Readiness package posted.
- [x] 2026-10-06: Human Product Owner approved PO-REL-1 through PO-REL-6 for development.
- [x] 2026-10-07: Domain record and guard implemented. Store and service implemented after the service specialist timed out before writing files. Security and QE review of this code are still required.
- [ ] Security review, QE verification, and engineering acceptance.

## Discoveries and decision log

- 2026-10-06: ADR-0004 already forbids treating in-memory revocation as MVP acceptance
  evidence. The first slice can still be in-memory if PO-REL-6's recommendation is accepted
  and Issue #13 stays blocked on durability.
- 2026-10-06: QE preferred not to re-seed after revoke. The coordinator allowed a new id on a
  later explicit create so a mistaken revoke is correctable without an invitation flow. The
  old id stays revoked.
- 2026-10-06: Backend keeps a revoke that has already been written when the observer throws.
  The coordinator accepted that over a rollback, because rollback would restore authority.
  Create still rolls back.
- 2026-10-07: The record does not store timestamps. Audit owns later event time.
- 2026-10-07: A throwing create observer deletes that directed pair. A failed create cannot
  leave an active row, including a row inserted by a re-entrant observer.
- 2026-10-07: The full-module and store/service specialist runs timed out before writing
  the service. The domain specialist delivered the record. The coordinator wrote the
  store and service. Independent Security and QE review is still required.

## Handoff and completion evidence

Preparation evidence is the module documents under `docs/modules/relationships/`, this plan,
and the Issue #7 readiness comment. Development was approved on Issue #7. Engineering Accepted and Done were recorded on
2026-10-07 for this approved slice only, after PR #46 merged. Human Product Owner
ratification of that completion is `PO review pending` in PRQ-002. A throwing create
observer clears that directed pair. Timestamps are not stored in this slice. `readActive`
rechecks the current row after party lookup. Restart still drops state.
