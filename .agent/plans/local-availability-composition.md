# Local availability composition

Status: Code Review
Owner roles: Engineering Coordinator, Backend Engineer, Security and Privacy Engineer, Quality Engineer
Last updated: 2026-10-08
Tracking: Issues #8, #9, #10, #11, #12, and #13. Queue D4, D5, D6, D8. This plan does not accept Issue #13.

## Objective

Wire the process-local availability path so one node can decide, approve, read a boolean, and append a minimized audit event. The remote entry is `LocalAvailabilityNode.handle`. Restart drops every store this node owns. This is not two-node acceptance and not restart-safe authorization.

## Scope and non-goals

In scope:

- `queryAvailability` stays ALLOW-only. `readAuthorizedBoolean` is the budgeted read used after a separate authorization decision.
- The messaging port passes `requestId` through to that read.
- One class owns in-memory relationships, advertisements, permissions, approvals, availability, and the audit log.
- Permission revoke calls `ApprovalService.invalidateUnreleased` for that ordered pair before the revoke result returns.
- ASK reads context only when the stored approval is approved, unexpired, and bound to the same requester, target, start, and end.
- Release spends `pan_approval_<uuid>`, resolved inside the node from the messaging request id.
- One minimized audit event is appended after the handler returns. Append failure still returns the handler response.

Out of scope:

- HTTP, mutual TLS handshake, replay cache, and any freshness window.
- PostgreSQL inside this node. The relationship adapter on main stays unused here.
- A CLI, a product UI, and `src/main.ts`.
- Changing `ApprovalService.release` so an expired row becomes `expired`.
- Human Product Owner acceptance. Engineering Accepted is not claimed for this composition or for Issue #13.
- Whole-module messaging acceptance.

## Requirements and acceptance criteria

Exercised by the new tests, without claiming the historical `TBD-PO` sentences in `docs/product/acceptance-criteria.md` are still open:

- AC-AUTH-001 and AC-PRV-001: ALLOW returns `{ result: boolean }` and the audit event has no boolean, interval, or permission effect. The public field is `result`, as resolved by D8. The older `{ available: boolean }` wording is not reopened.
- AC-APR-001: ASK before approval does not read context.
- AC-APR-002: an approved exact request is delivered once. A second delivery does not read context again. D4 fixed the 10-minute expiry, idempotent duplicate ids, and the absence of a notification transport.
- AC-AUTH-002: missing permission, an unknown local agent, and DENY return `{ outcome: "unavailable" }` and do not read context.
- AC-REV-001: revoking the stored permission invalidates the approved row. A relationship that disappears after the boolean is computed invalidates that row and does not deliver. D4 fixed the in-flight rule used here.
- AC-VAL-001: a past interval and a non-canonical `expiresAt` fail closed.
- AC-AUD-001 and D6: local operator only, categories `decision`, `approval`, `disclosure`, and `revocation`. No remote audit query was added.
- AC-MSG-001 is not met. Replay and handshake freshness are not implemented. The numeric window is not chosen.

## Context and affected components

`AvailabilityService.queryAvailability` returns null unless `decision` is exactly `ALLOW`, then calls `readAuthorizedBoolean`. A throwing `decision` getter is caught. `readAuthorizedBoolean` catches its own context and clock failures.

`handleAvailabilityRequest` already re-decides after the read and spends an ASK only when the post-release decision is still `ASK`. The node maps `release(requestId, relationshipActive)` to `ApprovalService.release(approvalId, relationshipActive)`.

`decideAuthorization` is called again inside `queryAvailability`. ALLOW, or ASK plus an exact approved unexpired row, may read. DENY and every other state return null and do not consume the availability budget.

## Decisions and ADRs

No new ADR. ADR-0004 still says an all-in-memory run is not MVP acceptance evidence. ADR-0006 is unchanged because this node does not open a database.

`queryAvailability` on the node does not spend an approval. Single-use release stays in `handle`. Direct use of the method is in-process plumbing, not a remote surface. A later CLI must call `handle` for a remote request.

