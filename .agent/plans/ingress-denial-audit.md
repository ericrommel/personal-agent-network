# Ingress denial audit

Status: In Development
Owner roles: Backend Engineer, Security & Privacy Engineer, Quality Engineer
Last updated: 2026-10-08

## Objective

Record one minimized audit event when the mutual-TLS ingress denies a request before the availability handler.

## Scope and non-goals

In scope: `RemoteHttpsDependencies.audit`. Every pre-handle denial appends category `decision`, outcome `unavailable`, and request id `unavailable`. The handler path does not append a second event. `openDurableAvailabilityResources` passes the same PostgreSQL audit log the node already uses.

Non-goals: a new audit category, a reason code, copying the request body, a product UI, and Issue #13 acceptance. `src/main.ts` and the CLI still do not listen.

## Decisions and ADRs

ADR-0007. The request id is the existing placeholder `unavailable` because the body is not a trusted request id. No new Reserved Product Decision.

## Validation commands

`npm.cmd run verify`

GitHub Actions quality runs `tests/integration/durable-ingress-demo.test.ts` when the database URL is set. A skipped local run is not that evidence.

## Risks, assumptions, and open questions

A thrown audit append still returns `{ outcome: "unavailable" }`. Engineering Accepted on Issue #13 stays unchecked.
