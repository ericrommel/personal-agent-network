# Quality Strategy

## Risk priorities

P0 failures block merge and release: authorization bypass, protected result before approval, revoked permission reuse, context leakage, spoofing/replay/tampering, prompt-injection authority, and sensitive audit leakage. P1 risks include enumeration, approval races, duplicate delivery, malformed/oversized input, abuse controls, dependency failure, and audit completeness.

## Test architecture and ownership

- **Unit:** developer-owned pure policy, state-transition, validation, disclosure, and redaction tests.
- **Component:** developer-owned boundary tests with fakes; policy/approval/context, discovery privacy, and idempotency.
- **Contract:** developer-owned versioned message/adapter schemas, including invalid payloads; QE reviews coverage.
- **Integration:** developer-owned real persistence/runtime tests for migrations, revocation atomicity, approval races, and audit behavior.
- **Acceptance/security:** developers automate; QE independently verifies requirement evidence and adversarial cases.
- **End-to-end:** a small deterministic two-node suite for ALLOW, ASK, DENY, revocation, and minimal disclosure.
- **Exploratory:** QE probes sequencing, indirect leakage, recovery, and malicious inputs; confirmed defects become developer-owned regressions.

## Coverage and evidence

Every MVP requirement maps to stable acceptance criteria and every security/privacy behavior has negative coverage. Before implementation of a security-critical policy, approval, revocation, disclosure, or validation module, its test configuration must add thresholds requiring complete decision and branch coverage for that module. Other code starts at 80% lines/statements/functions and 75% branches, with documented exclusions only for generated, config, or type-only code. Coverage is evidence, not a substitute for behavior tests. QE reviews that evidence and does not become the default author of the implementation tests.

Test names include `AC-*` identifiers. Pull Requests list affected requirements/criteria and commands/results. CI publishes test/coverage evidence when reporting is introduced; no raw private test data enters artifacts.

## Required gates

`npm run verify` runs format, lint, strict types, tests, and bootstrap coverage thresholds. CI also builds, audits locked dependencies, scans Git history for secrets, runs CodeQL, and fails when CodeQL emits a finding. Focused tests and any P0 failure, leaked secret, high/critical dependency vulnerability, or unmet configured threshold fail the gate. Skipped tests cannot count as acceptance evidence and require explicit review. Exceptions require an owner, rationale, compensating control, and expiry.

The bootstrap tests validate the toolchain only; they do not claim PAN behavior. Module-specific test plans and negative cases are added before each Definition of Ready.
