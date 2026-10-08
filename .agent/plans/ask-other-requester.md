# Another requester does not spend an approved ASK

Status: In Development
Owner roles: Backend Engineer
Last updated: 2026-10-08

## Objective

Observe that an approved ASK stays bound to its original requester across a
second process. A different authenticated agent, with its own active
relationship and its own ASK permission, receives only
`{ outcome: "unavailable" }`. Context is not read. The SQL row stays approved
for the original requester. That requester can still spend the approval once.

## Scope and non-goals

The parent stores two active relationships, two ASK permissions, and the
availability advertisement. It handles once as the original requester, then
approves that pending row. The interval starts 60 seconds after the origin.
Approval expiry is ten minutes after the origin. The child clock is two
seconds after the origin, before the start and before expiry. The child
principal is the other requester.

Non-goals: a replay window, a listening server, a product UI, durable
availability budgets, and Issue #11 or #13 acceptance. The other requester's
policy stays ASK. This is not relationship absence and not a stored DENY
effect. This change does not edit the two-node QE plan.

## Requirements and acceptance criteria

- With `PAN_RELATIONSHIP_DATABASE_URL` set, the parent requires child output
  containing "denies another requester from the restarted rows", `/1 passed/`,
  no skip, and no `postgres://` text.
- The child refuses to run unless `PAN_RESTART_PROBE=1`.
- The child clock is before the start and before `expiresAt`.
- The child node includes the other agent, so policy can read that agent's
  relationship and ASK permission.
- The handle returns `{ outcome: "unavailable" }` and reads no context.
- The SQL status stays `approved`, `from_agent_id` stays the original
  requester, and the end, expiry, and approval id do not change.
- Both ASK permissions stay active. The child does not release the row.
- The child audit event is `approval` / `unavailable`. The export has no
  interval, permission effect, approval id, result field, or other-agent id.
- After the child returns, the original requester spends the same request once
  and a later handle is unavailable.
- Local verify without Docker skips both new tests.

## Context and affected components

Tests and this plan only. No production change. `createAsk` for a different
binding on an existing request id conflicts and does not write.
`approvalMatches` requires the approved row's `fromAgentId` to equal the
authenticated requester, so the handler returns before the context read.

## Decisions and ADRs

No new ADR. No new Reserved Product Decision. D4 request binding is unchanged.

## Security and privacy considerations

The public denial stays `{ outcome: "unavailable" }`. The conflict does not
disclose the stored approval or the boolean. The original approval remains
single-use for its bound requester.

## Implementation sequence

1. Add the parent and child probes.
2. Review independently, then merge only with green required CI.
3. Record the observation in the two-node QE plan in a later docs change.

## Developer tests

`tests/integration/ask-other-requester.test.ts`
`tests/integration/ask-other-requester-probe.test.ts`

## QE and acceptance verification

Independent review is required before merge. GitHub Actions is the live
database evidence. Do not check a Human Product Owner box. Do not check the
two-process restart evidence box.

## Validation commands

`npm.cmd run verify`

## Risks, assumptions, and open questions

Docker is not running locally. A skipped local run is not SQL evidence.
