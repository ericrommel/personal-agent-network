import { afterAll, describe, expect, it } from "vitest";
import { type AgentIdentity, createAgentIdentity } from "../../src/modules/identity/index.js";
import {
  AwaitedSkillPermissionStore,
  createPgPool,
  PostgresSkillPermissionStore,
  type SqlPool,
} from "../../src/modules/permissions/index.js";
import { LocalAvailabilityNode } from "../../src/runtime/local-availability-node.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const enabled = process.env.PAN_RESTART_PROBE === "1" && databaseUrl !== "";
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const NOW = Date.parse("2026-10-08T12:00:00.000Z");

const agent = (id: string): AgentIdentity => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

describe.skipIf(!enabled)("fresh process loads the revoked permission", () => {
  let pool: SqlPool | undefined;

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end();
    }
  });

  it("denies because the revoked permission row is present", async () => {
    try {
      pool = createPgPool(databaseUrl);
      const client = await pool.connect();
      const found = await client.query(
        "SELECT status, effect FROM skill_permission_records WHERE pair_key = $1",
        [`${FROM}>${TO}`],
      );
      client.release();
      expect(found.rows).toEqual([{ status: "revoked", effect: "ALLOW" }]);
      const node = new LocalAvailabilityNode({
        clock: {
          now: () => new Date(NOW).toISOString(),
          nowMs: () => NOW,
        },
        agents: [agent(FROM), agent(TO)],
        permissionStore: new AwaitedSkillPermissionStore(
          new PostgresSkillPermissionStore(pool, { record() {} }),
        ),
      });
      expect(await node.permissions.readSnapshot(FROM, TO)).toBeNull();
    } catch (error) {
      const message = error instanceof Error ? error.message : "probe failed";
      throw new Error(redact(message));
    }
  });
});
