# MVP Acceptance Criteria and Traceability

These criteria describe observable behavior. Automated tests should include the `AC-*` identifier in their name. `TBD-PO` criteria cannot be finalized until the linked Product Owner decision is resolved.

## Criteria

- **AC-ID-001 — Identity separation:** Given one owner with multiple personal agents, when identity records and public contracts are inspected, then Human Identity and each Agent Identity have distinct typed identifiers, ownership is explicit, and neither is accepted where the other is required.
- **AC-DOM-001 — Domain separation:** Given an active relationship and an advertised availability skill, when no matching permission exists, then invocation remains denied; changing relationship, skill advertisement, or permission changes only its own record and does not implicitly change the others.
- **AC-DIS-001 — Agent discovery:** Given a caller permitted under the approved discovery policy, when it resolves a registered identifier, then it receives only a minimal opaque agent reference. Unknown, unauthorized, and non-discoverable lookups reveal no profile, provider, relationship, context, skill, or policy information and satisfy the approved non-enumeration contract. **TBD-PO: discovery audience/identifier and observable uniformity.**
- **AC-AUTH-001 — ALLOW:** Given a current permission for the exact availability request, when the target processes a valid interval, then the response contains only `{ available: boolean }` plus safe protocol metadata; no source event or unrelated context crosses the boundary.
- **AC-APR-001 — ASK pending:** Given `ASK` applies, when the request arrives, then exactly one bound pending approval is created and no protected result is returned.
- **AC-APR-002 — ASK resolution:** Given a pending approval, when the authenticated owner approves that exact unexpired request, then its result may be released once. Rejection, expiry, duplicate approval, changed fields, changed policy, or another approver returns no result. **TBD-PO: approval channel, expiry, notification, and rejection semantics.**
- **AC-AUTH-002 — DENY:** Given no applicable permission or an explicit denial, when the request is processed, then no result/private context is disclosed and the public response does not reveal the private reason.
- **AC-REV-001 — Revocation:** Given a grant is successfully revoked, when any later decision or final disclosure check references it, then access is denied and applicable pending approval is invalid. **TBD-PO: in-flight boundary and latency.**
- **AC-LIFE-001 — Request lifecycle:** Given a request moves through pending, completed, rejected/denied, expired, or failed states, when its owning party inspects it, then the current state is represented consistently; an untrusted remote party receives only the disclosure-safe public state.
- **AC-PRV-001 — Minimal disclosure:** Given the context contains event titles, people, and locations, when a permitted query succeeds and audit is inspected, then the remote output contains only the boolean and logs/audit contain none of those details or the derived result.
- **AC-SEC-001 — Untrusted input:** Given a message instructs the receiver to alter policy, self-grant, bypass approval, reveal context, call tools, or ignore rules, when processed, then the text has no authority, policy remains unchanged, and only validated structured fields are evaluated.
- **AC-MSG-001 — Integrity and replay:** Given a tampered, stale, misdirected, spoofed, or duplicate message, when ingress processes it, then it fails safely, causes no duplicate approval/evaluation/disclosure, and records a redacted audit event.
- **AC-VAL-001 — Invalid input:** Given an invalid interval, unknown skill, oversized payload, expired request, or unavailable policy verification, when handled, then processing is bounded and fails closed without protected disclosure.
- **AC-CFG-001 — Secure production defaults:** Given a production configuration with placeholder secrets, debug authentication, or insecure transport, when the service starts, then startup fails with a non-sensitive diagnostic. This criterion becomes executable when runtime configuration is introduced.
- **AC-AUD-001 — Auditability:** Given any request path, when an authorized operator queries by correlation ID, then decisions and state transitions are reconstructable without raw private context, message bodies, secrets, credentials, or protected results. **TBD-PO: access, retention, export, and deletion.**
- **AC-DEV-001 — Reproducible workflow:** Given a clean checkout with supported Node/npm, when `npm ci`, `npm run verify`, and `npm run build` run, then locked installation and all local quality gates succeed.
- **AC-DEV-002 — CI security gates:** Given a Pull Request, when CI runs, then high-or-critical dependency findings, detected secrets, relevant CodeQL findings, or a failed required quality/build gate fail the workflow. Any exception is recorded with owner, rationale, and expiry.
- **AC-DEV-003 — Contract governance:** Given a public or domain contract is introduced or changed, when it is reviewed, then it has an explicit version; a breaking change is identified and linked to affected requirements, acceptance criteria, and review evidence. This criterion becomes executable with the first public contract.
- **AC-QE-001 — Synthetic negative fixtures:** Given the acceptance/security suites, when their fixtures are inspected and executed, then they use only synthetic identities/context and cover ALLOW, ASK, DENY, revocation, replay, malformed input, enumeration resistance, and prompt injection.
- **AC-AI-001 — External AI boundary:** Given external AI integration is disabled or receives data, when the adapter is exercised, then it receives no private context by default and only explicitly approved minimum fields when enabled; its output cannot authorize or invoke tools. This criterion is deferred until that module is approved.

## Traceability matrix

| Requirement(s) | Acceptance criteria |
|---|---|
| FR-001 | AC-ID-001 |
| FR-003 | AC-DOM-001 |
| DEV-004 | AC-DEV-003 |
| FR-002, PRV-001, PRV-006, SEC-012, SEC-018 | AC-DIS-001 |
| FR-004, FR-005, FR-006, PRV-002, PRV-003, SEC-003, SEC-010, SEC-011 | AC-AUTH-001, AC-PRV-001 |
| FR-007, FR-012, SEC-008 | AC-APR-001, AC-APR-002 |
| FR-011 | AC-LIFE-001 |
| FR-008, SEC-005, SEC-018, PRV-006 | AC-AUTH-002 |
| FR-009, SEC-009, REL-001, REL-004 | AC-REV-001 |
| FR-010 | AC-AUTH-001; simulated-context contract is specified with its module |
| SEC-001–SEC-002, SEC-006–SEC-007, REL-002 | AC-MSG-001 |
| SEC-004, SEC-013 | AC-SEC-001 |
| SEC-014, REL-003 | AC-VAL-001 |
| SEC-015 | AC-CFG-001 |
| SEC-016, DEV-002 | AC-DEV-002; CI evidence |
| DEV-001 | AC-DEV-001 |
| DEV-003 | AC-QE-001 |
| SEC-017, PRV-004, PRV-005, OBS-001, OBS-002, OBS-003 | AC-AUD-001, AC-PRV-001 |
| PRV-007 | AC-AI-001 |
| PRV-008 | AC-DIS-001, AC-VAL-001; exact budgets are TBD-PO |

No requirement is considered implemented from this bootstrap traceability alone. Each module adds concrete automated-test evidence before acceptance.
