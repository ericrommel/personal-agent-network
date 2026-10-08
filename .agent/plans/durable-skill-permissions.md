# Durable skill permissions

Status: In Progress
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Add a PostgreSQL skill-permission store with the same observable results as
`InMemorySkillPermissionStore`, without changing the synchronous
`SkillPermissionService`.

## Scope and non-goals

This slice adds `migrations/0004_skill_permissions.sql`,
`PostgresSkillPermissionStore`, the unit and integration tests, the exports
those tests need, and this plan.

The async class does not implement `SkillPermissionStorePort`.
`SkillPermissionService` is not wired to it. Wiring stays deferred because
revoke still calls `UnreleasedApprovalPort.invalidateUnreleased` synchronously.
A fire-and-forget wrapper would miss D4. The follow-up that awaits invalidation
and passes `PostgresApprovalStore` is a separate change.

Out of scope: `skill-permission-service.ts`, `LocalAvailabilityNode`,
`src/runtime`, `src/main.ts`, CI, gitleaks, `package.json`, replay windows,
CLI, HTTP, and product UI. This adapter is not restart-safe two-node
acceptance. No new ADR. Migration `0005` stays reserved for skill
advertisements.

## Requirements and acceptance criteria

Sequential `insertActive`, `revokeMatching`, and `findCurrent` match the
in-memory store. The stored effect remains the only ALLOW/ASK/DENY source.
Absence is fail-closed. This slice does not by itself satisfy Skills and
Policy acceptance.

## Context and affected components

The store lives in `src/modules/permissions`. It follows the relationship
PostgreSQL adapter: a local pool wrapper, a reviewed SQL constant, fake-pool
unit tests, and an integration test gated by `PAN_RELATIONSHIP_DATABASE_URL`.
This module does not import the relationships module.

## Decisions and ADRs

No new ADR. ADR-0004 selects PostgreSQL. ADR-0006 selects node-postgres.

- An active row for the same pair is `SKILL_PERMISSION_CONFLICT` and is not
  written. A missing or revoked row is replaced.
- The insert sink runs before COMMIT. A thrown sink rolls the insert back.
- Revoke COMMITs, then calls the sink. A thrown sink leaves the revoked row.
- `findCurrent` returns null for a bad pair, a miss, a corrupt row, or a
  thrown query.
- `createPgPool` does not force TLS. It uses max 4 and
  `connectionTimeoutMillis` 2000.

## Security and privacy considerations

The table stores the directed pair, the pinned availability purpose and scope,
the effect, and active or revoked. It does not store kind, email, profile,
calendar, an availability boolean, a secret, or the event. Database errors
become `SKILL_PERMISSION_DEPENDENCY_FAILED` or `SKILL_PERMISSION_NOT_FOUND`
with no SQL and no URL. There is no remote query.

## Implementation sequence

1. Add migration `0004` and the async store.
2. Cover it with unit tests at 100% of `src/modules/permissions/**` and a
   skipped-local integration test.

## Developer tests

`tests/unit/modules/permissions/postgres-skill-permission-store.test.ts`
`tests/integration/postgres-skill-permission-store.test.ts`

## QE and acceptance verification

Independent QE reviews the pull request. A local skip is not the PostgreSQL
observation. GitHub Actions quality is that observation. This plan does not
accept Issue #8 beyond the already accepted process-local slice, and it does
not accept Issue #13.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

The service still cannot await this store. Do not wrap invalidation in an
unawaited promise when the later wiring change lands.

## Progress

- [x] 2026-10-08 Async store, migration 0004, unit tests, and skipped integration test

## Discoveries and decision log

The stored effect is intentionally persisted. D1 says that effect is the
authorization source. That is distinct from the audit minimization rule, which
forbids storing the effect on an audit row.

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI is
green. Do not check a Human Product Owner box.
