# Inject the awaited permission store

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Let a node use an injected permission store, and observe that a revoked
permission row survives a second OS process.

## Scope and non-goals

`AwaitedSkillPermissionStore` forwards the synchronous port to
`insertDurablePermission`, `revokeDurablePermission`, and
`findDurablePermission`. `PostgresSkillPermissionStore` stays off the port.
`LocalAvailabilityNode` accepts `permissionStore` and still defaults to
memory. It does not construct the PostgreSQL store.

The restart probe grants and revokes through the node, then a new process
sees the revoked row and `readSnapshot` null.

Non-goals: a replay window, a listening server, advertisement injection, and
Issue #8 or Issue #11 or Issue #13 acceptance.

## Requirements and acceptance criteria

- A second in-memory node sharing the injected store sees the grant and the
  revoke.
- The adapter does not settle a grant while the durable insert promise is open.
- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "denies because the revoked permission row is present",
  `/1 passed/`, no skip, and no `postgres://` text.
- Advisory lock `81421004` is shared with the existing permission integration
  test.

## Decisions and ADRs

No new ADR. Durable method names stay different from the port.

## Security and privacy considerations

D1: the stored effect is the only effect. A revoked row is absence for
`readSnapshot`, which stays deny. The adapter does not choose an effect.
Waiting does not add fields.

## Developer tests

`tests/unit/modules/permissions/awaited-skill-permission-store.test.ts`
`tests/unit/runtime/local-availability-node.test.ts`
`tests/integration/permission-restart.test.ts`
`tests/integration/permission-restart-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. Local verify skips the probe.
GitHub Actions is the live database evidence. Do not check a Human Product
Owner box.

## Validation commands

`npm.cmd run verify`

## Progress

- [x] 2026-10-08 Add the adapter, the node option, and the restart probe

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green.
