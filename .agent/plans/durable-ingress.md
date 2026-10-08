# Durable availability ingress

Status: In Development
Owner roles: Backend Engineer, Security & Privacy Engineer, Quality Engineer
Last updated: 2026-10-08

## Objective

Compose the existing PostgreSQL adapters with the mutual-TLS availability server for one demonstration process.

## Scope and non-goals

In scope: open the relationship, approval, permission, advertisement, audit, and replay adapters only when `openDurableAvailabilityResources` is called. The returned dependencies feed `createRemoteHttpsServer`. A two-process test listens on `127.0.0.1` and covers ALLOW, ASK, DENY, revoke, replay, malformed input, recipient binding, restart, and minimal disclosure. The explicit DENY runs while the relationship is active. The relationship revoke runs later, with ALLOW still stored, and the denial is loaded by a new listener process.

Non-goals: `src/main.ts`, the CLI, a product UI, a pool opened by `LocalAvailabilityNode`, and Issue #13 acceptance. Remote input still cannot grant authority.

## Decisions and ADRs

ADR-0007. No new Reserved Product Decision. The node still does not open a pool.

## Validation commands

`npm.cmd run verify`

The handshake and the demonstration generate throwaway certificates with `openssl`. They do not commit a private key. GitHub Actions quality is the live PostgreSQL evidence.

## Risks, assumptions, and open questions

Engineering Accepted for Issue #13 is the coordinator record on main `7d47568533f8e2216ddcdd13d5c969d905fb6e08` after review of the extended demonstration. The Human Product Owner accepted that demonstration on 2026-10-08. This plan did not grant the acceptance.
