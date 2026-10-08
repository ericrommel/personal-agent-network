# Availability CLI adapter

Status: Code Review
Owner roles: Engineering Coordinator, Backend Engineer, Quality Engineer
Last updated: 2026-10-08
Tracking: Issue #13, D7 / PRQ-009. This plan does not accept the two-node demonstration.

## Objective

Add a thin local argv adapter that calls `LocalAvailabilityNode.handle` and prints its JSON response. The adapter prepares the D7 CLI surface. It is one process, it opens no port, and it is not acceptance evidence.

## Scope and non-goals

In scope: `runAvailabilityCli` and its unit tests. The only command is `request`.

Out of scope: a product UI, an HTTP server, owner grant or revoke commands, seeding a relationship, PostgreSQL, replay protection, a freshness window, changes to `src/main.ts`, and Issue #13 acceptance. There is no `seed` command, so this adapter is not a second authorization path.

## Requirements and acceptance criteria

D7 chose two processes and a thin local CLI. This slice is only the argv adapter for one process. AC-MSG-001 remains unmet. The public response shape stays `{ result: boolean }` or `{ outcome: "unavailable" }`.

## Context and affected components

The adapter sits on PR #62's `LocalAvailabilityNode`. It does not reimplement policy, approval, context, or audit. `src/main.ts` still prints foundation status.

## Decisions and ADRs

No new ADR. Unparseable argv is a local usage error on stderr and is not copied into the message response. A thrown `handle` prints the uniform denial and does not print the exception text. Exit 0 means the node returned a response. Exit 1 means `handle` threw. Exit 2 means the operator's argv was not a request.

## Security and privacy considerations

The command cannot grant a permission or change a relationship. Invalid JSON is not echoed. A thrown error is not echoed, because the message might contain private context. The adapter does not choose a requester. The principal JSON is passed through to `handle`, which already rejects a body that claims the sender.

## Implementation sequence

1. Add the argv function under `src/runtime/`.
2. Cover usage, both JSON failures, both response shapes, a thrown handler, and one real empty node.
3. Keep `src/runtime/**` at 100% coverage.

## Developer tests

`tests/unit/runtime/availability-cli.test.ts`.

## QE and acceptance verification

Independent review happens after this branch is pushed. A green test run is not two-node acceptance. Acceptance still needs two processes, replay rejection, and the PostgreSQL restart observation.

## Validation commands

`npm.cmd run verify` from this worktree on 2026-10-08. Format, lint, and `tsc --noEmit` passed. Vitest reported 155 passed and 1 skipped. `src/runtime/availability-cli.ts` and `src/runtime/local-availability-node.ts` were both at 100% statements, branches, functions, and lines. The skipped test is the local Postgres relationship integration test.

## Risks, assumptions, and open questions

The numeric replay window is not chosen. Do not add one here. An empty node denies every request. That denial is missing local state, not a durable revoke. No new Reserved Product Decision.

## Progress

- [x] 2026-10-08: adapter and tests written.
- [x] 2026-10-08: `npm.cmd run verify` passed. 155 passed, 1 skipped. Runtime coverage 100%.
- [ ] Independent review and required CI.

## Discoveries and decision log

- 2026-10-08: Owner mutation stays out of this command. Wiring PostgreSQL and a second process is later work.

## Handoff and completion evidence

Do not mark Issue #13 Engineering Accepted from this adapter. Human acceptance stays unchecked.
