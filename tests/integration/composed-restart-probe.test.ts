import { afterAll, describe, expect, it } from "vitest";
import {
  type SqlPool as AuditPool,
  createPgPool as createAuditPool,
  PostgresAuditLog,
  type TrustedAuditOperator,
} from "../../src/modules/audit/index.js";
import type { AvailabilityInterval } from "../../src/modules/context/index.js";
import { type AgentIdentity, createAgentIdentity } from "../../src/modules/identity/index.js";
import { AVAILABILITY_REQUEST_CONTRACT_V1 } from "../../src/modules/messaging/index.js";
import {
  createPgPool,
  PostgresRelationshipStore,
  type SqlPool,
} from "../../src/modules/relationships/index.js";
import { LocalAvailabilityNode } from "../../src/runtime/local-availability-node.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const enabled = process.env.PAN_RESTART_PROBE === "1" && databaseUrl !== "";
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const ORIGIN = Date.parse("2026-10-08T12:00:00.000Z");
const START = new Date(ORIGIN + 60_000).toISOString();
const END = new Date(ORIGIN + 60_000 + 3_600_000).toISOString();
const PARENT_REQUEST = "req-composed";
const CHILD_REQUEST = "req-composed-child";

const operator = { kind: "trusted-audit-operator", key: "local-owner" } as TrustedAuditOperator;

const agent = (id: string): AgentIdentity => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

describe.skipIf(!enabled)("fresh process loads the composed deny", () => {
  let relationshipPool: SqlPool | undefined;
  let auditPool: AuditPool | undefined;

  afterAll(async () => {
    if (relationshipPool !== undefined) {
      await relationshipPool.end();
    }
    if (auditPool !== undefined) {
      await auditPool.end();
    }
  });

  it("sees the revoked relationship and the minimized deny", async () => {
    try {
      relationshipPool = createPgPool(databaseUrl);
      auditPool = createAuditPool(databaseUrl);
      const client = await relationshipPool.connect();
      const found = await client.query(
        "SELECT status FROM relationship_records WHERE pair_key = $1",
        [`${FROM}>${TO}`],
      );
      client.release();
      expect(found.rows).toEqual([{ status: "revoked" }]);

      const clock = {
        now: () => new Date(ORIGIN).toISOString(),
        nowMs: () => ORIGIN,
      };
      const prior = await new PostgresAuditLog(auditPool, clock).read(operator);
      expect(prior.ok).toBe(true);
      if (!prior.ok) {
        throw new Error("fixture");
      }
      expect(prior.value).toEqual([
        {
          kind: "audit-event",
          id: prior.value[0]?.id,
          recordedAt: new Date(ORIGIN).toISOString(),
          category: "decision",
          requestId: PARENT_REQUEST,
          outcome: "deny",
        },
      ]);
      expect(prior.value[0]?.id).toMatch(/^pan_audit_/);
      expect(JSON.stringify(prior.value[0])).not.toContain("availability_boolean");

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
        relationshipStore: new PostgresRelationshipStore(relationshipPool, { record() {} }),
        audit: new PostgresAuditLog(auditPool, clock),
      });
      expect(
        await node.handle(
          {
            schema: "pan.authenticated-agent-principal/v1",
            kind: "authenticated-agent",
            agentId: FROM,
            authenticatedAt: new Date(ORIGIN).toISOString(),
          },
          {
            contract: AVAILABILITY_REQUEST_CONTRACT_V1,
            requestId: CHILD_REQUEST,
            targetAgentId: TO,
            purpose: "availability_check",
            scope: "availability_boolean",
            start: START,
            end: END,
          },
        ),
      ).toEqual({ outcome: "unavailable" });
      expect(reads).toBe(0);

      const after = await new PostgresAuditLog(auditPool, clock).read(operator);
      expect(after.ok).toBe(true);
      if (!after.ok) {
        throw new Error("fixture");
      }
      expect(after.value.map((event) => event?.requestId).sort()).toEqual([
        CHILD_REQUEST,
        PARENT_REQUEST,
      ]);
      expect(after.value.every((event) => event?.outcome === "deny")).toBe(true);
      expect(JSON.stringify(after.value)).not.toContain("availability_boolean");
      expect(JSON.stringify(after.value)).not.toContain("T12:01");
    } catch (error) {
      const message = error instanceof Error ? error.message : "probe failed";
      throw new Error(redact(message));
    }
  });
});
