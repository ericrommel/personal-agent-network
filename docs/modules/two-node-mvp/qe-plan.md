# Two-node QE plan

Date: 2026-10-08

This is the test strategy for Issue #13. It does not execute the acceptance suite, and it does not accept the demonstration. Human Product Owner acceptance stays human-only.

D1 through D8 and PRQ-002 are resolved. Historical `TBD-PO` sentences in `preparation.md` are the 2026-10-07 record. They are not open gates. This plan uses the resolved semantics.

## What a passing run must be

Two operating-system processes. Each process is one owner boundary. The receiver's relationship authority is PostgreSQL. The revoked row is loaded after restart. Empty memory is not a durable deny.

An all-in-memory run, including PR #62 and the argv adapter in PR #63, is a component probe. It is not this evidence. ADR-0004 is the reason.

## Scenarios

ALLOW. A current exact permission, a future half-open UTC interval inside the next 7 days and at most 4 hours, and policy `ALLOW`. The caller receives only `{ result: boolean }`. No approval row is created. The audit event is `disclosure` / `released` and does not contain the boolean, the interval, or the permission effect.

ASK. Policy `ASK` creates one pending approval and does not read context. The local owner approves that exact request. One later request releases `{ result: boolean }` and spends `pan_approval_<uuid>`. The same request id does not read context again. A different end on the same request id keeps the stored end and the caller still receives only `{ outcome: "unavailable" }`. There is no public conflict body. Expiry is 10 minutes. There is no notification transport. The owner-visible record has no raw context, profile, or model justification.

DENY. A missing permission, an explicit deny, and a failed fresh receiver-local `readActive` — including a missing row, a revoked row, a thrown read, or an ineligible or unknown party — each return only `{ outcome: "unavailable" }`. Context is not read. The public body does not contain `ALLOW`, `ASK`, or `DENY`. Discovery membership is not an input to this decision.

Revoke. Revoking the stored permission invalidates pending and approved-but-unreleased rows for that ordered pair. If the relationship disappears after the boolean is computed and before release, the result is not delivered and the audit outcome is `invalidated`. A result already delivered is not retracted.

Malformed input. An extra body field, a bad principal, a past or otherwise invalid public interval, or a throwing context read fails closed. The public denial stays `{ outcome: "unavailable" }`. Text in the body cannot grant a permission or change policy. A stored approval `expiresAt` that does not parse also fails closed before a context read. That check is not a rule for the public `start` and `end` fields. D5 still accepts a future half-open UTC interval inside the next 7 days and at most 4 hours, including second-precision instants.

Replay and freshness. A stale, duplicated, or rebound network message must fail closed without a second disclosure. The numeric window is not chosen. This plan does not pick one. Do not encode a number in an acceptance test until a later engineering decision records it. That unset number is not a new Reserved Product Decision. Approval idempotency for one request id is the D4 rule and is not a network replay cache.

Restart. A second process can load PostgreSQL rows for the relationship, the permission, the advertisement, the approval, and the audit. Relationship revoke and advertisement withdraw make the next decision deny, read no context, and leave an approved ASK approved. Permission revoke invalidates pending and approved-unreleased rows, and the second process sees that invalidated state. A delivered result is not retracted. These probes are not the two-node demonstration, and they do not accept Issue #13.

## What is already covered

Process-local unit tests cover the relationship revoke, the permission and policy decision, the approval lifecycle, the availability budgets, the minimized audit log, and the in-process message boundary. PR #62 composed those pieces in one process. PR #63 is the argv adapter. None of those runs is Issue #13 acceptance.

PostgreSQL adapters for relationships, approvals, audit, permissions, and skill advertisements are on main. `LocalAvailabilityNode` uses an adapter only when that option is injected. The constructor does not open a database pool. GitHub Actions quality is the live database evidence. A skipped local run is not that evidence.

Two-process probes on main observe one successful ASK spend, expiry denial, a release one millisecond before expiry, permission invalidation, relationship revoke, relationship restore, advertisement withdraw, advertisement readvertise, a process-local budget that a second process does not inherit, a different end on the same request id, an unparsable stored expiry, and a restarted clock one second after the interval start. That different end keeps the stored end, reads no context, and still lets the exact interval be spent once. The unparsable expiry fails closed without a context read and leaves the SQL row approved. The past start denies the exact request, reads no context, and leaves the approval approved so an earlier injected clock can spend it once. This change observes an owner rejection: the restarted process denies the exact request, reads no context, and leaves the SQL row rejected. Each probe is a bounded observation. Together they are not AC-MSG-001 and they are not Issue #13 acceptance.

## Still blocked inside this strategy

- No acceptance test may choose a replay or handshake-freshness window. The unset number is not a new Reserved Product Decision.
- Injected PostgreSQL adapters are not restart-safe two-node acceptance. The node still does not open a pool, and there is no listening HTTPS server.
- Relationship revoke and advertisement withdraw do not invalidate unreleased approvals. Permission revoke does. This plan does not add the other calls.
- The CLI adapter must not grow a grant or revoke command. Owner mutation stays on the existing local services.
- External AI stays out of the suite.
- No product UI.
- Do not check Engineering Accepted on Issue #13 from these probes.

## Commands that are not acceptance

`npm.cmd run verify` is the component gate. The two-process probes run in that gate when the database URL is set. They are not the Issue #13 acceptance command. That command does not exist yet. When it does, the evidence record must show the command, both public responses, and a separate read of the receiver's audit that contains neither the boolean nor the calendar.
