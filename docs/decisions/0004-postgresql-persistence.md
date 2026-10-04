# ADR-0004: PostgreSQL for Transactional State

Status: Accepted  
Date: 2026-10-04  
Decision owners: Engineering Coordinator, Software Architect

## Context

Revocation, replay protection, single-use approval, policy versioning, and audit state require transactional concurrency semantics. Persistence is not yet implemented.

## Decision

Use PostgreSQL when an approved module first introduces persistent state. Use explicit, append-only reviewed migrations and a thin typed query/repository layer. Do not maintain SQLite as a second semantic target. Select the exact driver/query library with the first persistence module.

## Alternatives considered

- SQLite: simpler locally but risks divergence in concurrency and locking behavior.
- Document database: weaker fit for relational invariants and transactional workflows.
- In-memory-only state: acceptable for unit tests, not MVP acceptance evidence.

## Consequences

Integration tests need ephemeral PostgreSQL through Docker or a CI service container. No database dependency is added before it is used.

## Security and privacy impact

Repositories enforce data minimization; audit storage excludes raw private context. Credentials use environment/secret mechanisms and least privilege.

## Requirements affected

SEC-007–SEC-009, SEC-017, REL-001–REL-004, OBS-001–OBS-003.
