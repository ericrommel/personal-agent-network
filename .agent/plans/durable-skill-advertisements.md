# Durable skill advertisements

Status: In Progress
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Mirror the in-memory skill-advertisement store in PostgreSQL, including conflict
detection and event-sink rollback, without wiring that store into
`SkillAdvertisementService`.

## Scope and non-goals

In scope:

- `migrations/0005_skill_advertisements.sql`
- `src/modules/skills/postgres-skill-advertisement-store.ts`
- exports added to `src/modules/skills/index.ts`
- unit tests and a skipped integration test
- this plan

Non-goals:

- wiring `SkillAdvertisementService` or changing its synchronous store calls
- replacing `InMemorySkillAdvertisementStore`
- permissions, approval, audit, relationships, runtime, or any other migration
- restart-safe acceptance of the running node
- Human Product Owner ratification
- marking the Skills module Engineering Accepted or Done

An advertisement grants nothing and is not a permission. This slice is not
restart-safe acceptance: the service is not wired to PostgreSQL.

## Requirements and acceptance criteria

The async store matches the in-memory outcomes below. It does not declare
`implements SkillAdvertisementStorePort`.

- An invalid record, or a status other than `advertised`, returns
  `{ code: "SKILL_ADVERTISEMENT_DEPENDENCY_FAILED" }` and does not query.
- A current `advertised` row for the same `advertisementKey` returns
  `{ code: "SKILL_ADVERTISEMENT_CONFLICT" }` and does not write.
- A missing row or a `withdrawn` row is replaced by the new advertised row.
- The event is not stored. The sink runs after the insert and before `COMMIT`.
  If it throws, the transaction rolls back, the method returns the dependency
  failure, and the new row does not remain.
- `withdrawMatching` returns `{ code: "SKILL_ADVERTISEMENT_NOT_FOUND" }` for a
  null key, a bad id, a missing row, a corrupt row, or an id mismatch, and does
  not commit a write.
- On a match, status becomes `withdrawn`, the transaction commits, then the sink
  runs. If the sink throws, the withdrawn row stays and the method returns it.
- `findCurrent` returns null for a null key, a miss, a corrupt row, or a query
  failure. It does not throw and does not invent an error code. Null is
  fail-closed absence.
- Driver failures on insert or withdraw return the dependency failure with no
  SQL text.

`AC-DOM-001` still keeps advertisement and permission separate. This slice does
not claim that criterion is newly satisfied. The service remains the
process-local implementation.

## Context and affected components

`InMemorySkillAdvertisementStore` is what `SkillAdvertisementService` calls,
synchronously and without `await`. `PostgresSkillAdvertisementStore` follows the
pool and transaction shape of `PostgresRelationshipStore` but does not import
the relationships module. The key is `advertisementKey` (`agentId>skillVersion`).

Migration `0005_skill_advertisements.sql` is the only migration in this slice.
Migrations `0002`, `0003`, and `0004` belong to other branches. The table columns
are `pair_key`, `advertisement_id`, `agent_id`, `skill_version`, and `status`.
`kind: "skill-advertisement"` is rebuilt on read and checked with
`isSkillAdvertisement`. The schema constant and the migration are trim-equal.

## Decisions and ADRs

No new ADR. ADR-0004 selects PostgreSQL. ADR-0006 selects the `pg` driver. This
slice reuses that driver, does not change its version, and does not force TLS.

- Insert conflict uses `ON CONFLICT (pair_key) DO UPDATE ... WHERE status =
  'withdrawn'`. Zero returned rows is a conflict. The statement rolls back.
- `ROLLBACK`, not a compensating delete, drops an uncommitted insert. Replacing
  a withdrawn row and then failing the sink restores that withdrawn row. The
  in-memory store deletes the map key instead. This slice follows `ROLLBACK`.
- Withdraw commits before the sink. A later sink failure is not undone.
- `createPgPool` uses `max: 4` and `connectionTimeoutMillis: 2000`.
- The service stays unwired. Its port calls are synchronous, so this async class
  must not be passed to `SkillAdvertisementService` in this slice.

## Security and privacy considerations

