import { afterAll, describe, expect, it } from "vitest";
import {
  applySkillPermissionSchema,
  createPgPool,
  createSkillPermission,
  PostgresSkillPermissionStore,
  SKILL_PERMISSION_EVENT_CONTRACT_V1,
  type SkillPermissionEvent,
  type SqlPool,
} from "../../src/modules/permissions/index.js";

const PERMISSION_TABLE_LOCK = 81421004;
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";

const event = (command: "grant" | "revoke"): SkillPermissionEvent => ({
  contract: SKILL_PERMISSION_EVENT_CONTRACT_V1,
  correlationId: "corr-durable",
  sourceKey: "local-owner",
  command,
  outcome: "accepted",
  control: "none",
});

const fixture = (effect: "ALLOW" | "ASK" | "DENY") => {
  const created = createSkillPermission(FROM, TO, effect);
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

describe.skipIf((process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "") === "")(
  "durable skill permission revocation",
  () => {
    let pool: SqlPool | undefined;

    afterAll(async () => {
      if (pool !== undefined) {
        await pool.end();
      }
    });

    it("keeps a revoke across instances and rolls an insert back when the sink throws", async () => {
      const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
      pool = createPgPool(databaseUrl);
      await applySkillPermissionSchema(pool);
      const lock = await pool.connect();
      await lock.query("SELECT pg_advisory_lock($1)", [PERMISSION_TABLE_LOCK]);
      try {
        await lock.query("TRUNCATE skill_permission_records", []);

        const uncommitted = fixture("ALLOW");
        const sinkDown = new PostgresSkillPermissionStore(pool, {
          record() {
            throw new Error("sink down");
          },
        });
        expect(await sinkDown.insertDurablePermission(uncommitted, event("grant"))).toEqual({
          code: "SKILL_PERMISSION_DEPENDENCY_FAILED",
        });
        expect(await sinkDown.findDurablePermission(FROM, TO)).toBeNull();

        const created = fixture("ALLOW");
        const first = new PostgresSkillPermissionStore(pool, { record() {} });
        expect(await first.insertDurablePermission(created, event("grant"))).toMatchObject({
          id: created.id,
          effect: "ALLOW",
          status: "active",
        });
        const conflicting = fixture("DENY");
        expect(await first.insertDurablePermission(conflicting, event("grant"))).toEqual({
          code: "SKILL_PERMISSION_CONFLICT",
        });
        expect(await first.findDurablePermission(FROM, TO)).toMatchObject({
          id: created.id,
          effect: "ALLOW",
          status: "active",
        });

        const revoking = new PostgresSkillPermissionStore(pool, {
          record() {
            throw new Error("sink down");
          },
        });
        expect(
          await revoking.revokeDurablePermission(FROM, TO, created.id, event("revoke")),
        ).toMatchObject({
          id: created.id,
          effect: "ALLOW",
          status: "revoked",
        });

        const restarted = new PostgresSkillPermissionStore(pool, { record() {} });
        expect(await restarted.findDurablePermission(FROM, TO)).toMatchObject({
          id: created.id,
          kind: "skill-permission",
          effect: "ALLOW",
          status: "revoked",
        });

        const replacement = fixture("ASK");
        expect(await restarted.insertDurablePermission(replacement, event("grant"))).toMatchObject({
          id: replacement.id,
          effect: "ASK",
          status: "active",
        });
        const secondConflict = fixture("DENY");
        expect(await restarted.insertDurablePermission(secondConflict, event("grant"))).toEqual({
          code: "SKILL_PERMISSION_CONFLICT",
        });
      } finally {
        await lock.query("SELECT pg_advisory_unlock($1)", [PERMISSION_TABLE_LOCK]);
        lock.release();
      }
    });
  },
);
