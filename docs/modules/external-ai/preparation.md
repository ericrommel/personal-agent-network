# External AI preparation

## Status

Issue #14, External AI Integration. The Human Product Owner approved Ready for
Development on 2026-10-08. Engineering Accepted for the bounded ADR-0008 slice
is main `82d5be381efa117cc6bfaf65eb510b8415c15b19` (PR #115). The module is
Ready for PO Acceptance. This note does not record Human Product Owner
acceptance.

## Slice

`answerAvailabilityQuestion` asks one `ExternalAiProvider` to call
`pan_availability_check`. PAN resolves the label locally, checks the D5
interval, and posts one mutual-TLS availability envelope. The provider then
receives only the public result and may phrase it. ADR-0008 records the
adapter choice.

## Non-goals

- A second provider.
- Provider identity in PAN storage.
- Raw private context in the provider request.
- General tool execution, a real calendar, or a product UI.
- A remote approval channel. ASK stays a local owner action.
- Listening from `src/main.ts` or the CLI.

## Evidence

Developer tests cover a fake provider, the xAI request shape against a fake
HTTP transport, and one mutual-TLS call into `LocalAvailabilityNode`. An ALLOW
overlap returns `{ result: false }` to the model without the busy instants. A
DENY does not read context. Required checks on reviewed head
`575b12c86c0bf6eb2e5c82c85c53f234554f8830` succeeded: quality job
`113586278266`, secret-scan job `113586278593`, codeql job `113586278411`, and
CodeQL run `113586542132`. Security review
https://github.com/ericrommel/personal-agent-network/pull/115#issuecomment-6071008725
and Quality review
https://github.com/ericrommel/personal-agent-network/pull/115#issuecomment-6070960075
found no blocking defect. No new Reserved Product Decision is open.
