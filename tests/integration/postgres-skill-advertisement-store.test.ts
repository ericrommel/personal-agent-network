import { afterAll, describe, expect, it } from "vitest";
import {
  AVAILABILITY_SKILL_VERSION_V1,
  applySkillAdvertisementSchema,
  createPgPool,
  createSkillAdvertisement,
  PostgresSkillAdvertisementStore,
  SKILL_ADVERTISEMENT_EVENT_CONTRACT_V1,
  type SkillAdvertisementEvent,
  type SqlPool,
} from "../../src/modules/skills/index.js";

const AGENT = "pan_agent_11111111-1111-4111-8111-111111111111";
const VERSION = AVAILABILITY_SKILL_VERSION_V1;

const event = (command: "advertise" | "withdraw"): SkillAdvertisementEvent => ({
  contract: SKILL_ADVERTISEMENT_EVENT_CONTRACT_V1,
  correlationId: "corr-durable",
  sourceKey: "local-owner",
  command,
  outcome: "accepted",
  control: "none",
});

const fixture = () => {
  const created = createSkillAdvertisement(AGENT);
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

describe.skipIf((process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "") === "")(
  "durable skill advertisement withdrawal",
  () => {
    let pool: SqlPool | undefined;

    afterAll(async () => {
      if (pool !== undefined) {
        await pool.end();
      }
    });

    it("keeps a withdrawal across instances and rolls an insert back when the sink throws", async () => {
      const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
      pool = createPgPool(databaseUrl);
      await applySkillAdvertisementSchema(pool);
      const client = await pool.connect();
      await client.query("TRUNCATE skill_advertisement_records", []);
      client.release();

      const uncommitted = fixture();
      const sinkDown = new PostgresSkillAdvertisementStore(pool, {
        record() {
          throw new Error("sink down");
        },
      });
      expect(await sinkDown.insertDurableAdvertisement(uncommitted, event("advertise"))).toEqual({
        code: "SKILL_ADVERTISEMENT_DEPENDENCY_FAILED",
      });
      expect(await sinkDown.findDurableAdvertisement(AGENT, VERSION)).toBeNull();

      const created = fixture();
      const first = new PostgresSkillAdvertisementStore(pool, { record() {} });
      expect(await first.insertDurableAdvertisement(created, event("advertise"))).toMatchObject({
        id: created.id,
        status: "advertised",
      });
      const conflicting = fixture();
      expect(await first.insertDurableAdvertisement(conflicting, event("advertise"))).toEqual({
        code: "SKILL_ADVERTISEMENT_CONFLICT",
      });
      expect(await first.findDurableAdvertisement(AGENT, VERSION)).toMatchObject({
        id: created.id,
        status: "advertised",
      });

      const withdrawing = new PostgresSkillAdvertisementStore(pool, {
        record() {
          throw new Error("sink down");
        },
      });
      expect(
        await withdrawing.withdrawDurableAdvertisement(
          AGENT,
          VERSION,
          created.id,
          event("withdraw"),
        ),
      ).toMatchObject({ id: created.id, status: "withdrawn" });

      const restarted = new PostgresSkillAdvertisementStore(pool, { record() {} });
      expect(await restarted.findDurableAdvertisement(AGENT, VERSION)).toMatchObject({
        id: created.id,
        kind: "skill-advertisement",
        status: "withdrawn",
      });

      const replacement = fixture();
      expect(
        await restarted.insertDurableAdvertisement(replacement, event("advertise")),
      ).toMatchObject({
        id: replacement.id,
        status: "advertised",
      });
      const secondConflict = fixture();
      expect(
        await restarted.insertDurableAdvertisement(secondConflict, event("advertise")),
      ).toEqual({
        code: "SKILL_ADVERTISEMENT_CONFLICT",
      });
    });
  },
);
