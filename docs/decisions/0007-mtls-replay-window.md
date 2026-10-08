# ADR-0007: Mutual-TLS ingress replay window

Status: Accepted  
Date: 2026-10-08  
Decision owners: Engineering Coordinator, Software Architect, Security & Privacy Engineer

## Context

D8 selects standard HTTPS with mutual TLS and a non-revealing denial. Issue #13
records the Human Product Owner's MVP parameters for freshness: a 5-minute
maximum validity window and 30 seconds of clock skew. ADR-0004 requires
PostgreSQL once replay state is acceptance evidence. Process-local memory is
the unit adapter only.

The availability body `requestId` is already the approval binding. An approved
ASK is released by a later delivery of that same body id. That later delivery
is not a replay of the first network message.

## Decision

The remote gate accepts one `pan.availability-envelope/v1` object. Its
`messageId` is single-use in the replay store. `issuedAt` and `expiresAt` are
canonical UTC instants, `expiresAt` is later than `issuedAt`, and the span is
at most 5 minutes. The receipt clock accepts `issuedAt` no later than 30
seconds ahead and `expiresAt` no earlier than 30 seconds behind.

The sender is only the peer certificate URI SAN `urn:pan:agent:` plus the
canonical agent id. `authenticatedAt` is the local receipt time. The body
cannot choose the sender. `recipientAgentId` must be this node's agent id and
must equal the body `targetAgentId`.

Any expired, future-outside-skew, duplicate, rebound, malformed, or
recipient-mismatched envelope returns `{ outcome: "unavailable" }` at the
ingress and does not call policy or context. The in-memory store is not
restart-safe evidence. `PostgresReplayStore` is the durable adapter. It stores
only the message id. The node does not open a pool and does not construct it.

## Alternatives considered

- Using the body `requestId` as the only replay key. That would reject the
  later ASK release, which is a second fresh delivery of the same approval id.
- A process-local set as the acceptance store. ADR-0004 already excludes that.
- A custom signature over the envelope. D8 forbids custom cryptography.

## Consequences

Node's built-in HTTPS server terminates mutual TLS on
`POST /pan/availability/v1`. The peer URI SAN is the only sender. A body
larger than 16 KiB is denied with the same public object as every other
failure. The server does not listen from `src/main.ts` or the CLI.
`PostgresReplayStore` remembers only the envelope message id. The node does
not open a pool and does not construct that store. This ADR does not add a
product UI, a general API, or a new authorization path. A duplicate
`messageId` is denied even when the body `requestId` would have been
idempotent inside approval.

## Security and privacy impact

Ingress cannot grant a relationship, permission, approval, or context read.
Certificate identity is not itself an agent-identity record; the SAN must
parse as a canonical agent id before a principal exists. Denial carries no
reason. Replay storage keeps the message id, not the availability interval or
the boolean result.

## Requirements affected

D8, Issue #9 ingress, and Issue #13. No new Reserved Product Decision.

## Supersedes / Superseded by

None.
