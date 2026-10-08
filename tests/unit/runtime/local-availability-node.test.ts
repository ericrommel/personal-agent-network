import { describe, expect, it } from "vitest";
import {
  type ApprovalRecord,
  InMemoryApprovalStore,
  type TrustedApprovalSource,
} from "../../../src/modules/approval/index.js";
import type { TrustedAuditOperator } from "../../../src/modules/audit/index.js";
import type { AvailabilityInterval } from "../../../src/modules/context/index.js";
import { type AgentIdentity, createAgentIdentity } from "../../../src/modules/identity/index.js";
import { AVAILABILITY_REQUEST_CONTRACT_V1 } from "../../../src/modules/messaging/index.js";
import {
  InMemorySkillPermissionStore,
  SKILL_PERMISSION_COMMAND_CONTRACT_V1,
  type TrustedPermissionSource,
} from "../../../src/modules/permissions/index.js";
import {
  RELATIONSHIP_COMMAND_CONTRACT_V1,
  type TrustedRelationshipSource,
} from "../../../src/modules/relationships/index.js";
import {
  AVAILABILITY_SKILL_VERSION_V1,
  SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
  type TrustedSkillAdvertisementSource,
} from "../../../src/modules/skills/index.js";
import {
  type LocalAvailabilityClock,
  LocalAvailabilityNode,
} from "../../../src/runtime/local-availability-node.js";
import { failure } from "../../../src/shared/domain/result.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const ORIGIN = Date.parse("2026-10-08T12:00:00.000Z");
const START = new Date(ORIGIN + 60_000).toISOString();
const END = new Date(ORIGIN + 60_000 + 3_600_000).toISOString();

const unwrap = <T>(result: Readonly<{ ok: true; value: T } | { ok: false }>): T => {
  if (!result.ok) {
    throw new Error("fixture");
  }
  return result.value;
};

const agent = (id: string): AgentIdentity => unwrap(createAgentIdentity(id, OWNER, "active"));

const clockAt = (state: { now: number }): LocalAvailabilityClock => ({
  now: () => new Date(state.now).toISOString(),
  nowMs: () => state.now,
});

const relationshipSource = {
  kind: "trusted-relationship-source",
  key: "local-owner",
} as TrustedRelationshipSource;

const permissionSource = {
  kind: "trusted-permission-source",
  key: "local-owner",
} as TrustedPermissionSource;

const advertisementSource = {
  kind: "trusted-skill-advertisement-source",
  key: "local-owner",
} as TrustedSkillAdvertisementSource;

const approvalSource = {
  kind: "trusted-approval-source",
  key: "local-owner",
} as TrustedApprovalSource;

const auditOperator = {
  kind: "trusted-audit-operator",
  key: "local-owner",
} as TrustedAuditOperator;

const principal = {
  schema: "pan.authenticated-agent-principal/v1",
  kind: "authenticated-agent",
  agentId: FROM,
  authenticatedAt: "2026-10-08T12:00:00.000Z",
};

const request = (requestId = "req-1", end = END) => ({
  contract: AVAILABILITY_REQUEST_CONTRACT_V1,
  requestId,
  targetAgentId: TO,
  purpose: "availability_check",
  scope: "availability_boolean",
  start: START,
  end,
});

const countingContext = () => {
  const intervals: AvailabilityInterval[] = [];
  let reads = 0;
  return {
    intervals,
    reads: () => reads,
    context: {
      get busyIntervals(): readonly AvailabilityInterval[] {
        reads += 1;
        return intervals;
      },
    },
  };
};

const nodeWith = (
  context: { busyIntervals: readonly AvailabilityInterval[] },
  state: { now: number } = { now: ORIGIN },
) =>
  new LocalAvailabilityNode({
    clock: clockAt(state),
    agents: [agent(FROM), agent(TO)],
    context,
  });

