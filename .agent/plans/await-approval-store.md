# Await approval store

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Make `ApprovalService` wait for its store, and let `LocalAvailabilityNode`
accept an injected store, including `PostgresApprovalStore`.

## Scope and non-goals

Every store call in the service is awaited. `values()` may return an array or
a `Promise` of an array. The node returns that invalidation `Promise` from
the permission port. The default store remains in memory.

An expired approved row still returns false from `release` without a status
write. This pull does not choose a replay window, open HTTP, or accept Issue
#11 or Issue #13. No new ADR.

## Requirements and acceptance criteria

- `createAsk` stays pending across a macrotask while `insertPending` is open.
- Permission revoke on the node stays pending while `values()` is open, then
  invalidates the pending approval.
- `PostgresApprovalStore` is assignable to `ApprovalStore`.
- A failed or rejected store call stays fail-closed.

## Security and privacy considerations

Waiting does not add fields to an approval. The PostgreSQL table is unchanged.
The node does not open a pool. Remote input cannot select the store.

## Developer tests

`tests/unit/modules/approval/approval.test.ts`
`tests/unit/runtime/local-availability-node.test.ts`

## QE and acceptance verification

Independent review is required before merge. Live SQL remains the existing
approval integration test. This plan does not accept Issue #11.

## Validation commands

`npm.cmd run verify`

## Progress

- [x] 2026-10-08 Await the store and cover a pending insert and invalidation

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not check a Human Product Owner box.
