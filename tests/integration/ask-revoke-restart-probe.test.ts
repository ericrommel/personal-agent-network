import { afterAll, describe, expect, it } from "vitest";
import {
  createPgPool as createApprovalPool,
  PostgresApprovalStore,
  type SqlPool as ApprovalPool,
} from "../../src/modules/approval/index.js";
import {
  type AuditEvent,
  createPgPool as createAuditPool,
  PostgresAuditLog,
  type SqlPool as AuditPool,
  type TrustedAuditOperator,
} from "../../src/modules/audit/index.js";
import type { AvailabilityInterval } from "../../src/modules/context/index.js";
import { type AgentIdentity, createAgentIdentity } from "../../src/modules/identity/index.js";
import {
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_REQUEST_CONTRACT_V1,
  AVAILABILITY_SCOPE_V1,
} from "../../src/modules/messaging/index.js";
import {
  AwaitedSkillPermissionStore,
  createPgPool as createPermissionPool,
  PostgresSkillPermissionStore,
  type SqlPool as PermissionPool,
} from "../../src/modules/permissions/index.js";
import {
  createPgPool as createRelationshipPool,
  PostgresRelationshipStore,
  type SqlPool as RelationshipPool,
} from "../../src/modules/relationships/index.js";
import {
  AVAILABILITY_SKILL_VERSION_V1,
  AwaitedSkillAdvertisementStore,
  createPgPool as createAdvertisementPool,
  PostgresSkillAdvertisementStore,
  type SqlPool as AdvertisementPool,
} from "../../src/modules/skills/index.js";
import { LocalAvailabilityNode } from "../../src/runtime/local-availability-node.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const enabled = process.env.PAN_RESTART_PROBE === "1" && databaseUrl !== "";
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const ORIGIN = Date.parse("2026-10-08T12:00:00.000Z");
const START = new Date(ORIGIN + 60_000).toISOString();
const END = new Date(ORIGIN + 60_000 + 3_600_000).toISOString();
const REQUEST_ID = "req-revoke-once";
const SKILL_PAIR = `${TO}>${AVAILABILITY_SKILL_VERSION_V1}`;
const PARTY_PAIR = `${FROM}>${TO}`;

const operator = { kind: "trusted-audit-operator", key: "local-owner" } as TrustedAuditOperator;
const silent = { record(): void {} };

const agent = (id: string): AgentIdentity => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

const clockAt = (state: { now: number }) => ({
  now: () => new Date(state.now).toISOString(),
  nowMs: () => state.now,
});

const principal = {
  schema: "pan.authenticated-agent-principal/v1",
  kind: "authenticated-agent",
  agentId: FROM,
  authenticatedAt: new Date(ORIGIN).toISOString(),
};

const request = {
  contract: AVAILABILITY_REQUEST_CONTRACT_V1,
  requestId: REQUEST_ID,
  targetAgentId: TO,
  purpose: AVAILABILITY_PURPOSE_V1,
  scope: AVAILABILITY_SCOPE_V1,
  start: START,
  end: END,
};

