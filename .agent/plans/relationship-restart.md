# Relationship restart probe

Status: In Progress
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Show that a second OS process denies an availability request because it loaded
a revoked PostgreSQL relationship row.

## Scope and non-goals

The node can take an injected relationship store. The default node still uses
memory. This probe does not accept Issue #13. It does not choose a replay
window, listen on a socket, or add a CLI command. Approval, audit, permission,
and advertisement stores stay in memory.

## Requirements and acceptance criteria

A parent process revokes a relationship in PostgreSQL. A child process, with
its own pool, must see exactly one `revoked` row. `readActive` is false. The
public response is `{ outcome: "unavailable" }`. Context is not read. Both
agents are in the child directory, so the deny is not a directory miss.

## Context and affected components

`LocalAvailabilityNode` and two integration tests. `RelationshipService`
already awaits the store. `PostgresRelationshipStore` is unchanged.

## Decisions and ADRs

No new ADR. ADR-0004 and ADR-0006 already select PostgreSQL and node-postgres.
The handler's explicit `readActive` before release runs only on the ASK path.
This probe hits the decision's `readActive`, which returns before disclosure.

## Security and privacy considerations

The store is not taken from the request body. The child must not print the
database URL. A missing row is a failure, not a pass.

## Implementation sequence

1. Add the optional store to the node and cover it with a unit test.
2. Add the parent and child integration tests. Skip them when the database
   URL is empty. The parent and the existing relationship integration test
   share PostgreSQL advisory lock 81421001 so one truncate cannot delete the
   other file's row. The parent treats a skipped child as a failure: the child
   output must contain the probe name and `1 passed`.

## Developer tests

`tests/unit/runtime/local-availability-node.test.ts`
`tests/integration/relationship-restart.test.ts`
`tests/integration/relationship-restart-probe.test.ts`

## QE and acceptance verification

Independent QE reviews the pull request. A local skip is not the observation.
GitHub Actions runs the child process. This plan does not accept Issue #13.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

Approval, audit, and permission state still disappear on restart. An ALLOW
after restart is not claimed.

## Progress

- [x] 2026-10-08 Optional store, unit test, and skipped two-process probe

## Discoveries and decision log

Empty memory is not used as the oracle. The child requires `status = revoked`.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI is
green. Do not check Engineering Accepted for Issue #13.
