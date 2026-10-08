import { afterAll, describe, expect, it } from "vitest";
import {
  applyRelationshipSchema,
  createPgPool,
  createRelationship,
  PostgresRelationshipStore,
  RELATIONSHIP_EVENT_CONTRACT_V1,
  type RelationshipEvent,
  type SqlPool,
} from "../../src/modules/relationships/index.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";

const event = (command: "create" | "revoke"): RelationshipEvent => ({
  contract: RELATIONSHIP_EVENT_CONTRACT_V1,
  correlationId: "corr-durable",
  sourceKey: "local-owner",
  command,
  outcome: "accepted",
  control: "none",
});

describe.skipIf(databaseUrl === "")("durable relationship revocation", () => {
  let pool: SqlPool | undefined;

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end();
    }
  });

  it("keeps a revoke after a new store instance and rolls an insert back when the sink throws", async () => {
    pool = createPgPool(databaseUrl);
    await applyRelationshipSchema(pool);
    const client = await pool.connect();
    await client.query("TRUNCATE relationship_records", []);
    client.release();

    const created = createRelationship(FROM, TO);
    if (!created.ok) {
      throw new Error("fixture");
    }
    const first = new PostgresRelationshipStore(pool, { record() {} });
    expect(await first.insertActive(created.value, event("create"))).toMatchObject({
      status: "active",
    });

    const restarted = new PostgresRelationshipStore(pool, { record() {} });
    expect(await restarted.findByDirectedPair(FROM, TO)).toMatchObject({
      id: created.value.id,
      status: "active",
    });
    expect(
      await restarted.revokeMatching(FROM, TO, created.value.id, event("revoke")),
    ).toMatchObject({ status: "revoked" });

    const afterRestart = new PostgresRelationshipStore(pool, { record() {} });
    expect(await afterRestart.findByDirectedPair(FROM, TO)).toMatchObject({ status: "revoked" });

    const replacement = createRelationship(FROM, TO);
    if (!replacement.ok) {
      throw new Error("fixture");
    }
    expect(await afterRestart.insertActive(replacement.value, event("create"))).toMatchObject({
      id: replacement.value.id,
      status: "active",
    });

    const conflicting = createRelationship(FROM, TO);
    if (!conflicting.ok) {
      throw new Error("fixture");
    }
    expect(await afterRestart.insertActive(conflicting.value, event("create"))).toEqual({
      code: "RELATIONSHIP_CONFLICT",
    });

    const sinkDown = new PostgresRelationshipStore(pool, {
      record() {
        throw new Error("sink down");
      },
    });
    const uncommitted = createRelationship(TO, FROM);
    if (!uncommitted.ok) {
      throw new Error("fixture");
    }
    expect(await sinkDown.insertActive(uncommitted.value, event("create"))).toEqual({
      code: "RELATIONSHIP_DEPENDENCY_FAILED",
    });
    expect(await sinkDown.findByDirectedPair(TO, FROM)).toBeNull();

    expect(
      await sinkDown.revokeMatching(FROM, TO, replacement.value.id, event("revoke")),
    ).toMatchObject({ status: "revoked" });
    const finalStore = new PostgresRelationshipStore(pool, { record() {} });
    expect(await finalStore.findByDirectedPair(FROM, TO)).toMatchObject({ status: "revoked" });
  });
});
