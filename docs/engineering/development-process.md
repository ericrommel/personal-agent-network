# PAN Development Process

## Lifecycle and authority

PAN delivers one approved module at a time:

```text
Product need -> requirements and acceptance criteria -> risk review
-> architecture/ADR -> ExecPlan -> PO approval -> implementation and developer tests
-> code review -> QE/security verification -> PO acceptance
```

The Human Product Owner (PO) owns product scope, privacy and authorization semantics, module readiness, and final acceptance. Agents may recommend but never simulate PO approval. Research for later modules is allowed; implementation is not.

## Traceability

Every product behavior has a stable requirement ID and at least one acceptance criterion. Pull Requests list affected requirement/acceptance IDs, ADRs, verification evidence, risks, and limitations. Tests should include acceptance IDs in suite or test names. GitHub Issues and Pull Requests are the persistent work record; chat output is not sufficient.

## Operational work tracking

Each functional module MUST have one GitHub tracking Issue before preparation begins. The repository-level roadmap is Issue #15.

When a GitHub Project board is available, the board is the operational source of truth for delivery state. Until board write access is available, the module Issue body/comments must explicitly record the current state.

Use these states:

```text
Backlog
  -> In Preparation
  -> Ready for PO
  -> Ready for Development
  -> In Development
  -> Code Review
  -> Ready for Testing
  -> Testing
  -> Ready for PO Acceptance
  -> Done
```

Preparation may start for the next planned module after the prior module is accepted. Preparation includes requirements refinement, architecture, security/privacy analysis, test design, and ExecPlan work. Preparation does NOT authorize functional implementation.

At a readiness Product Owner gate, the Engineering Coordinator must:

- ensure the module Issue links the relevant preparation PR and ExecPlan;
- post a concise evidence package to the module Issue;
- record unresolved product decisions and recommendations;
- mark the module state `Ready for PO`;
- stop before functional implementation.

Only explicit Human Product Owner approval moves a module to `Ready for Development` and authorizes implementation of that module's approved scope.

At final acceptance, the Engineering Coordinator records implementation/test/review evidence, marks the module `Ready for PO Acceptance`, and stops until explicit Human Product Owner acceptance. Only then may the module be treated as `Done`.

Pull Requests implement or prepare work for a module Issue; they do not replace the Issue. Maintenance, CI, dependency, and documentation PRs that do not change product scope do not advance functional module state.

The existence of a roadmap item, tracking Issue, specification, architecture document, or known future requirement is not implementation authorization.

## Definition of Ready

A functional module is ready only when scope/non-goals, dependencies, requirements, acceptance criteria, architecture impact, security risks, test strategy, and blocking decisions are resolved; an ExecPlan exists for substantial work; and the PO explicitly authorizes implementation.

## Branches, commits, and Pull Requests

- Never modify or commit directly on `main`.
- Use `feat/<capability>`, `fix/<defect>`, `security/<control>`, `docs/<topic>`, or `chore/<task>`.
- Keep commits focused with imperative subjects, optionally using prefixes such as `docs:` or `ci:`.
- Require a reviewable PR, green required checks, resolved conversations, and an up-to-date branch. Do not force-push shared branches.
- A responsible engineering agent may merge only after required CI and review gates pass, blocking findings are resolved, and any applicable explicit Human PO approval is recorded in the PR. Agents cannot grant or infer PO approval.
- Before merging, the responsible agent must leave a persistent PR comment beginning with `Role: <project role>` and recording the merge decision and supporting gate evidence.

## Implementation and review ownership

Developers own production code, unit/component/implementation integration tests, error handling, and observability. QE owns risk-based strategy, coverage analysis, acceptance verification, exploratory testing, and independent assessment. Security reviews all trust-boundary changes. Platform owns reproducible build/CI infrastructure. Blocking findings return work to development; requirements are never rewritten merely to match code.

## Plans and decisions

Use `.agent/PLANS.md` for substantial or cross-cutting modules. Create an ADR when a choice establishes a trust boundary, protocol, datastore, major dependency, interoperability constraint, or costly-to-reverse direction. Plans are living records; ADRs are immutable except for status and links to superseding decisions.

## Required verification

Run from a clean checkout:

```bash
npm ci
npm run verify
npm run build
npm audit --audit-level=high
```

CI additionally performs secret scanning and CodeQL analysis. Required checks fail the PR. Security-sensitive behavior requires negative tests, including spoofing, replay, revocation, injection, enumeration, fail-closed dependencies, and disclosure/log redaction.

## Module completion

A module is complete only when requirements and acceptance criteria pass, developer and regression tests pass, applicable QE/security reviews have no blockers, documentation and traceability are current, and the PO explicitly accepts it. CI success alone is not product approval.
