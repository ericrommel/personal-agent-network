# ADR-0001: Independently Controlled Modular-Monolith Nodes

Status: Accepted  
Date: 2026-10-04  
Decision owners: Engineering Coordinator, Software Architect

## Context

The MVP must prove communication between independently controlled personal agents without premature distributed infrastructure.

## Decision

Build one modular-monolith PAN node per owner boundary. Domain components communicate in-process through explicit ports; only cross-node messaging uses a network contract. End-to-end verification runs two separately configured instances.

## Alternatives considered

- Microservices: rejected due to operational and consistency cost without current need.
- One multi-owner process only: rejected as insufficient proof of independent control, though it may be used in fast component tests.
- Broker/event architecture: deferred until delivery requirements demonstrate a need.

## Consequences

Module boundaries must be enforceable in code and tests. A node remains independently deployable, while local development stays simple.

## Security and privacy impact

Each node is a trust boundary. The receiving node alone authenticates and authorizes requests; private context remains local.

## Requirements affected

FR-001–FR-012, SEC-001–SEC-018, PRV-001–PRV-008.
