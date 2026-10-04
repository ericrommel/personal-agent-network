# Architecture Decision Records

ADRs record consequential, durable engineering decisions. Use four-digit sequential IDs and a short kebab-case name: `0005-agent-authentication.md`.

Statuses are `Proposed`, `Accepted`, `Superseded`, or `Rejected`. Accepted ADR content is not rewritten to hide history; add a superseding ADR and update both status links. Routine implementation choices do not need ADRs.

## Index

| ADR | Status | Decision |
|---|---|---|
| [0001](0001-modular-monolith.md) | Accepted | Independently controlled modular-monolith nodes |
| [0002](0002-typescript-node-toolchain.md) | Accepted | Strict TypeScript and Node toolchain |
| [0003](0003-domain-and-trust-boundaries.md) | Accepted | Separate domain concepts and deterministic security enforcement |
| [0004](0004-postgresql-persistence.md) | Accepted | PostgreSQL for transactional state when persistence begins |

## Template

```markdown
# ADR-NNNN: Title
Status: Proposed | Accepted | Superseded | Rejected
Date: YYYY-MM-DD
Decision owners: roles, not individuals

## Context
## Decision
## Alternatives considered
## Consequences
## Security and privacy impact
## Requirements affected
## Supersedes / Superseded by
```
