# Durable approvals

Status: Code Review
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Add a PostgreSQL approval store with the same observable results as
`InMemoryApprovalStore`, without changing the synchronous `ApprovalService`.

## Scope and non-goals

This slice adds `migrations/0002_approvals.sql`, `PostgresApprovalStore`, the
unit and integration tests, the exports those tests need, and this plan.

Service wiring is intentionally deferred until PR #62 merges.
`SkillPermissionService` calls `UnreleasedApprovalPort.invalidateUnreleased`
synchronously and must not fire-and-forget, because that would miss D4.
`LocalAvailabilityNode` on open PR #62 also calls `ApprovalService`
synchronously. Changing those signatures on this branch would collide with #62.

Out of scope: `ApprovalService` method signatures, the `ApprovalStore`
interface, `skill-permission-service.ts`, `LocalAvailabilityNode` and
`src/runtime` (not on this branch), `src/main.ts`, CI, gitleaks,
`package.json`, replay windows, CLI, HTTP, product UI, and any audit row in
PostgreSQL. This adapter is not restart-safe two-node acceptance. No new ADR.

## Requirements and acceptance criteria

Sequential `insertPending`, `replace`, `findByRequestId`, `findById`, and
`values` match the in-memory store. That prepares `AC-APR-001`, `AC-APR-002`,
`SEC-007`, and `SEC-008`. This slice does not satisfy those criteria and does
not mark them accepted. No protected availability result is stored.

## Context and affected components

The store lives in `src/modules/approval`. It follows the relationship
PostgreSQL adapter: a local pool wrapper, a reviewed SQL constant, fake-pool
unit tests, and an integration test gated by `PAN_RELATIONSHIP_DATABASE_URL`.
One database holds `relationship_records` and `approval_records`. This module
does not import the relationships module.

## Decisions and ADRs

No new ADR. ADR-0004 selects PostgreSQL. ADR-0006 selects node-postgres.

- Methods are async and do not implement the synchronous `ApprovalStore`
  interface.
- `createPgPool` does not force TLS. It uses max 4, `connectionTimeoutMillis`
  2000, and maps `rowCount` and `rows`.
- Instants stay `text` so node-postgres does not turn them into `Date` objects.
- A method that reads and then writes uses one transaction. A thrown query
  rolls back.
- If `approval_id` already exists, the result is `APPROVAL_DEPENDENCY_FAILED`,
  including when the request id and binding match. That matches
  `InMemoryApprovalStore`.
- If `request_id` exists, the binding matches, and the incoming approval id
  differs, the stored row is returned unchanged.
- If `request_id` exists and the binding differs, the result is
  `APPROVAL_CONFLICT`.
- Legal `replace` transitions are pending to approved, rejected, expired, or
  invalidated, and approved to released, expired, or invalidated. The same
  status returns the current row. Anything else, including a changed expiry or
  binding, is `APPROVAL_DEPENDENCY_FAILED`.
- Finds return null for a non-string id, a miss, a row that fails `isApproval`,
  or a thrown query. Writes turn a thrown query into
  `APPROVAL_DEPENDENCY_FAILED`.
- `values()` returns every selected row, ordered by `request_id`. A valid row
  is an approval record. A row that fails `isApproval` is the selected object.
  There is no insertion-order column.
- A unique-index race between two inserts of the same `request_id` commits one
  row. The loser observes `APPROVAL_DEPENDENCY_FAILED` when the insert throws.
  A later call then sees the in-memory result.
- No audit event is written.

## Security and privacy considerations

The table stores the bound approval only. It does not store an availability
boolean, interval result, profile, secret, kind, or email. Database errors do
not leave the adapter as product output. The connection string comes from
`PAN_RELATIONSHIP_DATABASE_URL`. The integration test does not print that URL.
Nothing here is wired to a remote caller.

## Implementation sequence

1. Add the reviewed migration and `APPROVAL_SCHEMA_SQL`.
2. Add the async store and the local pool wrapper.
3. Add fake-pool unit tests, including migration trim equality, under the
   existing 100% approval coverage glob.
4. Add the integration test, skipped when `PAN_RELATIONSHIP_DATABASE_URL` is
   missing or empty.
5. Export the symbols the tests import.
6. Run `npm.cmd run verify`.

## Developer tests

`tests/unit/modules/approval/postgres-approval-store.test.ts` covers conflict,
the same binding with a different id, approval-id dependency failure, each
legal replace, illegal replaces, find misses, corrupt rows, `values`,
rollback, and the pool wrapper.

`tests/integration/postgres-approval-store.test.ts` uses the existing
relationship database URL. A skip is the local Docker limitation, not
acceptance evidence. The test does not start Docker Desktop.

## QE and acceptance verification

QE has not independently verified this slice. Do not mark approval or two-node
Engineering Accepted. Do not record Human Product Owner acceptance. The Product
Review Queue is unchanged because the approval module is not complete.

## Validation commands

```text
npm.cmd ci
npm.cmd run verify
```

`npm.cmd ci` installed the lockfile because `node_modules` was missing.

`npm.cmd run verify` passed on 2026-10-08: format, lint, and typecheck passed.
Tests: 149 passed, 2 skipped (16 files passed, 2 skipped). Skipped tests are
`tests/integration/postgres-approval-store.test.ts` and
`tests/integration/postgres-relationship-store.test.ts` because
`PAN_RELATIONSHIP_DATABASE_URL` is unset. That is the local Docker limitation.
Docker Desktop was not started.

Coverage thresholds passed at 100% statements, branches, functions, and lines
(1828 statements, 1374 branches, 336 functions, 1801 lines).
`src/modules/approval/postgres-approval-store.ts` is 148/148 statements,
71/71 branches, 26/26 functions, and 146/146 lines. No branch was suppressed.

## Risks, assumptions, and open questions

Wiring stays blocked on PR #62, not on a Reserved Product Decision. No replay
or freshness number was chosen.

Local verify skips both PostgreSQL integration tests when
`PAN_RELATIONSHIP_DATABASE_URL` is unset. CI already sets that variable to the
local Postgres service. The skip is the local Docker limitation.

`values()` order is `request_id`, not in-memory insertion order. A concurrent
insert loser can see `APPROVAL_DEPENDENCY_FAILED` instead of the stored row;
the committed table still has one row.

This store is not restart-safe two-node acceptance.

## Progress

- [x] 2026-10-08: Migration, async store, unit tests, and integration test
      added. `npm.cmd run verify` passed. Status moved to Code Review. Not
      Engineering Accepted.

## Discoveries and decision log

- 2026-10-08: The store stays async so `ApprovalService` and
  `invalidateUnreleased` can remain synchronous until PR #62 merges.
- 2026-10-08: Reusing an existing `approval_id` is a dependency failure, even
  for the same binding. The idempotent path is a new approval id for an
  existing request id.
- 2026-10-08: No audit table and no new ADR.

## Handoff and completion evidence

The feature branch is `feat/durable-approvals`. Do not push. The parent
coordinator reviews, pushes, and opens the pull request. Service wiring remains
a follow-up after PR #62 merges.
