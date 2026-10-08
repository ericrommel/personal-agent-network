# Later-module preparation index

Coordinator integration on 2026-10-08. These notes are preparation under delegated autonomous delivery. They are not implementation authorization and not Human Product Owner ratification. D1 through D8 are resolved. Historical preparation sentences that say Backlog or TBD-PO stay as the earlier record.

| Module | Issue | State | Note | Implementation |
|---|---|---|---|---|
| Authenticated Messaging | #9 | In Development | `authenticated-messaging/preparation.md` | D8 is resolved. ADR-0007 records a 5-minute validity window and 30 seconds of skew. The mutual-TLS availability server exists. `src/main.ts` and the CLI do not listen. This is not module acceptance. |
| Context Boundary and Availability | #10 | In Development | `context-boundary/preparation.md` | D5 is resolved. Boolean availability and the process-local budgets are on main. The budgets are not a durable store. This is not module acceptance. |
| Approval Lifecycle | #11 | In Development | `approval-lifecycle/preparation.md` | D4 is resolved. The lifecycle and the injected approval store are on main. Permission revoke invalidates unreleased approvals. Relationship revoke and advertisement withdraw do not. This is not module acceptance. |
| Audit | #12 | In Development | `audit/preparation.md` | D6 is resolved. The minimized log and the injected audit store are on main. There is no remote audit query. This is not module acceptance. |
| Two-Node MVP | #13 | In Development | `two-node-mvp/preparation.md` | D7 is resolved: two processes and a thin local CLI, with no product UI. ADR-0007 records the replay window. The mutual-TLS demonstration is not Engineering Accepted and not Human Product Owner acceptance. |

Issue #14 External AI stays post-core-MVP. No preparation note was added.

Issue comments carry the current operational state. This index must not say Blocked for a resolved PRQ. Reserved decisions that remain open are in `docs/product/review-queue.md`. This note does not edit that queue and does not check Engineering Accepted.
