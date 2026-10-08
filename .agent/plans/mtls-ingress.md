# Mutual-TLS availability ingress

Status: In Development
Owner roles: Backend Engineer, Security & Privacy Engineer, Quality Engineer
Last updated: 2026-10-08

## Objective

Terminate one availability envelope on Node's built-in HTTPS stack with mutual TLS.

## Scope and non-goals

In scope: `POST /pan/availability/v1`, peer URI SAN, the existing envelope gate, a 16 KiB body cap, and the public success or denial objects.

Non-goals: `src/main.ts`, the CLI, a product UI, a database pool, durable composition, and Issue #13 acceptance. The server does not grant a relationship, permission, approval, or context read.

## Requirements and acceptance criteria

- A client certificate URI SAN and a fresh envelope produce `{ result: boolean }` from the injected handler.
- A missing certificate, a bad path, a large body, a duplicate message id, and a handler failure all produce `{ outcome: "unavailable" }` and do not add fields.
- `requestCert` and `rejectUnauthorized` are both true. TLS below 1.2 is not accepted by the option object.

## Decisions and ADRs

ADR-0007. No new Reserved Product Decision. The path and the 16 KiB cap are engineering limits for this one route.

## Validation commands

`npm.cmd run verify`

The handshake test shells out to `openssl` and listens on `127.0.0.1`. It does not commit a private key.

## Risks, assumptions, and open questions

The node still does not listen by itself. Wiring this server to the durable stores for the two-process demonstration is the next slice.
