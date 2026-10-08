# Two-node QE plan

Date: 2026-10-08

This is the test strategy for Issue #13. It does not execute the acceptance suite, and it does not accept the demonstration. Human Product Owner acceptance stays human-only.

D1 through D8 and PRQ-002 are resolved. Historical `TBD-PO` sentences in `preparation.md` are the 2026-10-07 record. They are not open gates. This plan uses the resolved semantics.

## What a passing run must be

Two operating-system processes. Each process is one owner boundary. The receiver's relationship authority is PostgreSQL. The revoked row is loaded after restart. Empty memory is not a durable deny.

An all-in-memory run, including PR #62 and the argv adapter in PR #63, is a component probe. It is not this evidence. ADR-0004 is the reason.

## Scenarios

ALLOW. A current exact permission, a future half-open UTC interval inside the next 7 days and at most 4 hours, and policy `ALLOW`. The caller receives only `{ result: boolean }`. No approval row is created. The audit event is `disclosure` / `released` and does not contain the boolean, the interval, or the permission effect.

ASK. Policy `ASK` creates one pending approval and does not read context. The local owner approves that exact request. One later request releases `{ result: boolean }` and spends `pan_approval_<uuid>`. The same request id does not read context again. A different end on the same request id conflicts and keeps the original end. Expiry is 10 minutes. There is no notification transport. The owner-visible record has no raw context, profile, or model justification.

DENY. A missing permission, an explicit deny, or an agent that is not in the receiver's directory returns `{ outcome: "unavailable" }`. Context is not read. The public body does not contain `ALLOW`, `ASK`, or `DENY`.

Revoke. Revoking the stored permission invalidates pending and approved-but-unreleased rows for that ordered pair. If the relationship disappears after the boolean is computed and before release, the result is not delivered and the audit outcome is `invalidated`. A result already delivered is not retracted.

Malformed input. An extra body field, a bad principal, a past interval, a non-canonical expiry, or a throwing context read fails closed. The public denial stays `{ outcome: "unavailable" }`. Text in the body cannot grant a permission or change policy.

Replay and freshness. A stale, duplicated, or rebound network message must fail closed without a second disclosure. The numeric window is not chosen. This plan does not pick one. Do not encode a number in an acceptance test until a later engineering decision records it. That unset number is not a new Reserved Product Decision. Approval idempotency for one request id is the D4 rule and is not a network replay cache.

Restart. Revoke the relationship. Restart the receiver. The next decision and the check immediately before disclosure deny because the revoked PostgreSQL row was loaded. Applicable unreleased approval state on that same durable authority is still invalid after restart. This observation is not done.

## What is already covered

Process-local unit tests on main cover the relationship revoke, the permission and policy decision, the approval lifecycle, the availability budgets, the minimized audit log, and the in-process message boundary. PR #62 covers the composition of those pieces in one process. PR #63 covers the argv adapter only. None of those runs is Issue #13 acceptance.

The Postgres relationship integration test runs in GitHub Actions. It does not restart a second process.

## Still blocked inside this strategy

- No acceptance test may choose a replay or handshake-freshness window.
- Approval, audit, and permission stores are still process-local. Single-use approval and audit reconstruction are not restart-safe until those stores are durable. The next persistence slice is a PostgreSQL approval store. It is not on main. Wiring it must await invalidation. A fire-and-forget call would miss D4.
- The CLI adapter must not grow a grant or revoke command. Owner mutation stays on the existing local services.
- External AI stays out of the suite.
- No product UI.

## Commands that are not acceptance

`npm.cmd run verify` is the component gate. The two-process command does not exist yet. When it does, the evidence record must show the command, both public responses, and a separate read of the receiver's audit that contains neither the boolean nor the calendar.
