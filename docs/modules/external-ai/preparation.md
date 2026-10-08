# External AI preparation

## Status

Issue #14, External AI Integration. The Human Product Owner approved Ready for
Development on 2026-10-08. This note records the first slice. It is not Human
Product Owner acceptance.

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
DENY does not read context. No new Reserved Product Decision is open.
