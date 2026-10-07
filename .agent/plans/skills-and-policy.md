# Skills and Policy

Status: In Preparation
Owner roles: Engineering Coordinator, Product Analyst, Software Architect, Security and Privacy Engineer, Backend Engineer, Quality Engineer
Last updated: 2026-10-07
Tracking: GitHub Issue #8; subtasks #38, #39, #40, #41, #42; queue PRQ-003, PRQ-005, PRQ-010, PRQ-011

## Objective

Prepare a deterministic `ALLOW` / `ASK` / `DENY` boundary that keeps relationship, skill advertisement, permission, purpose, scope, and policy version apart. Isolate Reserved Product Decisions. Do not implement permission mutation, interval interpretation, or approval storage in this preparation.

## Scope and non-goals

In scope: the preparation documents listed below and the deny-by-default sketch. Out of scope: production code in this branch, a policy language, context computation, messaging, approval lifecycle, and durable audit.

## Requirements and acceptance criteria

Primary ids: `FR-003`, `FR-004`, `FR-005`, `FR-006`, `FR-008`, `SEC-004`, `SEC-005`, `SEC-010`, `SEC-011`, `SEC-018`, `AC-DOM-001`, `AC-AUTH-001`, `AC-AUTH-002`. This preparation does not claim those criteria are met.

## Context and affected components

Relationships PO-REL-1 through PO-REL-6 are approved. The stable contract is a boolean current read, not a hard dependency on Relationships being Done. The pure evaluator must not import Discovery.

Documents:

- `docs/modules/skills-and-policy/specification.md`
- `docs/modules/skills-and-policy/architecture.md`
- `docs/modules/skills-and-policy/threat-privacy.md`
- `docs/modules/skills-and-policy/test-plan.md`
- `docs/modules/skills-and-policy/implementation-decomposition.md`

## Decisions and ADRs

No new ADR. ADR-0001 and ADR-0003 are sufficient for this boundary. ADR-0004 is not triggered because this preparation adds no database.

## Security and privacy considerations

Relationship and advertisement are not permission. Missing or ambiguous inputs deny. Remote text and model output cannot grant capability. The threat note records no blocking finding against that kernel, and it does not replace a review of later code.

## Implementation sequence

Do not start permission create/revoke, interval validation, approval storage, or a public response schema while PRQ-003, PRQ-004, PRQ-005, PRQ-006, PRQ-007, PRQ-009, and PRQ-010 stay blocked.

A later slice may implement the provisional pure evaluator in the decomposition. It takes explicit facts and returns only `ALLOW`, `ASK`, or `DENY`. It must be marked provisional. It must not choose the directed pair, the purpose catalog, or which requests are seeded `ASK` versus `ALLOW`.

## Developer tests

None in this preparation commit. Developers will own the evaluator tests. QE owns `docs/modules/skills-and-policy/test-plan.md` and does not write those tests.

## QE and acceptance verification

The test plan is preparation strategy, not execution evidence.

## Validation commands

Documentation only. `git diff --check` should pass. CI on the preparation pull request is the required gate.

## Risks, assumptions, and open questions

Reserved rows SP-R1 through SP-R9 stay open. Autonomous rows SP-A1 through SP-A6 are recorded as PRQ-011 and are not Human Product Owner ratification.

The decomposition's service sketch calls `readActive(requester, target)`. SP-R6 says that pair is a candidate, not an approved product rule. Implementation of that call waits.

## Progress

- [x] 2026-10-07: Specialist preparation files written.
- [x] 2026-10-07: Coordinator integrated the decision classification into this plan and the Product Review Queue.
- [x] 2026-10-07: Provisional pure evaluator added in `src/modules/policy/`. It returns only `ALLOW`, `ASK`, or `DENY` from explicit facts. It does not grant permission, choose the directed pair, interpret an interval, or store an approval.
- [ ] Security and QE review of the evaluator before any Engineering Accepted claim.

## Discoveries and decision log

- 2026-10-07: Relationships approval is an input. This module does not reopen PO-REL-1 through PO-REL-6.
- 2026-10-07: SP-A1 through SP-A6 chosen by the default decision rule and queued as PRQ-011.
- 2026-10-07: SP-R6, the directed pair used for authorization, is reserved even though the record direction itself is approved. Queued as PRQ-010.
- 2026-10-07: The pure evaluator can be built against a boolean port before Relationships source merges. That is a contract dependency.
- 2026-10-07: The evaluator specialist timed out before writing files. The coordinator implemented the pure function. It encodes SP-A1 through SP-A4 and the deny-by-default mapping. It does not close PRQ-003, PRQ-005, or PRQ-010.

## Handoff and completion evidence

Preparation evidence is the five module documents, this plan, and the queue items above. No runtime behavior is claimed.
