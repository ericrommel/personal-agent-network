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

Replay and freshness. A stale, duplicated, or rebound network message must fail closed without a second disclosure. ADR-0007 records the window: `expiresAt` is at most 5 minutes after `issuedAt`, the receipt clock accepts `issuedAt` at most 30 seconds ahead, and it accepts `expiresAt` at most 30 seconds behind. The demonstration uses that pair. It does not choose a different window. A denial before the handler appends one local audit event with category `decision`, outcome `unavailable`, and request id `unavailable`. That event copies neither the request nor a reason. The handler is not called. That recorded pair is not a new Reserved Product Decision. Approval idempotency for one request id is the D4 rule and is not a network replay cache.

Restart. A second process can load PostgreSQL rows for the relationship, the permission, the advertisement, the approval, and the audit. Relationship revoke and advertisement withdraw make the next decision deny, read no context, and leave an approved ASK approved. Permission revoke invalidates pending and approved-unreleased rows, and the second process sees that invalidated state. A delivered result is not retracted. These probes are not the two-node demonstration, and they do not accept Issue #13.

## What is already covered

Process-local unit tests cover the relationship revoke, the permission and policy decision, the approval lifecycle, the availability budgets, the minimized audit log, and the in-process message boundary. PR #62 composed those pieces in one process. PR #63 is the argv adapter. None of those runs is Issue #13 acceptance.

PostgreSQL adapters for relationships, approvals, audit, permissions, and skill advertisements are on main. `LocalAvailabilityNode` uses an adapter only when that option is injected. The constructor does not open a database pool. GitHub Actions quality is the live database evidence. A skipped local run is not that evidence.

Two-process probes on main observe one successful ASK spend, expiry denial, a release one millisecond before expiry, permission invalidation, relationship revoke, relationship restore, advertisement withdraw, advertisement readvertise, a process-local budget that a second process does not inherit, a different end on the same request id, an unparsable stored expiry, and a restarted clock one second after the interval start. That different end keeps the stored end, reads no context, and still lets the exact interval be spent once. The unparsable expiry fails closed without a context read and leaves the SQL row approved. The past start denies the exact request, reads no context, and leaves the approval approved so an earlier injected clock can spend it once. An owner rejection denies the exact request, reads no context, and leaves the SQL row rejected. A stored active DENY effect denies the exact request, reads no context, creates no approval row, and leaves that permission active DENY. An exact interval start spends the approved ASK once, reads context once, and leaves the SQL row released. The following handle does not read context again. Another requester, with a separate active relationship and ASK permission, does not spend that approved ASK, reads no context, and leaves the row approved for the bound requester. The bound requester then spends it once. Each probe is a bounded observation. Together they are not AC-MSG-001 and they are not Issue #13 acceptance.

## Still blocked inside this strategy

- The replay window is the ADR-0007 pair: 5 minutes and 30 seconds. The demonstration uses those parameters. It does not choose a new window.
- The node still does not open a pool. `openDurableAvailabilityResources` opens the existing pools only when that function is called. The two-process mutual-TLS demonstration is `tests/integration/durable-ingress-demo.test.ts`. Its explicit DENY runs while the relationship is active. Its relationship revoke keeps the stored effect at ALLOW and is loaded by a new listener process. The listener holds one private busy interval that overlaps the request, so an authorized boolean is false, and that interval is absent from the response, the audit, and the listener output. A stale envelope and a future envelope are denied before the handler. A second client certificate for the recipient does not receive the caller's ALLOW. Withdrawing the advertisement, while the relationship stays active and ALLOW stays stored, is loaded by a new listener and denies without an approval. The advertisement is restored before the relationship-revoke request. A skipped local run is not live evidence. Do not check Engineering Accepted from that command alone. The coordinator record is main `7d47568533f8e2216ddcdd13d5c969d905fb6e08`.
- Relationship revoke and advertisement withdraw do not invalidate unreleased approvals. Permission revoke does. This plan does not add the other calls.
- The CLI adapter must not grow a grant or revoke command. Owner mutation stays on the existing local services.
- External AI stays out of the suite.
- No product UI.
- The older two-process probes above are not Issue #13 acceptance. Engineering Accepted for the integrated demonstration is main `7d47568533f8e2216ddcdd13d5c969d905fb6e08`. The Human Product Owner accepted that demonstration on 2026-10-08. The test command does not check either box.

## Commands that are not acceptance

`npm.cmd run verify` is the component gate. The two-process probes, including `tests/integration/durable-ingress-demo.test.ts`, run in that gate when the database URL is set. A skipped local run is not live evidence. The demonstration command does not check Engineering Accepted. Its evidence is the public responses and a separate read of the receiver's audit that contains neither the boolean nor the calendar.
