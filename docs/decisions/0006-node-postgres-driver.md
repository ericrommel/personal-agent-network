# ADR-0006: node-postgres for the first durable store

Status: Accepted  
Date: 2026-10-08  
Decision owners: Engineering Coordinator, Software Architect

## Context

ADR-0004 selects PostgreSQL for the first persistent state and leaves the driver
unselected until that module exists. PO-REL-6 requires a durable revoke before
two-node acceptance evidence. The relationship store is that first state.

## Decision

Use `pg` (node-postgres) 8.23.1 as the only database client. Queries are
parameterized. The first migration is `migrations/0001_relationships.sql`.
The in-memory store remains the unit-test adapter. It is not restart-safe
evidence.

## Alternatives considered

- `postgres` (postgres.js): smaller API, less common in this style of explicit
  transaction code.
- An ORM: hides the revoke-versus-insert transaction difference this port needs.
- SQLite: rejected by ADR-0004.

## Consequences

CI runs the integration test when `PAN_RELATIONSHIP_DATABASE_URL` points at
ephemeral PostgreSQL. A workstation without that variable still runs the unit
suite. The minimized relationship event is not stored in PostgreSQL; a committed
revoke remains even if the in-process sink throws.

## Security and privacy impact

The table stores the ordered agent-id pair, the relationship id, and
`active` or `revoked`. It does not store email, profile, skill, permission, or
calendar data. Connection strings come from the environment. Database errors
do not leave the adapter as product output.

## Requirements affected

PO-REL-6, ADR-0004, SEC-007.

## Supersedes / Superseded by

None. This fulfills the driver choice ADR-0004 deferred.
