# Relationships Threat and Privacy Analysis

## Status

Preparation analysis for Issue #7 and subtask #23. No finding below authorizes
implementation. Accepted Discovery behavior is unchanged.

The Security & Privacy preparation run timed out before it wrote this file. The Engineering
Coordinator wrote it from Issue #23, ADR-0003, the accepted privacy requirements, and the
arrived QE and Backend notes. Findings are labeled. A later independent security review of
any implementation remains mandatory.

## Assets and boundaries

Assets: relationship existence, direction, status, and the authority a later policy module
might mistakenly infer from a relationship.

Trust boundaries:

1. Remote ingress to this node. Messages, Discovery references, and model output are
   untrusted and cannot mutate relationship state. This repeats ADR-0003 and SEC-004.
2. Trusted local owner control to the relationship port. This is the only mutate path in
   the baseline. A confused deputy is any later module that forwards remote fields into
   `create` or `revoke`.
3. Relationship state to policy. Policy may read the boolean. It must not treat that bit as
   a skill permission or as Discovery eligibility.
4. Process memory to restart. In-memory state is not a durability boundary. See PO-REL-6.
5. Logs and the minimized event. The event allowlist excludes party ids, relationship ids,
   emails, labels, and Discovery references.

## Actors

- Local owner, through trusted control: may create and revoke under PO-REL-4.
- Local agent runtime: may read the boolean for a later policy decision. It may not mint a
  relationship from a request payload.
- Remote agent: untrusted. No mutate and no remote read in this module.
- Discovery caller: unchanged. Discovery still must not disclose relationship facts
  (PRV-001).

## Abuse cases

| Case | Expected outcome | Finding |
|---|---|---|
| Remote payload asks to create a relationship with the receiver | No write. `readActive` stays false. | Non-blocking if mutate ports are absent from ingress. Blocking if any implementation wires remote input to create or revoke. |
| Caller presents a Discovery reference as a relationship credential | Reference is not an agent id and not authority. | Non-blocking under the baseline. Blocking if a parser accepts it as a relationship id. |
| Owner revokes, then a stale cache still reads active | The boolean comes from the store's current row, not a caller-supplied copy. | Non-blocking as a port rule. Blocking if a later module caches `true` without a defined expiry. That cache is outside this module. REL-004 remains a policy duty. |
| Revoke write fails and the caller is told it succeeded | Prior row stays active and the command does not report success. | Non-blocking requirement. |
| Observer throws after the revoke write | Row stays revoked. The command still reports revoked. Retry is idempotent. | Non-blocking accepted residual. There is no durable audit in this slice. Restoring `active` to chase the observer would put authority back. |
| Create observer throws | Insert rolls back. No active row remains. | Non-blocking requirement. Creating authority without a local signal is the failure to avoid. |
| Repeated revoke or revoke of an unknown pair creates an active record | No new active row. | Non-blocking requirement. |
| One direction revoked and policy treats the pair as mutual | Policy must name the ordered pair. This module will not infer the reverse. | Non-blocking if PO-REL-2 is accepted. |
| Enumeration through list or error text | No remote list. `readActive` is a boolean. Local command errors omit ids and payload fragments. | Non-blocking if that allowlist holds. Blocking if logs interpolate the command object. |
| Disabled agent remains authorized because the row is still active | `readActive` is false when either agent is ineligible. Stored status stays unchanged until revoke. | Non-blocking requirement. |
| Restart restores a revoked relationship as active from a static seed | Empty memory reads false until a new trusted create. A startup path that reloads an old active seed is a defect. | Non-blocking only as an explicit process-local limitation. Blocking if implementation claims durable revoke. |
| Second active row for the same ordered pair | Rejected. | Non-blocking requirement. |
| Prototype pollution or extra fields | Reject. | Non-blocking requirement. |
| Identity lookup throws | Fail closed, no write. | Non-blocking requirement. REL-003. |

No blocking finding remains inside the recommended baseline. The following become blocking if
implementation departs from that baseline:

- Any remote or model-controlled mutate path.
- Any public or Discovery disclosure of relationship existence.
- Any claim of restart-stable revocation from the in-memory adapter.
- Any command that writes skill, permission, or discovery-grant state.
- Any label, email, or party id added to the minimized event.

## Revocation freshness

SEC-009 requires a check at decision time and immediately before context access or
disclosure. This module provides the current boolean for those checks. It does not perform
the disclosure check. Pending approvals are not invalidated here. AC-REV-001's in-flight rule
stays a Product Owner decision for Approval and Authorization. Relationship reads have no
grace period.

## Privacy

The baseline stores agent ids and status in process memory, not human identifiers. The
authorization read reveals a boolean to local policy, not a graph to a remote caller.
Discovery's uniform negative result must stay independent of whether a relationship row
exists. This preparation does not change Discovery code.

## Dependency and supply chain

No new package is recommended. UUID generation can use `node:crypto` `randomUUID`, already
used by Identity. PostgreSQL is not introduced in this preparation. Custom cryptography is
not required.

## Accepted residuals

- Process restart drops in-memory revocations until a durable adapter exists.
- The other node's copy is unaffected by a local revoke.
- A revoke can be stored without a minimized event if the observer throws after the write.
  The alternative, restoring `active`, is worse. Durable delivery of that event belongs to
  Audit.
- A hung Identity lookup can stall a local command. No timeout number is invented here.
- Local owner control assumes the host process is inside the owner's trust boundary.

## Product Owner decisions

PO-REL-1 through PO-REL-6 in the specification are the genuine decisions. This analysis
matches their recommendations: pre-seeded, directed, node-local, owner-mutated, boolean
reads, and explicit non-durable storage until ADR-0004 persistence is authorized.

If the Product Owner chooses invitation, remote revoke, mutual records, or human-identifier
storage, this analysis must be repeated before implementation.

## Completion

This file is the Issue #23 deliverable. The independent specialist run did not finish. The
coordinator recorded the analysis above and did not downgrade any trust-boundary finding to
non-blocking in order to finish the package. There is no blocking finding against the
recommended baseline.