describe.skipIf(!enabled)("fresh process denies the revoked ASK", () => {
  let relationshipPool: RelationshipPool | undefined;
  let approvalPool: ApprovalPool | undefined;
  let auditPool: AuditPool | undefined;
  let permissionPool: PermissionPool | undefined;
  let advertisementPool: AdvertisementPool | undefined;

  afterAll(async () => {
    if (relationshipPool !== undefined) {
      await relationshipPool.end();
    }
    if (approvalPool !== undefined) {
      await approvalPool.end();
    }
    if (auditPool !== undefined) {
      await auditPool.end();
    }
    if (permissionPool !== undefined) {
      await permissionPool.end();
    }
    if (advertisementPool !== undefined) {
      await advertisementPool.end();
    }
  });

  it("denies the revoked ASK from the restarted rows", async () => {
    try {
      relationshipPool = createRelationshipPool(databaseUrl);
      approvalPool = createApprovalPool(databaseUrl);
      auditPool = createAuditPool(databaseUrl);
      permissionPool = createPermissionPool(databaseUrl);
      advertisementPool = createAdvertisementPool(databaseUrl);
      const client = await relationshipPool.connect();
      const relationship = await client.query(
        "SELECT status FROM relationship_records WHERE pair_key = $1",
        [PARTY_PAIR],
      );
      const permission = await client.query(
        "SELECT status, effect FROM skill_permission_records WHERE pair_key = $1",
        [PARTY_PAIR],
      );
      const advertisement = await client.query(
        "SELECT status FROM skill_advertisement_records WHERE pair_key = $1",
        [SKILL_PAIR],
      );
      const approval = await client.query(
        "SELECT status FROM approval_records WHERE request_id = $1",
        [REQUEST_ID],
      );
      client.release();
      expect(relationship.rows).toEqual([{ status: "active" }]);
      expect(permission.rows).toEqual([{ status: "revoked", effect: "ASK" }]);
      expect(advertisement.rows).toEqual([{ status: "advertised" }]);
      expect(approval.rows).toEqual([{ status: "invalidated" }]);

      const clock = clockAt({ now: ORIGIN + 2_000 });
      const prior = await new PostgresAuditLog(auditPool, clock).read(operator);
      expect(prior.ok).toBe(true);
      if (!prior.ok) {
        throw new Error("fixture");
      }
      expect(prior.value).toEqual([
        auditEvent(prior.value, 0, new Date(ORIGIN).toISOString(), "approval", "unavailable"),
        auditEvent(prior.value, 1, new Date(ORIGIN + 1_000).toISOString(), "decision", "deny"),
      ]);
      expectMinimized(prior.value);

      let reads = 0;
      const context = {
        get busyIntervals(): readonly AvailabilityInterval[] {
          reads += 1;
          return [];
        },
      };
      const node = new LocalAvailabilityNode({
        clock,
        agents: [agent(FROM), agent(TO)],
        context,
        relationshipStore: new PostgresRelationshipStore(relationshipPool, silent),
        approvalStore: new PostgresApprovalStore(approvalPool),
        permissionStore: new AwaitedSkillPermissionStore(
          new PostgresSkillPermissionStore(permissionPool, silent),
        ),
        advertisementStore: new AwaitedSkillAdvertisementStore(
          new PostgresSkillAdvertisementStore(advertisementPool, silent),
        ),
        audit: new PostgresAuditLog(auditPool, clock),
      });
      const row = await node.approvals.findByRequestId(REQUEST_ID);
      if (row === null) {
        throw new Error("fixture");
      }
      expect(row.status).toBe("invalidated");
      expect(row.id.startsWith("pan_approval_")).toBe(true);
      const response = await node.handle(principal, request);
      expect(response).toEqual({ outcome: "unavailable" });
      expect(JSON.stringify(response)).not.toContain(row.id);
      expect(reads).toBe(0);
      const spent = await node.approvals.findByRequestId(REQUEST_ID);
      expect(spent?.status).toBe("invalidated");
      expect(spent?.id).toBe(row.id);

      const after = await new PostgresAuditLog(auditPool, clock).read(operator);
      expect(after.ok).toBe(true);
      if (!after.ok) {
        throw new Error("fixture");
      }
      expect(after.value).toEqual([
        auditEvent(after.value, 0, new Date(ORIGIN).toISOString(), "approval", "unavailable"),
        auditEvent(after.value, 1, new Date(ORIGIN + 1_000).toISOString(), "decision", "deny"),
        auditEvent(after.value, 2, new Date(ORIGIN + 2_000).toISOString(), "decision", "deny"),
      ]);
      expectMinimized(after.value);
    } catch (error) {
      const message = error instanceof Error ? error.message : "probe failed";
      throw new Error(redact(message));
    }
  });
});

const auditEvent = (
  seen: readonly AuditEvent[],
  index: number,
  recordedAt: string,
  category: "approval" | "decision",
  outcome: "unavailable" | "deny",
) => ({
  kind: "audit-event" as const,
  id: seen[index]?.id,
  recordedAt,
  category,
  requestId: REQUEST_ID,
  outcome,
});

const expectMinimized = (value: unknown): void => {
  const text = JSON.stringify(value);
  expect(text).not.toContain(START);
  expect(text).not.toContain(END);
  expect(text).not.toContain("ASK");
  expect(text).not.toContain("ALLOW");
  expect(text).not.toContain("DENY");
  expect(text).not.toContain("pan_approval_");
  expect(text).not.toContain("availability_boolean");
  expect(text).not.toContain('"result"');
};