const allowFacts = async (node: LocalAvailabilityNode, effect = "ALLOW") => {
  expect(
    (
      await node.relationships.create(relationshipSource, {
        contract: RELATIONSHIP_COMMAND_CONTRACT_V1,
        action: "create",
        correlationId: "corr-rel",
        fromAgentId: FROM,
        toAgentId: TO,
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await node.advertisements.advertise(advertisementSource, {
        contract: SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
        action: "advertise",
        correlationId: "corr-ad",
        agentId: TO,
        skillVersion: AVAILABILITY_SKILL_VERSION_V1,
      })
    ).ok,
  ).toBe(true);
  return unwrap(
    await node.permissions.grant(permissionSource, {
      contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
      action: "grant",
      correlationId: "corr-grant",
      fromAgentId: FROM,
      toAgentId: TO,
      effect,
    }),
  );
};

const eventsOf = (node: LocalAvailabilityNode) => unwrap(node.auditLog.read(auditOperator));

describe("local availability node", () => {
  it("releases a boolean for ALLOW and withholds context for DENY", async () => {
    const counted = countingContext();
    const state = { now: ORIGIN };
    const node = nodeWith(counted.context, state);
    await allowFacts(node, "ALLOW");
    const free = await node.handle(principal, request());
    expect(free).toEqual({ result: true });
    expect(counted.reads()).toBe(1);
    node.setBusyIntervals([{ start: START, end: END }]);
    const busy = await node.handle(principal, request("req-2"));
    expect(busy).toEqual({ result: false });
    const retained = eventsOf(node);
    expect(retained.map((event) => event.outcome)).toEqual(["released", "released"]);
    expect(JSON.stringify(retained)).not.toContain(START);
    expect(JSON.stringify(retained)).not.toContain("ALLOW");
    expect(retained[0]).not.toHaveProperty("result");

    const denied = nodeWith(counted.context, state);
    await allowFacts(denied, "DENY");
    const before = counted.reads();
    expect(await denied.handle(principal, request("req-deny"))).toEqual({
      outcome: "unavailable",
    });
    expect(counted.reads()).toBe(before);
    expect(eventsOf(denied).map((event) => event.outcome)).toEqual(["deny"]);
  });

  it("does not read context for a bad principal, a missing permission, or a dead interval", async () => {
    const counted = countingContext();
    const node = nodeWith(counted.context);
    expect(await node.handle({ schema: "nope" }, request())).toEqual({ outcome: "unavailable" });
    expect(eventsOf(node)[0]).toMatchObject({
      category: "decision",
      outcome: "unavailable",
      requestId: "unavailable",
    });
    expect(await node.handle(principal, request("req-none"))).toEqual({ outcome: "unavailable" });
    expect(eventsOf(node).at(-1)?.outcome).toBe("deny");
    expect(counted.reads()).toBe(0);
    const allowed = nodeWith(counted.context);
    await allowFacts(allowed, "ALLOW");
    const before = counted.reads();
    expect(
      await allowed.handle(principal, {
        ...request("req-past"),
        start: new Date(ORIGIN - 60_000).toISOString(),
        end: new Date(ORIGIN - 1_000).toISOString(),
      }),
    ).toEqual({ outcome: "unavailable" });
    expect(counted.reads()).toBe(before);
    expect(eventsOf(allowed).at(-1)?.outcome).toBe("unavailable");
    expect(await node.releaseByRequestId("missing", true)).toBe(false);
  });

  it("delivers an approved ASK once and keeps the approval id internal", async () => {
    const counted = countingContext();
    const node = nodeWith(counted.context);
    await allowFacts(node, "ASK");
    expect(await node.handle(principal, request())).toEqual({ outcome: "unavailable" });
    expect(counted.reads()).toBe(0);
    const pending = await node.approvals.findByRequestId("req-1");
    expect(pending?.status).toBe("pending");
    expect((await node.approvals.approve(approvalSource, pending?.id)).ok).toBe(true);
    const released = await node.handle(principal, request());
    expect(released).toEqual({ result: true });
    expect(counted.reads()).toBe(1);
    const spent = await node.approvals.findByRequestId("req-1");
    expect(spent?.status).toBe("released");
    expect(spent?.id.startsWith("pan_approval_")).toBe(true);
    expect(await node.handle(principal, request())).toEqual({ outcome: "unavailable" });
    expect(counted.reads()).toBe(1);
    expect(eventsOf(node).map((event) => event.outcome)).toEqual([
      "unavailable",
      "released",
      "unavailable",
    ]);
  });

  it("conflicts a duplicate request id and invalidates an approved ASK when permission is revoked", async () => {
    const counted = countingContext();
    const node = nodeWith(counted.context);
    const permission = await allowFacts(node, "ASK");
    await node.handle(principal, request("req-dup"));
    const otherEnd = new Date(ORIGIN + 120_000).toISOString();
    expect(await node.handle(principal, request("req-dup", otherEnd))).toEqual({
      outcome: "unavailable",
    });
    expect((await node.approvals.findByRequestId("req-dup"))?.end).toBe(END);
    expect(counted.reads()).toBe(0);

    const approved = nodeWith(counted.context);
    const granted = await allowFacts(approved, "ASK");
    await approved.handle(principal, request("req-revoke"));
    const row = await approved.approvals.findByRequestId("req-revoke");
    expect((await approved.approvals.approve(approvalSource, row?.id)).ok).toBe(true);
    expect(
      (
        await approved.permissions.revoke(permissionSource, {
          contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
          action: "revoke",
          correlationId: "corr-revoke",
          fromAgentId: FROM,
          toAgentId: TO,
          effect: "ASK",
          permissionId: granted.id,
        })
      ).ok,
    ).toBe(true);
    const before = counted.reads();
    expect(await approved.handle(principal, request("req-revoke"))).toEqual({
      outcome: "unavailable",
    });
    expect(counted.reads()).toBe(before);
    expect((await approved.approvals.findByRequestId("req-revoke"))?.status).toBe("invalidated");
    expect(permission.id).not.toBe(granted.id);
  });

  it("invalidates an approved ASK when the relationship disappears before release", async () => {
    const counted = countingContext();
    let open = true;
    const agents = new Map([
      [FROM, agent(FROM)],
      [TO, agent(TO)],
    ]);
    const node = new LocalAvailabilityNode({
      clock: clockAt({ now: ORIGIN }),
      agents: [],
      context: {
        get busyIntervals(): readonly AvailabilityInterval[] {
          open = false;
          return counted.intervals;
        },
      },
      findAgent: async (id) => (open ? (agents.get(String(id)) ?? null) : null),
    });
    await allowFacts(node, "ASK");
    const row = await node.approvals.findByRequestId("req-1");
    expect(row).toBeNull();
    await node.handle(principal, request("req-race"));
    const pending = await node.approvals.findByRequestId("req-race");
    expect((await node.approvals.approve(approvalSource, pending?.id)).ok).toBe(true);
    const response = await node.handle(principal, request("req-race"));
    expect(response).toEqual({ outcome: "unavailable" });
    expect(eventsOf(node).at(-1)).toMatchObject({
      category: "revocation",
      outcome: "invalidated",
    });
    expect((await node.approvals.findByRequestId("req-race"))?.status).toBe("invalidated");
  });

  it("refuses context for an ASK that is pending, mismatched, expired, or on a bad clock", async () => {
    const counted = countingContext();
    const state = { now: ORIGIN };
    const node = nodeWith(counted.context, state);
    await allowFacts(node, "ASK");
    const input = {
      requesterId: FROM,
      targetId: TO,
      requestId: "req-direct",
      start: START,
      end: END,
    };
    expect(await node.queryAvailability(input)).toBeNull();
    await node.handle(principal, request("req-direct"));
    expect(await node.queryAvailability(input)).toBeNull();
    const pending = await node.approvals.findByRequestId("req-direct");
    expect((await node.approvals.approve(approvalSource, pending?.id)).ok).toBe(true);
    expect(await node.queryAvailability({ ...input, targetId: FROM })).toBeNull();
    expect(await node.queryAvailability({ ...input, requesterId: TO })).toBeNull();
    expect(await node.queryAvailability({ ...input, start: END })).toBeNull();
    expect(await node.queryAvailability({ ...input, end: START })).toBeNull();
    state.now = 1.5;
    expect(await node.queryAvailability(input)).toBeNull();
    const badClock = new LocalAvailabilityNode({
      clock: {
        now: () => new Date(ORIGIN).toISOString(),
        nowMs: () => "bad" as unknown as number,
      },
      agents: [agent(FROM), agent(TO)],
      context: counted.context,
    });
    await allowFacts(badClock, "ASK");
    await badClock.handle(principal, request("req-direct"));
    const badRow = await badClock.approvals.findByRequestId("req-direct");
    expect((await badClock.approvals.approve(approvalSource, badRow?.id)).ok).toBe(true);
    expect(
      await badClock.queryAvailability({
        requesterId: FROM,
        targetId: TO,
        requestId: "req-direct",
        start: START,
        end: END,
      }),
    ).toBeNull();
    state.now = ORIGIN + 11 * 60 * 1000;
    expect(await node.queryAvailability(input)).toBeNull();
    expect(counted.reads()).toBe(0);
    state.now = ORIGIN;
    expect(await node.queryAvailability(input)).toBe(true);
    expect(counted.reads()).toBe(1);
    node.approvals.findByRequestId = async () =>
      ({
        status: "approved",
        requestId: input.requestId,
        fromAgentId: FROM,
        toAgentId: TO,
        start: START,
        end: END,
        expiresAt: "not-a-time",
      }) as ApprovalRecord;
    expect(await node.queryAvailability(input)).toBeNull();
    expect(counted.reads()).toBe(1);
  });

  it("denies an authenticated agent that is absent from the local directory", async () => {
    const counted = countingContext();
    const node = nodeWith(counted.context);
    await allowFacts(node, "ALLOW");
    const stranger = agent("pan_agent_44444444-4444-4444-8444-444444444444");
    expect(
      (
        await node.relationships.create(relationshipSource, {
          contract: RELATIONSHIP_COMMAND_CONTRACT_V1,
          action: "create",
          correlationId: "corr-missing",
          fromAgentId: FROM,
          toAgentId: stranger.id,
        })
      ).ok,
    ).toBe(false);
    expect(
      await node.handle({ ...principal, agentId: stranger.id }, request("req-stranger")),
    ).toEqual({ outcome: "unavailable" });
    expect(counted.reads()).toBe(0);
    expect(eventsOf(node).at(-1)?.outcome).toBe("deny");
  });

  it("treats a missing calendar as empty and still releases a boolean", async () => {
    const node = new LocalAvailabilityNode({
      clock: clockAt({ now: ORIGIN }),
      agents: [agent(FROM), agent(TO)],
    });
    await allowFacts(node, "ALLOW");
    expect(await node.handle(principal, request("req-default"))).toEqual({ result: true });
    expect(eventsOf(node).map((event) => event.outcome)).toEqual(["released"]);
  });

  it("still returns the boolean when the audit append fails", async () => {
    const counted = countingContext();
    const node = new LocalAvailabilityNode({
      clock: clockAt({ now: ORIGIN }),
      agents: [agent(FROM), agent(TO)],
      context: counted.context,
      audit: {
        append: () => failure({ code: "AUDIT_COMMAND_INVALID" }),
      },
    });
    await allowFacts(node, "ALLOW");
    expect(await node.handle(principal, request())).toEqual({ result: true });
    expect(eventsOf(node)).toEqual([]);
  });

  it("does not return until an async audit append settles", async () => {
    let releaseAppend: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseAppend = resolve;
    });
    let started = false;
    const node = new LocalAvailabilityNode({
      clock: clockAt({ now: ORIGIN }),
      agents: [agent(FROM), agent(TO)],
      audit: {
        append: () => {
          started = true;
          return gate.then(() => failure({ code: "AUDIT_COMMAND_INVALID" }));
        },
      },
    });
    await allowFacts(node, "ALLOW");
    let settled = false;
    const pending = node.handle(principal, request("req-audit-wait")).then((result) => {
      settled = true;
      return result;
    });
    // Async handle frames settle on later microtasks even when append is not
    // awaited. A macrotask runs only after that chain.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(started).toBe(true);
    expect(settled).toBe(false);
    releaseAppend();
    expect(await pending).toEqual({ result: true });
    expect(settled).toBe(true);
    expect(eventsOf(node)).toEqual([]);
  });

  it("reads an injected relationship store instead of process memory", async () => {
    const calls: unknown[][] = [];
    const node = new LocalAvailabilityNode({
      clock: clockAt({ now: ORIGIN }),
      agents: [agent(FROM), agent(TO)],
      relationshipStore: {
        insertActive() {
          return null;
        },
        revokeMatching() {
          return null;
        },
        findByDirectedPair(from, to) {
          calls.push([from, to]);
          return null;
        },
      },
    });
    expect(await node.relationships.readActive(FROM, TO)).toBe(false);
    expect(calls).toEqual([[FROM, TO]]);
  });

  it("does not finish a permission revoke until approval invalidation settles", async () => {
    const memory = new InMemoryApprovalStore();
    let releaseValues: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseValues = resolve;
    });
    let valuesStarted = false;
    const node = new LocalAvailabilityNode({
      clock: clockAt({ now: ORIGIN }),
      agents: [agent(FROM), agent(TO)],
      approvalStore: {
        findByRequestId: (requestId) => memory.findByRequestId(requestId),
        findById: (id) => memory.findById(id),
        insertPending: (record) => memory.insertPending(record),
        replace: (record) => memory.replace(record),
        values() {
          valuesStarted = true;
          return gate.then(() => memory.values());
        },
      },
    });
    const granted = await allowFacts(node, "ASK");
    expect(await node.handle(principal, request("req-invalidate"))).toEqual({
      outcome: "unavailable",
    });
    let settled = false;
    const pending = node.permissions
      .revoke(permissionSource, {
        contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
        action: "revoke",
        correlationId: "corr-revoke",
        fromAgentId: FROM,
        toAgentId: TO,
        effect: "ASK",
        permissionId: granted.id,
      })
      .then((result) => {
        settled = true;
        return result;
      });
    // Revoke awaits invalidateUnreleased. A dropped promise would settle on microtasks.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(valuesStarted).toBe(true);
    expect(settled).toBe(false);
    releaseValues();
    expect((await pending).ok).toBe(true);
    expect((await node.approvals.findByRequestId("req-invalidate"))?.status).toBe("invalidated");
  });

  it("uses an injected permission store for a later node", async () => {
    const store = new InMemorySkillPermissionStore({ record() {} });
    const first = new LocalAvailabilityNode({
      clock: clockAt({ now: ORIGIN }),
      agents: [agent(FROM), agent(TO)],
      permissionStore: store,
    });
    const granted = unwrap(
      await first.permissions.grant(permissionSource, {
        contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
        action: "grant",
        correlationId: "corr-injected",
        fromAgentId: FROM,
        toAgentId: TO,
        effect: "ALLOW",
      }),
    );
    expect(store.findCurrent(FROM, TO)).toMatchObject({ id: granted.id, status: "active" });
    const restarted = new LocalAvailabilityNode({
      clock: clockAt({ now: ORIGIN }),
      agents: [agent(FROM), agent(TO)],
      permissionStore: store,
    });
    expect(await restarted.permissions.readSnapshot(FROM, TO)).toMatchObject({
      decision: "ALLOW",
    });
    expect(
      (
        await restarted.permissions.revoke(permissionSource, {
          contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
          action: "revoke",
          correlationId: "corr-injected-revoke",
          fromAgentId: FROM,
          toAgentId: TO,
          effect: "ALLOW",
          permissionId: granted.id,
        })
      ).ok,
    ).toBe(true);
    expect(store.findCurrent(FROM, TO)).toMatchObject({ id: granted.id, status: "revoked" });
    expect(await first.permissions.readSnapshot(FROM, TO)).toBeNull();
  });
});
