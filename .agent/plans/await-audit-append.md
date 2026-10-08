# Await audit append

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Make `LocalAvailabilityNode.handle` wait until an injected audit append
settles, so a PostgreSQL audit log can be passed without a fire-and-forget
write.

## Scope and non-goals

`AuditAppendPort.append` may return a `Result` or a `Promise` of a `Result`.
`handle` awaits that call after the availability response is chosen. A failed
`Result` does not change the response. The default log remains
`LocalAuditLog`.

Non-goals: constructing a pool inside the node, wiring approval or skill
stores, replay windows, HTTP, the CLI, and Issue #12 or Issue #13 acceptance.
No new ADR. `PostgresAuditLog` stays a caller-injected port. This slice does
not make the two-node demonstration restart-safe.

## Requirements and acceptance criteria

- The default node still records one minimized event on `LocalAuditLog`.
- `handle` does not resolve while an injected append `Promise` is pending.
- A failed append `Result`, sync or async, still returns the handler response.
- `PostgresAuditLog` is assignable to `AuditAppendPort`. A type assertion
  fails the build if that stops being true.
- The append is not wrapped in `try/catch`. A thrown port still rejects
  `handle`.

## Context and affected components

`src/runtime/local-availability-node.ts` already accepts `options.audit`.
The port returned only a synchronous `Result`, so `PostgresAuditLog.append`
was not assignable. The call site ignored the return value.

D6 is unchanged: local operator only, minimized fields, no remote query
surface added here.

## Decisions and ADRs

No new ADR. The node follows the relationship-store pattern: the caller
injects the durable adapter. The node does not open PostgreSQL itself.

## Security and privacy considerations

Awaiting the append does not add fields to the event. Failure still must not
withhold a boolean that the handler already chose. The PostgreSQL log remains
unqueried by this class. Remote input cannot select the audit port.

## Implementation sequence

1. Widen the port return type and await the call.
2. Lock assignability of `PostgresAuditLog` with a type assertion.
3. Add a macrotask test that holds the append `Promise` open.

## Developer tests

`tests/unit/runtime/local-availability-node.test.ts`

The existing sync failure test stays. The new test holds the append open
across a macrotask and then resolves a failed `Result`.

## QE and acceptance verification

Independent Security and QE review are required before merge. This plan does
not accept Issue #12 or Issue #13. Live PostgreSQL evidence remains the
existing audit integration test in CI, not this unit test.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

A port that returns `void` is outside the type. An adapter that starts
work and returns a `Result` before that work finishes is not detected.
`PostgresAuditLog.append` returns only after the transaction finishes.

## Progress

- [x] 2026-10-08 Await the port and cover a pending append

## Discoveries and decision log

The sync port was already fail-closed for disclosure: `handle` returned the
response without reading the `Result`. The gap was the unawaited write.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not check a Human Product Owner box.
