# Inject the awaited advertisement store

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Let a node use an injected advertisement store, and observe that a withdrawn
row survives a second OS process through that node.

## Scope and non-goals

`LocalAvailabilityNode` accepts `advertisementStore` and still defaults to
memory. It does not construct `PostgresSkillAdvertisementStore`. The probe
passes `AwaitedSkillAdvertisementStore`. An advertisement grants nothing.

Non-goals: a replay window, a listening server, and Issue #8 or Issue #13
acceptance.

## Requirements and acceptance criteria

- A second in-memory node sharing the injected store sees the advertisement
  and the withdrawal.
- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "the node reads false because the withdrawn row is present",
  `/1 passed/`, no skip, and no `postgres://` text.
- Advisory lock `81421005` is the same lock as the other advertisement tests.

## Decisions and ADRs

No new ADR.

## Security and privacy considerations

An advertisement cannot choose ALLOW, ASK, or DENY. A withdrawn row is not
current. The child does not disclose an availability boolean.

## Developer tests

`tests/unit/runtime/local-availability-node.test.ts`
`tests/integration/node-advertisement-restart.test.ts`
`tests/integration/node-advertisement-restart-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. Local verify skips the probe.
GitHub Actions is the live database evidence.

## Validation commands

`npm.cmd run verify`

## Progress

- [x] 2026-10-08 Add the node option and the restart probe

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not check a Human Product Owner box.
