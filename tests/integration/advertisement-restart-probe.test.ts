import { afterAll, describe, expect, it } from "vitest";
import { type AgentIdentity, createAgentIdentity } from "../../src/modules/identity/index.js";
import {
  AVAILABILITY_SKILL_VERSION_V1,
  AwaitedSkillAdvertisementStore,
  createPgPool,
  PostgresSkillAdvertisementStore,
  SkillAdvertisementService,
  type SqlPool,
} from "../../src/modules/skills/index.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const enabled = process.env.PAN_RESTART_PROBE === "1" && databaseUrl !== "";
const AGENT = "pan_agent_11111111-1111-4111-8111-111111111111";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const VERSION = AVAILABILITY_SKILL_VERSION_V1;

const agent = (id: string): AgentIdentity => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

describe.skipIf(!enabled)("fresh process loads the withdrawn advertisement", () => {
  let pool: SqlPool | undefined;

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end();
    }
  });

  it("reads false because the withdrawn advertisement row is present", async () => {
    try {
      pool = createPgPool(databaseUrl);
      const client = await pool.connect();
      const found = await client.query(
        "SELECT status FROM skill_advertisement_records WHERE pair_key = $1",
        [`${AGENT}>${VERSION}`],
      );
      client.release();
      expect(found.rows).toEqual([{ status: "withdrawn" }]);
      const service = new SkillAdvertisementService({
        events: { record() {} },
        store: new AwaitedSkillAdvertisementStore(
          new PostgresSkillAdvertisementStore(pool, { record() {} }),
        ),
        parties: {
          findAgent: async (id) => (id === AGENT ? agent(AGENT) : null),
        },
      });
      expect(await service.readAdvertised(AGENT, VERSION)).toBe(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "probe failed";
      throw new Error(redact(message));
    }
  });
});
