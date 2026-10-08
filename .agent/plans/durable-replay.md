# Durable replay message ids

Status: In Development
Owner roles: Backend Engineer, Security & Privacy Engineer, Quality Engineer
Last updated: 2026-10-08

## Objective

Remember one envelope message id in PostgreSQL so a restarted store still fails closed on that id.

## Scope and non-goals

In scope: migration `0006_replay_messages.sql`, `PostgresReplayStore`, schema-create retry for the row-type race, and a live observation that a second store instance sees the same id.

Non-goals: the listening HTTPS server, opening a pool from the node, a durable availability budget, a product UI, and Issue #13 acceptance. The table has no interval, decision, context, or secret.

## Requirements and acceptance criteria

- The first `remember` of a token returns `accepted`. The same id on a new store instance returns `duplicate`.
- An unusable id is not inserted.
- A unique violation and a failed insert fail closed.
- `applyReplaySchema` retries only `23505` or `pg_type_typname_nsp_index`, at most five times.
- Advisory lock `81421006` guards the integration truncate.

## Decisions and ADRs

ADR-0007. No new Reserved Product Decision.

## Validation commands

`npm.cmd run verify`

GitHub Actions `quality` is the live PostgreSQL evidence. A skipped local Docker run is not that evidence.

## Risks, assumptions, and open questions

Rows are not pruned. An expired message already fails the freshness check before `remember`, so an old row is not required for denial. The mutual-TLS listener remains the next slice.
