# Await advertisement store

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Make `SkillAdvertisementService` wait for store results so a `Promise` is not
treated as a failed advertisement while the write can still commit.

## Scope and non-goals

The service awaits `insertAdvertised`, `withdrawMatching`, and both
`findCurrent` reads. A rejected store `Promise` is fail-closed:
`SKILL_ADVERTISEMENT_DEPENDENCY_FAILED` for commands, and `false` for
`readAdvertised`.

Non-goals: wiring `PostgresSkillAdvertisementStore`, renaming its methods,
changing the node, permissions, approval, or audit. An advertisement still
grants nothing. This is not Issue #8 acceptance. No new ADR.

## Requirements and acceptance criteria

- A synchronous in-memory store still advertises, withdraws, and reads.
- `advertise` stays pending across a macrotask while the insert `Promise` is
  open, then accepts the resolved record.
- A rejected insert, withdraw, or find does not throw out of the service.

## Decisions and ADRs

No new ADR. The durable class keeps different method names until a later
wiring slice. Awaiting `unknown` is valid for both a record and a `Promise`.

## Security and privacy considerations

An advertisement still cannot choose ALLOW, ASK, or DENY. Waiting does not
add fields. A store failure stays fail-closed.

## Developer tests

`tests/unit/modules/skills/skill-advertisement.test.ts`

## QE and acceptance verification

Independent review is required before merge. Do not accept Issue #8.

## Validation commands

`npm.cmd run verify`

## Progress

- [x] 2026-10-08 Await the three store calls and cover a pending insert

## Handoff and completion evidence

Do not merge until Security and QE review the pull request and required CI
is green. Do not check a Human Product Owner box.
