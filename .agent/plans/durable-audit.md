# Durable audit log

Status: In Progress
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Add a PostgreSQL audit log with the same operator, retention, deletion, and
fail-closed results as `LocalAuditLog`, without wiring it into the node.

## Scope and non-goals

This slice adds `migrations/0003_audit.sql`, `PostgresAuditLog`, its tests,
the exports those tests need, and this plan.

Out of scope: changing `LocalAuditLog`, `LocalAvailabilityNode`, `src/main.ts`,
CI, gitleaks, `package.json`, approval wiring, and any replay window. This
adapter is not restart-safe two-node acceptance. Issue #12 stays Engineering
Accepted for the process-local slice only. Human acceptance is not checked.

## Requirements and acceptance criteria

- Only a trusted local operator can append, read, or delete.
- Retention is 30 times 24-hour days. A row is expired when `recordedAt` is
  strictly earlier than now minus that window. The cutoff instant is kept.
- `deleteAll` removes every row. `deleteExpired` removes only expired rows.
- The table stores `audit_id`, `recorded_at`, `category`, `request_id`, and
  `outcome`. It does not store an availability boolean, interval, profile,
  secret, message, or permission effect.
- A bad operator, command, clock, corrupt row, or driver failure returns
  `AUDIT_COMMAND_INVALID` and does not throw the driver error.
- A corrupt row fails the whole read and returns no events.

## Context and affected components

The log lives in `src/modules/audit`. It copies the relationship pool helper
and does not import that module. One database can hold `audit_records` beside
`relationship_records`. The node still uses `LocalAuditLog`.

## Decisions and ADRs

No new ADR. ADR-0004 selects PostgreSQL. ADR-0006 selects node-postgres.

- Methods are async. `LocalAuditLog` stays synchronous.
- Instants stay text. Expired deletion uses a strict ISO comparison against
  the canonical cutoff.
- Append and read delete expired rows in the same transaction as the write or
  select. A thrown query rolls back.
- `createPgPool` does not force TLS.

## Security and privacy considerations

There is no remote query. Errors contain only `AUDIT_COMMAND_INVALID`. A
backward clock can keep rows longer. That residual is already accepted for
the process-local log and is not changed here.

## Implementation sequence

1. Add the schema, async log, and exports.
2. Cover the new file with a fake pool, including the retention predicate.
3. Add a skipped-without-URL integration test. Do not start Docker.

## Developer tests

`tests/unit/modules/audit/postgres-audit-log.test.ts` uses a fake pool.
`tests/integration/postgres-audit-log.test.ts` uses
`PAN_RELATIONSHIP_DATABASE_URL` and skips when it is empty.

## QE and acceptance verification

Independent QE reviews the pull request. A local skip is not acceptance
evidence. GitHub Actions runs the integration test. This plan does not accept
Issue #12 or Issue #13.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

The log is unwired. Restart of the node still uses memory until a later
change passes this log into the node. That later change must keep audit
failure from withholding a boolean.

## Progress

- [x] 2026-10-08 Schema, async log, unit tests, and skipped integration test

## Discoveries and decision log

Migration number 0003 leaves 0002 for the approval store on another branch.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI is
green on that head. Do not mark the module accepted from this plan.
