# Remote availability envelope

Status: Merged as pull request #106. The listener and the PostgreSQL replay table were non-goals of that slice.
Owner roles: Backend Engineer, Security & Privacy Engineer, Quality Engineer
Last updated: 2026-10-08

## Objective

Add the fail-closed remote envelope gate from the Issue #13 authorization and ADR-0007.

## Scope and non-goals

In scope: envelope parsing, the 5-minute window, 30-second skew, URI SAN principal, and an in-memory single-use `messageId` store.

Non-goals: the listening HTTPS server, the PostgreSQL replay table, a product UI, and Issue #13 acceptance. The in-memory store is not restart-safe evidence.

## Requirements and acceptance criteria

- A fresh envelope returns the SAN principal and the availability body.
- The receipt time is `authenticatedAt`, not `issuedAt`.
- Expired, early, over-long, duplicate, malformed, and misdirected envelopes return null and do not read context.
- A new `messageId` may repeat the body `requestId`.

## Decisions and ADRs

ADR-0007. No new Reserved Product Decision.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

The durable replay adapter and the mutual-TLS listener are the next slices. Relationship revoke and advertisement withdrawal already fail closed on the fresh authorization check before release.
