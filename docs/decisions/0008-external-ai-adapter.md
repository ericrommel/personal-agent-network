# ADR-0008: Provider-neutral external AI availability slice

Status: Accepted
Date: 2026-10-09
Decision owners: Engineering Coordinator, Software Architect, Security & Privacy Engineer

## Context

Issue #14 is Ready for Development. The Human Product Owner accepted the
deterministic two-node path and asked for the smallest provider-neutral slice:
a person asks an external model a question such as whether Maria is available,
the model invokes PAN, and PAN returns only an authorized public result.

D8, ADR-0007, and the availability policy path stay the authorization boundary.
Model output is untrusted input under SEC-004 and SEC-013.

## Decision

PAN calls one replaceable `ExternalAiProvider`. The first adapter is the
SpaceXAI Responses API at `https://api.x.ai/v1/responses`, model `grok-4.7`.
The API key arrives only as an injected value and is sent only in the
`Authorization` header. Tests use a fake transport. The key is never committed.

The model may emit one `pan_availability_check` call with `who`, `start`, and
`end`. `who` is a label. The host resolves it through an injected local map
that is not sent to the provider. Unknown labels, extra fields, and any other
tool fail closed. A valid call is sent with `requestRemoteAvailability` over
mutual TLS. The certificate is the sender. The model cannot choose it.

The only bytes returned to the provider are `{"result":true}`,
`{"result":false}`, or `{"outcome":"unavailable"}`. A later model sentence is
untrusted display text. It is not a decision. The model cannot grant a
relationship, permission, approval, context read, or tool.

## Alternatives considered

- A provider SDK. The repository would take a second HTTP stack for one POST.
- Sending the model an agent id or the label map. That exports the owner's
  address book.
- Letting the model phrase a denial from a reason code. ADR-0007 already
  forbids that on the agent path.
- A product UI or a CLI command. This slice is a library call.

## Consequences

`src/main.ts` and the CLI do not gain a listener, a grant command, or a
provider key. One configured peer is the route for this slice. Natural-language
timezone interpretation is the model's untrusted output and must still parse as
a D5 UTC interval. No calendar provider is added. A second model adapter can
replace `createXaiResponsesProvider` without changing the question function.

## Security and privacy impact

The provider is not a PAN identity and is not stored in PostgreSQL. Private
busy intervals stay on the receiving node. Approval remains a local owner
action. An `ASK` or `DENY` is the same public unavailable result the model
already sees for every other failure.

## Requirements affected

Issue #14, SEC-004, SEC-010, SEC-011, SEC-013, and SEC-018. No new Reserved
Product Decision.

## Supersedes / Superseded by

None.