`findByRequestId` only returns rows whose `expiresAt` already passed the canonical parser. The node still treats a non-canonical value as closed. The test reaches that branch by replacing the lookup, because the store cannot emit the row.

## Security and privacy considerations

The remote message does not choose the requester. `handle` takes the principal from the caller. This slice does not check a certificate, a handshake age, or a replay cache. It is safe only inside one process.

Denial stays `{ outcome: "unavailable" }`. Success stays `{ result: boolean }`. Audit outcomes do not include `allow`, `ask`, the boolean, or the interval. A missing principal records request id `unavailable` rather than an untrusted body field.

ASK and DENY do not enter `readAuthorizedBoolean` through `AvailabilityService.queryAvailability`. The node calls `readAuthorizedBoolean` only after its own decision. A bad clock, a bad expiry, a mismatched binding, or a pending row returns null before the busy-interval read.

The audit operator is created inside the node. The remote principal is not that operator. If append returns a failure, the boolean is still returned. The node does not wrap append in a way that withholds disclosure.

## Implementation sequence

1. Split the authorized context read from the ALLOW-only query.
2. Pass `requestId` through the messaging port.
3. Add `LocalAvailabilityNode` and the coverage glob for `src/runtime/**`.
4. Cover ALLOW, DENY, ASK single-use, duplicate request ids, permission revoke, relationship loss before release, expired and malformed approvals, directory miss, default empty context, and audit-append failure.

## Developer tests

`tests/unit/runtime/local-availability-node.test.ts` covers the composition. Existing availability and handler tests cover the port split. The developer run does not start Docker. The Postgres integration test remains the skipped local test and is unchanged by this slice.

## QE and acceptance verification

Independent Security and QE review of this head is required before merge. The author does not self-certify Engineering Accepted. Two-node acceptance remains open: two processes, replay rejection, and the PostgreSQL restart observation are still required.

## Validation commands

From the composition worktree, on 2026-10-08, after the directory-miss test:

`npm.cmd run verify`

Observed: format, lint, and `tsc --noEmit` passed. Vitest reported 151 passed and 1 skipped. Coverage for `src/runtime/local-availability-node.ts` and the existing per-module globs was 100% statements, branches, functions, and lines. The skipped test is `tests/integration/postgres-relationship-store.test.ts` because no local database URL is set.

## Risks, assumptions, and open questions

- A caller inside the process can invoke `queryAvailability` without spending an approval. Remote ingress must not expose that method.
- `authenticatedAt` is still only checked as a parseable date by the messaging principal parser. This node does not add a freshness window.
- Approval, audit, permission, advertisement, and relationship state in this node are lost on restart. Empty memory after restart is not a durable deny.
- The final `?? null` on the default directory lookup is reachable when a command names an agent that was not constructed into the node. `readActive` does not call `findAgent` when no row exists, so a message from an unknown agent does not hit that branch.
- No new Reserved Product Decision.

## Progress

- [x] 2026-10-08: node, port split, and tests implemented.
- [x] 2026-10-08: `npm.cmd run verify` passed with 100% runtime coverage. 151 passed, 1 skipped.
- [ ] Independent Security review of this head.
- [ ] Independent QE review of this head.
- [ ] Required CI green on the pull-request head, then coordinator merge.

## Discoveries and decision log

- 2026-10-08: Removing the outer `try` on `AvailabilityService.queryAvailability` would let a throwing `decision` getter escape. The `try` stays. A unit test covers it. `readAuthorizedBoolean` still has its own `try`, so a throwing busy-interval getter does not use the outer catch.
- 2026-10-08: `expiresAt !== null` is kept. The store invariant makes it unreachable through `createAsk`, and deleting it would treat a null parse as epoch zero. The test stubs the lookup.
- 2026-10-08: Do not choose a replay window in this change.

## Handoff and completion evidence

The next engineer reviews `src/runtime/local-availability-node.ts` against D4, D5, and D6, then merges only with a `Role: Engineering Coordinator / Tech Lead` comment that cites the green head. Do not mark Issue #13 Engineering Accepted from this plan. Human acceptance checkboxes stay unchecked.
