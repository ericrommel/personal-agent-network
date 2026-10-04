# Security and Privacy Principles

1. **Authenticate, then authorize.** Claimed sender data is never identity proof. Identity, relationship, skill support, and permission are independent.
2. **Deny by default and fail closed.** Missing, stale, ambiguous, or unavailable security inputs grant nothing.
3. **Remote messages are always untrusted.** Text cannot alter policy, approve itself, expand context, invoke tools, or override rules.
4. **Keep authorization deterministic.** LLMs and external AI remain outside the final policy, tool, and disclosure enforcement path.
5. **Minimize disclosure.** Query private context through a narrow local port and emit only a schema-allowlisted derived result.
6. **Re-check mutable authority.** Revocation and current policy are checked at decision and immediately before context access or disclosure.
7. **Bind approval exactly.** Approval is authenticated, expiring, single-use, and bound to requester, target, skill, purpose, input, disclosure, request, and policy version.
8. **Resist replay and abuse.** Authenticate transport, validate bounded envelopes, enforce freshness/idempotency, rate-limit, and use bounded work queues/timeouts.
9. **Audit safely.** Record decisions and lifecycle metadata, not raw context, message bodies, prompts, credentials, secrets, or derived results by default.
10. **Use secure defaults and mature standards.** No custom cryptography or identity protocol; no disabled TLS verification; no placeholder production secrets.
11. **Protect the supply chain.** Lock dependencies, minimize them, review additions, and block relevant secret, vulnerability, and static-analysis findings.
12. **Use synthetic data.** Tests, fixtures, examples, screenshots, and logs must contain no real personal data or credentials.

## Secrets and configuration

Secrets never enter source control. Future configuration uses environment variables for local development and an approved secret store for deployed environments. `.env.example` contains fake placeholders only. Production must reject example credentials, debug authentication, and insecure transport.

## Blocking rule

A finding that permits impersonation, authorization bypass, premature approval disclosure, revoked access, context leakage, untrusted instruction authority, or sensitive audit leakage blocks implementation or release until resolved or explicitly accepted by the Human Product Owner with security advice and a recorded rationale.
