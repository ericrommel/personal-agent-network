# PAN Development Process

## Purpose

This document defines the engineering lifecycle for the Personal Agent Network.

The process is designed to keep product decisions, architecture, security, implementation, testing, and acceptance traceable.

---

# Development Lifecycle

```text
Product Need
    ↓
Requirement
    ↓
Acceptance Criteria
    ↓
Risk / Security Analysis
    ↓
Architecture / ADR when necessary
    ↓
Implementation Plan
    ↓
Development + Developer Tests
    ↓
Code Review
    ↓
QE Verification
    ↓
Product Owner Acceptance
```

Not every change requires every role.

Use the smallest process that safely fits the risk and scope of the change.

---

# 1. Product Need

Work starts from an identifiable product or engineering need.

Before implementation, determine:

- what problem is being solved;
- who benefits;
- whether it belongs to the current MVP;
- whether existing behavior changes.

Do not implement speculative future requirements.

---

# 2. Requirements

Product behavior must be represented by traceable requirements.

Requirement categories include:

- `FR-*` — Functional
- `SEC-*` — Security
- `PRV-*` — Privacy
- `REL-*` — Reliability
- `OBS-*` — Observability
- `DEV-*` — Developer experience

Requirements must be:

- testable;
- scoped;
- understandable;
- implementation-independent where practical.

---

# 3. Acceptance Criteria

Relevant requirements must have verifiable acceptance criteria.

Use Given / When / Then when it improves clarity.

Example:

```text
GIVEN Maria granted Eric availability access
WHEN Eric requests availability for an allowed time range
THEN Maria's agent may return the permitted derived result
AND the underlying private context is not disclosed.
```

Acceptance criteria describe observable behavior.

They should not prescribe implementation unless the implementation itself is part of the requirement.

---

# 4. Risk and Security Analysis

Changes involving trust boundaries require security review before implementation.

Examples include:

- identity;
- discovery;
- authentication;
- authorization;
- agent messaging;
- relationships;
- context access;
- disclosure;
- approval;
- external tools;
- external AI systems.

The Security Engineer identifies:

- assets;
- trust boundaries;
- attackers;
- abuse cases;
- likely failure modes;
- required mitigations;
- security tests.

Security findings may block implementation.

---

# 5. Architecture

Architecture work should answer only the decisions required for the current scope.

Avoid speculative architecture.

Create an ADR when a decision:

- materially constrains future implementation;
- introduces an important dependency;
- changes a trust boundary;
- selects a protocol;
- selects persistent storage;
- affects interoperability;
- is difficult or expensive to reverse.

---

# 6. Implementation Planning

Substantial work requires an ExecPlan following:

`.agent/PLANS.md`

The plan should include:

- objective;
- scope;
- non-goals;
- requirements;
- acceptance criteria;
- affected components;
- implementation steps;
- security considerations;
- testing;
- validation;
- rollout or migration concerns where applicable.

Plans are living documents.

Update them as implementation changes.

---

# 7. Branching

Never implement directly on `main`.

Create a focused branch for the approved work.

Examples:

```text
feat/agent-discovery
feat/relationship-policy
security/message-validation
docs/mvp-requirements
chore/project-bootstrap
```

Avoid mixing unrelated changes.

---

# 8. Implementation

The implementing engineer owns:

- production code;
- implementation-level documentation;
- unit tests;
- component tests;
- relevant integration tests;
- error handling;
- observability required by the feature.

Do not leave normal implementation tests for QE to write later.

---

# 9. Security During Implementation

Treat all external agent data as untrusted.

Do not allow incoming messages to implicitly:

- grant permissions;
- change authorization policy;
- invoke tools;
- expose context;
- override system security rules.

Validate inputs at trust boundaries.

Prefer explicit structured contracts over unconstrained interpretation where security decisions are involved.

Do not implement custom cryptography unless explicitly approved and justified.

---

# 10. Code Review

Review should evaluate:

- correctness;
- requirement coverage;
- architecture consistency;
- maintainability;
- test quality;
- error handling;
- security implications;
- privacy implications;
- unnecessary scope.

Reviewers should verify behavior, not merely formatting.

---

# 11. Quality Verification

QE independently evaluates whether the change satisfies the intended behavior.

QE activities may include:

- acceptance verification;
- exploratory testing;
- risk-based testing;
- contract testing;
- negative testing;
- integration testing;
- coverage analysis.

QE should identify missing developer tests rather than silently replacing them.

---

# 12. Security Verification

Security-sensitive changes require appropriate negative cases.

Examples:

```text
authorized request
→ permitted derived result
```

must be considered alongside:

```text
unauthorized request
→ denied
```

```text
prompt injection in remote message
→ does not alter authorization
```

```text
revoked grant reused
→ denied
```

```text
replayed request
→ handled according to replay policy
```

```text
unknown agent enumerates identities
→ private information not leaked
```

---

# 13. CI Gates

Required CI checks should fail the pipeline when they fail.

The exact tooling depends on the selected technology stack.

Evaluate:

- formatting;
- linting;
- static/type analysis;
- unit tests;
- integration tests;
- secret scanning;
- dependency vulnerability scanning;
- static security analysis.

Do not add low-value tools only to increase the number of checks.

---

# 14. Product Owner Acceptance

Return to the Product Owner when implementation changes or resolves meaningful product behavior.

Present:

- what changed;
- which requirements were satisfied;
- acceptance results;
- relevant trade-offs;
- known limitations;
- security or privacy implications;
- deferred work.

Do not hide unresolved product questions inside technical implementation.

---

# Module-by-Module Delivery

PAN should be developed incrementally.

A module should reach an accepted state before unrelated future modules are implemented.

A possible sequence may eventually include:

```text
Project Foundation
      ↓
Identity Model
      ↓
Agent Discovery
      ↓
Relationships
      ↓
Policy / Authorization
      ↓
Messaging
      ↓
Context Boundary
      ↓
Approval
      ↓
Audit
      ↓
External AI Integration
```

This sequence is not automatically approved architecture.

The engineering team must validate it against the requirements before implementation.

---

# Principle

The objective is not maximum implementation speed.

The objective is:

> small, understandable, secure, testable increments that continuously prove the product hypothesis.