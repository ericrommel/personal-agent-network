import { afterAll, describe, expect, it } from "vitest";
import {
  createPgPool,
  PostgresApprovalStore,
  type SqlPool,
} from "../../src/modules/approval/index.js";
import { type AgentIdentity, createAgentIdentity } from "../../src/modules/identity/index.js";
import { LocalAvailabilityNode } from "../../src/runtime/local-availability-node.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const enabled = process.env.PAN_RESTART_PROBE === "1" && databaseUrl !== "";
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-8222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "req-restart";
const NOW = "2026-10-08T12:00:00.000Z";

const agent = (id: string): AgentIdentity => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

describe.skipIf(!enabled)("fresh process spends the stored approval", () => {
  let pool: SqlPool | undefined;

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end();
    }
  });

  it("releases the restarted approval once", async () => {
    try {
      pool = createPgPool(databaseUrl);
      const node = new LocalAvailabilityNode({
        clock: { now: () => NOW, nowMs: () => Date.parse(NOW) },
        agents: [agent(FROM), agent(TO)],
        approvalStore: new PostgresApprovalStore(pool),
      });
      const found = await node.approvals.findByRequestId(REQUEST_ID);
      expect(found?.status).toBe("approved");
      if (found === null) {
        throw new Error("fixture");
      }
      expect(await node.releaseByRequestId(REQUEST_ID, true)).toBe(true);
      expect(await node.releaseByRequestId(REQUEST_ID, true)).toBe(false);
      expect((await node.approvals.findByRequestId(REQUEST_ID))?.status).toBe("released");
      expect(found.id).toMatch(/^pan_approval_/);
    } catch (error) {
      const message = error instanceof Error ? error.message : "probe failed";
      throw new Error(redact(message));
    }
  });
});
