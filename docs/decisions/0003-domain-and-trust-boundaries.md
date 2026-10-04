# ADR-0003: Separate Domain Concepts and Deterministic Enforcement

Status: Accepted  
Date: 2026-10-04  
Decision owners: Engineering Coordinator, Software Architect, Security & Privacy Engineer

## Context

Collapsing identity, relationship, skill support, policy, context, and messaging into one `Agent` abstraction would create implicit authority and confused-deputy risk.

## Decision

Maintain separate Human Identity, Agent Identity, Discovery, Relationships, Skills, Authorization/Policy, Messaging, Context Boundary, Approval, Audit, and External AI boundaries. Authorization and disclosure are deterministic application controls. Remote text and LLM output are untrusted data and cannot grant authority or directly access context/tools.

## Alternatives considered

- A generic agent service/object: rejected because capability and authority would be ambiguous.
- LLM-mediated policy: rejected because it is non-deterministic and injection-prone.
- Raw context exchange: rejected because it violates minimal disclosure.

## Consequences

Contracts and dependency tests must preserve boundary direction. Some orchestration is explicit rather than hidden behind a generic abstraction.

## Security and privacy impact

This is the central least-privilege, prompt-injection, confused-deputy, and minimal-disclosure control.

## Requirements affected

FR-001–FR-012, SEC-003–SEC-013, PRV-001–PRV-007.