The row is not a permission and grants nothing. The table does not store kind,
effect, permission, email, profile, calendar, an availability boolean, a secret,
or the event. Database errors are not product output and do not include SQL
text. `findCurrent` failure is absence, which fails closed. This store has no
remote-input parser. A row is returned only after `isSkillAdvertisement` accepts
the rebuilt record.

Process restart still drops advertisements in the running node because that node
uses the in-memory store. Durable rows in this table are not acceptance evidence
until a later change wires an awaiting service.

## Implementation sequence

1. Add the trim-equal schema constant and `migrations/0005_skill_advertisements.sql`.
2. Add the async store, pool wrapper, and schema apply function.
3. Export the store surface from the skills index.
4. Cover the store with a fake pool and a skipped PostgreSQL integration test.
5. Run `npm.cmd run verify`.
6. Do not wire the service and do not mark the module accepted.

## Developer tests

`tests/unit/modules/skills/postgres-skill-advertisement-store.test.ts` uses a
fake pool. It covers insert, conflict, replacement of a withdrawn row, sink
rollback, withdraw commit-before-sink, sink throw after withdraw, not-found,
corrupt row, `findCurrent` nulls, query failure, driver failure without SQL
text, and schema trim-equality.

`tests/integration/postgres-skill-advertisement-store.test.ts` uses
`describe.skipIf((process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "") === "")`.
It truncates `skill_advertisement_records`. When that variable is set, a second
instance sees a withdrawn row, a throwing insert sink leaves no row, a throwing
withdraw sink leaves the withdrawn row, and a second advertised insert conflicts.
The test also replaces a withdrawn row. It does not print the database URL.
Local Docker is down, so the skip is expected. No env var, workflow, or
gitleaks change is added.

## QE and acceptance verification

QE has not independently reviewed this slice. Developer tests are not QE
acceptance. A skipped integration test is not evidence of a durable node. This
plan does not record restart-safe acceptance, Engineering Accepted, or Done.

## Validation commands

```text
npm.cmd ci
npm.cmd run verify
```

Observed on 2026-10-08 from this worktree:

- `npm.cmd ci` exited 0. It added 68 packages and reported 0 vulnerabilities.
- `npm.cmd run verify` exited 0.
- `biome format .` checked 84 files and applied no fixes.
- `biome lint .` checked 84 files and applied no fixes.
- `tsc --noEmit` passed.
- Vitest reported 18 passed test files and 2 skipped, 160 passed tests and 2
  skipped. `tests/integration/postgres-skill-advertisement-store.test.ts`
  skipped because `PAN_RELATIONSHIP_DATABASE_URL` was unset. The URL was not
  printed.
- Coverage for `src/modules/skills/postgres-skill-advertisement-store.ts` was
  100% statements, 100% branches, 100% functions, and 100% lines.

## Risks, assumptions, and open questions

- Assumption: migration number `0005` stays reserved while other branches own
  `0002`, `0003`, and `0004`. A later number collision is possible.
- The service still calls the in-memory store. Restart still clears
  advertisements on the running node.
- Wiring requires the service to await the store. That change is outside this
  slice.
- No Human Product Owner decision is requested or recorded here.

## Progress

- [x] 2026-10-08: Schema, async store, exports, and tests added. The service was
  not wired.
- [x] 2026-10-08: `npm.cmd run verify` passed. The PostgreSQL integration test
  skipped because the database URL was unset.
- [ ] Restart-safe acceptance. Not this slice. The service still uses memory.

## Discoveries and decision log

- 2026-10-08: `SkillAdvertisementService` calls `insertAdvertised`,
  `withdrawMatching`, and `findCurrent` without awaiting. A Promise is not a
  skill advertisement, so wiring this class now would fail closed only after
  the async write had started. The class does not declare
  `implements SkillAdvertisementStorePort`.
- 2026-10-08: Insert sink failure rolls the transaction back and therefore
  restores a prior withdrawn row. The in-memory store would delete the key.
- 2026-10-08: An advertisement still grants nothing.

## Handoff and completion evidence

The next change may teach the service to await an async port. Until that lands,
process restart is not durable advertisement acceptance. Do not treat this plan
as module completion or Human Product Owner approval.
