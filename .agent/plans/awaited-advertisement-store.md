# Awaited advertisement store

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Forward the advertisement port to the durable command names, and observe
that a withdrawn advertisement survives a second OS process.

## Scope and non-goals

`AwaitedSkillAdvertisementStore` returns the Promises from
`insertDurableAdvertisement`, `withdrawDurableAdvertisement`, and
`findDurableAdvertisement`. `PostgresSkillAdvertisementStore` stays off the
port. The node is not changed and still uses memory. This pull does not
construct a pool inside the node.

The probe uses `SkillAdvertisementService` directly. A new process sees the
withdrawn row and `readAdvertised` false.

Non-goals: node injection, a permission change, a replay window, a listening
server, and Issue #8 or Issue #13 acceptance. An advertisement still grants
nothing.

## Requirements and acceptance criteria

- Advertise stays pending across a macrotask while the durable insert is open.
- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "reads false because the withdrawn advertisement row is present",
  `/1 passed/`, no skip, and no `postgres://` text.
- Advisory lock `81421005` is shared with the existing advertisement
  integration test.

## Decisions and ADRs

No new ADR. Durable method names stay different from the port. Node injection
waits so this branch does not edit `local-availability-node.ts` while PR #78
does.

## Security and privacy considerations

An advertisement cannot choose ALLOW, ASK, or DENY. A withdrawn row is not
current. Waiting does not add fields.

## Developer tests

`tests/unit/modules/skills/awaited-skill-advertisement-store.test.ts`
`tests/integration/advertisement-restart.test.ts`
`tests/integration/advertisement-restart-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. Local verify skips the probe.
GitHub Actions is the live database evidence. Do not check a Human Product
Owner box.

## Validation commands

`npm.cmd run verify`

## Progress

- [x] 2026-10-08 Add the adapter and the restart probe

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green.
