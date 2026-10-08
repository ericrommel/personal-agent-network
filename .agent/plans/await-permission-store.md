# Await permission store

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Make `SkillPermissionService` wait for store results so a `Promise` is not
treated as a failed permission while a write can still commit.

## Scope and non-goals

The service awaits `insertActive`, `revokeMatching`, and both `findCurrent`
reads. A rejected store `Promise` is fail-closed:
`SKILL_PERMISSION_DEPENDENCY_FAILED` for commands, and `null` for
`readSnapshot`. A rejected revoke does not call `invalidateUnreleased`.

Non-goals: wiring `PostgresSkillPermissionStore`, renaming its durable
methods, changing approval expiry persistence, or opening PostgreSQL from
the node. This is not Issue #8 or Issue #11 acceptance. No new ADR. No
replay window.

## Requirements and acceptance criteria

- A synchronous in-memory store still grants, revokes, and reads.
- `grant` stays pending across a macrotask while the insert `Promise` is
  open, and the row is absent until that promise settles.
- `revoke` stays pending across a macrotask while `revokeMatching` is open.
  Invalidation does not run, and the row stays active, until that promise
  settles.
- `readSnapshot` stays pending across a macrotask while `findCurrent` is open.
- A rejected insert, revoke, or find does not throw out of the service.

## Decisions and ADRs

No new ADR. The durable class keeps `insertDurablePermission`,
`revokeDurablePermission`, and `findDurablePermission`, plus
`_NotSyncPermissionPort`. Awaiting `unknown` is valid for both a record and
a `Promise`. Restoring the synchronous port names on that class would make
it assignable again and is out of scope.

## Security and privacy considerations

D1 still says only the stored effect is ALLOW, ASK, or DENY. Absence remains
DENY. Waiting does not add fields. A store failure stays fail-closed. A
revoke that does not resolve to the revoked row does not invalidate pending
approvals.

## Developer tests

`tests/unit/modules/permissions/skill-permission.test.ts`

## QE and acceptance verification

Independent review is required before merge. Do not accept Issue #8 or
Issue #11. One microtask is not proof that the store call is awaited.

## Validation commands

`npm.cmd run verify`

## Progress

- [x] 2026-10-08 Await the four store calls and cover pending insert, revoke, and read

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not check a Human Product Owner box.
