# External AI availability slice

Status: Done
Owner roles: Engineering Coordinator, Backend Engineer, Security & Privacy Engineer, Quality Engineer
Last updated: 2026-10-10

## Objective

Let a host ask one replaceable external model whether a labeled person is
available. PAN performs the existing mutual-TLS availability flow and returns
only the authorized public result to the model.

## Scope and non-goals

Scope: one provider port, one xAI Responses adapter, one mutual-TLS client, and
the question function in ADR-0008.

Non-goals: a second provider, a product UI, a CLI command, a calendar, general
tool execution, provider identity, and a remote approval channel.

## Requirements and acceptance criteria

Issue #14. SEC-004, SEC-010, SEC-011, SEC-013, and SEC-018. The model output
cannot grant authority. The provider sees only the public availability object.

## Context and affected components

`src/modules/external-ai/`, `src/runtime/remote-availability-client.ts`, and the
existing availability ingress. `src/main.ts` stays a foundation status print.

## Decisions and ADRs

ADR-0008. The first adapter is SpaceXAI model `grok-4.7` through
`https://api.x.ai/v1/responses`. The key is injected and is not committed.

## Security and privacy considerations

Label map and busy intervals stay off the provider request. The sender is the
client certificate. Extra tool fields and unknown tools do not call PAN.

## Implementation sequence

1. Add the port, question function, xAI adapter, and mutual-TLS client.
2. Cover the fake provider, the adapter request, ALLOW, and DENY.
3. Security and QE review, then CI.

## Developer tests

`tests/unit/modules/external-ai/` and
`tests/unit/runtime/remote-availability-client.test.ts`.

## QE and acceptance verification

The mutual-TLS test must show a false boolean without the busy instants, and a
DENY without a context read. The local return includes that public object.
Human Product Owner acceptance is recorded on 2026-10-09.

## Validation commands

`npm.cmd run verify` from the feature worktree. Integration tests that need
PostgreSQL skip when `PAN_RELATIONSHIP_DATABASE_URL` is unset. GitHub Actions
`quality` is the live database run.

## Risks, assumptions, and open questions

The slice routes one configured peer. A label for a different agent fails
closed. Timezone wording is untrusted model output and must still be a D5 UTC
interval. No new Reserved Product Decision.

## Progress

- [x] 2026-10-09: ADR-0008 and the first slice implemented.

## Discoveries and decision log

The body `requestId` stays an approval binding. This slice mints a new message
id per call and does not add a replay key.

## Handoff and completion evidence

The bounded slice is main `82d5be381efa117cc6bfaf65eb510b8415c15b19`, squash of
PR #115 head `575b12c86c0bf6eb2e5c82c85c53f234554f8830`. Quality job
`113586278266`, secret-scan job `113586278593`, codeql job `113586278411`, and
CodeQL run `113586542132` succeeded. Security
https://github.com/ericrommel/personal-agent-network/pull/115#issuecomment-6071008725
and Quality
https://github.com/ericrommel/personal-agent-network/pull/115#issuecomment-6070960075
found no blocking defect. The Human Product Owner accepted the slice on
2026-10-09:
https://github.com/ericrommel/personal-agent-network/issues/14#issuecomment-6076260586.
PR #118, squash `ab316533a4feb56e9ad8c0271a9e735e84bb3b56`, returns the
authorized public object to the local caller beside any model sentence.
Provider egress is unchanged.
