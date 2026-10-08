import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyRelationshipSchema,
  createPgPool,
  createRelationship,
  PostgresRelationshipStore,
  RELATIONSHIP_EVENT_CONTRACT_V1,
  RELATIONSHIP_SCHEMA_SQL,
  type Relationship,
  type RelationshipEvent,
  type SqlPool,
} from "../../../../src/modules/relationships/index.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";

const event = (): RelationshipEvent => ({
  contract: RELATIONSHIP_EVENT_CONTRACT_V1,
  correlationId: "corr-1",
  sourceKey: "local-owner",
  command: "create",
  outcome: "accepted",
  control: "none",
});

const active = (): Relationship => {
  const created = createRelationship(FROM, TO);
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

type Script = Readonly<{
  rows?: readonly unknown[];
  rowCount?: number | null;
  error?: Error;
}>;

const scripted = (
  scripts: Script[],
  options?: { rollbackFails?: boolean; connectFails?: boolean },
) => {
  const queries: string[] = [];
  let released = 0;
  let rollbackFails = options?.rollbackFails ?? false;
  const pool: SqlPool = {
    async connect() {
      if (options?.connectFails) {
        throw new Error("connect down");
      }
      return {
        async query(sql: string) {
          queries.push(sql);
          if (sql === "BEGIN" || sql === "COMMIT") {
            return { rows: [], rowCount: 0 };
          }
          if (sql === "ROLLBACK") {
            if (rollbackFails) {
              rollbackFails = false;
              throw new Error("rollback down");
            }
            return { rows: [], rowCount: 0 };
          }
          const next = scripts.shift();
          if (next === undefined) {
            throw new Error(`unexpected ${sql}`);
          }
          if (next.error !== undefined) {
            throw next.error;
          }
          return {
            rows: next.rows ?? [],
            rowCount: next.rowCount === undefined ? (next.rows?.length ?? 0) : next.rowCount,
          };
        },
        release() {
          released += 1;
        },
      };
    },
    async end() {
      return undefined;
    },
  };
  return { pool, queries, released: () => released };
};

const revokedRow = (relationship: Relationship) => ({
  relationship_id: relationship.id,
  from_agent_id: relationship.fromAgentId,
  to_agent_id: relationship.toAgentId,
  status: "revoked",
});

describe("PostgreSQL relationship store", () => {
  it("matches the reviewed migration and fails closed without a database round trip", async () => {
    const migration = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../../migrations/0001_relationships.sql",
      ),
      "utf8",
    );
    expect(migration.trim()).toBe(RELATIONSHIP_SCHEMA_SQL.trim());

    const gate = scripted([]);
    const store = new PostgresRelationshipStore(gate.pool, { record() {} });
    const relationship = active();
    expect(await store.insertActive({ ...relationship, status: "revoked" }, event())).toEqual({
      code: "RELATIONSHIP_DEPENDENCY_FAILED",
    });
    expect(await store.revokeMatching(FROM, FROM, relationship.id, event())).toEqual({
      code: "RELATIONSHIP_NOT_FOUND",
    });
    expect(await store.revokeMatching(FROM, TO, "not-an-id", event())).toEqual({
      code: "RELATIONSHIP_NOT_FOUND",
    });
    expect(await store.findByDirectedPair(FROM, FROM)).toBeNull();
    expect(await store.insertActive({ kind: "nope" } as unknown as Relationship, event())).toEqual({
      code: "RELATIONSHIP_DEPENDENCY_FAILED",
    });
    expect(gate.queries).toEqual([]);
  });

  it("inserts once, replaces a revoked row, and rolls back when the sink throws", async () => {
    const relationship = active();
    const recorded: RelationshipEvent[] = [];
    const inserted = scripted([{ rowCount: 1, rows: [{ relationship_id: relationship.id }] }]);
    const store = new PostgresRelationshipStore(inserted.pool, {
      record(value) {
        recorded.push(value);
      },
    });

    expect(await store.insertActive(relationship, event())).toBe(relationship);
    expect(recorded).toHaveLength(1);
    expect(inserted.queries).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO relationship_records"),
      "COMMIT",
    ]);
    expect(inserted.released()).toBe(1);

    const conflicted = scripted([{ rowCount: 0, rows: [] }]);
    const conflictStore = new PostgresRelationshipStore(conflicted.pool, { record() {} });
    expect(await conflictStore.insertActive(relationship, event())).toEqual({
      code: "RELATIONSHIP_CONFLICT",
    });
    expect(conflicted.queries.at(-1)).toBe("ROLLBACK");

    const nullCount = scripted([{ rowCount: null, rows: [] }]);
    const nullCountStore = new PostgresRelationshipStore(nullCount.pool, { record() {} });
    expect(await nullCountStore.insertActive(relationship, event())).toEqual({
      code: "RELATIONSHIP_CONFLICT",
    });

    const rolled = scripted([{ rowCount: 1, rows: [{ relationship_id: relationship.id }] }]);
    const rollbackStore = new PostgresRelationshipStore(rolled.pool, {
      record() {
        throw new Error("sink down");
      },
    });
    expect(await rollbackStore.insertActive(relationship, event())).toEqual({
      code: "RELATIONSHIP_DEPENDENCY_FAILED",
    });
    expect(rolled.queries.at(-1)).toBe("ROLLBACK");
  });

  it("keeps a committed revoke when the sink throws and hides database failures", async () => {
    const relationship = active();
    const revoked = scripted([{ rows: [revokedRow(relationship)] }]);
    let sinkCalls = 0;
    const store = new PostgresRelationshipStore(revoked.pool, {
      record() {
        sinkCalls += 1;
        throw new Error("sink down");
      },
    });
    const saved = await store.revokeMatching(FROM, TO, relationship.id, {
      ...event(),
      command: "revoke",
    });
    expect(saved).toMatchObject({ id: relationship.id, status: "revoked" });
    expect(sinkCalls).toBe(1);
    expect(revoked.queries).toContain("COMMIT");

    const missing = scripted([{ rows: [], rowCount: 0 }]);
    const missingStore = new PostgresRelationshipStore(missing.pool, { record() {} });
    expect(await missingStore.revokeMatching(FROM, TO, relationship.id, event())).toEqual({
      code: "RELATIONSHIP_NOT_FOUND",
    });

    const mismatched = scripted([
      { rows: [{ ...revokedRow(relationship), relationship_id: active().id }] },
    ]);
    const mismatchedStore = new PostgresRelationshipStore(mismatched.pool, { record() {} });
    expect(await mismatchedStore.revokeMatching(FROM, TO, relationship.id, event())).toEqual({
      code: "RELATIONSHIP_NOT_FOUND",
    });

    const stillActive = scripted([{ rows: [{ ...revokedRow(relationship), status: "active" }] }]);
    const stillActiveStore = new PostgresRelationshipStore(stillActive.pool, { record() {} });
    expect(await stillActiveStore.revokeMatching(FROM, TO, relationship.id, event())).toEqual({
      code: "RELATIONSHIP_NOT_FOUND",
    });

    const broken = scripted([{ error: new Error("db down") }], { rollbackFails: true });
    const brokenStore = new PostgresRelationshipStore(broken.pool, { record() {} });
    expect(await brokenStore.insertActive(relationship, event())).toEqual({
      code: "RELATIONSHIP_DEPENDENCY_FAILED",
    });
    expect(broken.released()).toBe(1);

    const offline = scripted([], { connectFails: true });
    const offlineStore = new PostgresRelationshipStore(offline.pool, { record() {} });
    expect(await offlineStore.insertActive(relationship, event())).toEqual({
      code: "RELATIONSHIP_DEPENDENCY_FAILED",
    });
    expect(await offlineStore.findByDirectedPair(FROM, TO)).toBeNull();

    const recorded: RelationshipEvent[] = [];
    const clean = scripted([{ rows: [revokedRow(relationship)] }]);
    const cleanStore = new PostgresRelationshipStore(clean.pool, {
      record(value) {
        recorded.push(value);
      },
    });
    expect(await cleanStore.revokeMatching(FROM, TO, relationship.id, event())).toMatchObject({
      status: "revoked",
    });
    expect(recorded).toHaveLength(1);

    const revokeDown = scripted([{ error: new Error("update down") }]);
    const revokeDownStore = new PostgresRelationshipStore(revokeDown.pool, { record() {} });
    expect(await revokeDownStore.revokeMatching(FROM, TO, relationship.id, event())).toEqual({
      code: "RELATIONSHIP_DEPENDENCY_FAILED",
    });
    expect(revokeDown.queries.at(-1)).toBe("ROLLBACK");
  });

  it("reads a mapped row and returns null for a corrupt row or a failed query", async () => {
    const relationship = active();
    const found = scripted([
      {
        rows: [
          {
            relationship_id: relationship.id,
            from_agent_id: relationship.fromAgentId,
            to_agent_id: relationship.toAgentId,
            status: "active",
          },
        ],
      },
    ]);
    const store = new PostgresRelationshipStore(found.pool, { record() {} });
    expect(await store.findByDirectedPair(FROM, TO)).toMatchObject({
      id: relationship.id,
      status: "active",
    });

    const blank = scripted([{ rows: [null] }, { rows: [[]] }]);
    const blankStore = new PostgresRelationshipStore(blank.pool, { record() {} });
    expect(await blankStore.findByDirectedPair(FROM, TO)).toBeNull();
    expect(await blankStore.findByDirectedPair(FROM, TO)).toBeNull();

    const corrupt = scripted([{ rows: [{ relationship_id: relationship.id, status: "active" }] }]);
    const corruptStore = new PostgresRelationshipStore(corrupt.pool, { record() {} });
    expect(await corruptStore.findByDirectedPair(FROM, TO)).toBeNull();
    expect(await corruptStore.findByDirectedPair(FROM, TO)).toBeNull();

    const queryDown = scripted([{ error: new Error("select down") }]);
    const queryStore = new PostgresRelationshipStore(queryDown.pool, { record() {} });
    expect(await queryStore.findByDirectedPair(FROM, TO)).toBeNull();
    expect(queryDown.released()).toBe(1);

    const schema = scripted([{ rowCount: 0, rows: [] }]);
    await applyRelationshipSchema(schema.pool);
    expect(schema.queries[0]).toContain("CREATE TABLE IF NOT EXISTS relationship_records");
    const schemaDown = scripted([{ error: new Error("ddl down") }]);
    await expect(applyRelationshipSchema(schemaDown.pool)).rejects.toThrow("ddl down");
    expect(schemaDown.released()).toBe(1);
  });

  it("wraps node-postgres without opening a connection in the unit test", async () => {
    let ended = false;
    let released = false;
    const wrapped = createPgPool("postgres://pan:pan@127.0.0.1:1/pan", () => ({
      async connect() {
        return {
          async query() {
            return {
              rows: [revokedRow(active())],
              rowCount: 1,
            };
          },
          release() {
            released = true;
          },
        };
      },
      async end() {
        ended = true;
      },
    }));
    const client = await wrapped.connect();
    const result = await client.query("SELECT 1", ["pan"]);
    expect(result.rowCount).toBe(1);
    client.release();
    await wrapped.end();
    expect(released).toBe(true);
    expect(ended).toBe(true);

    const real = createPgPool("postgres://pan:pan@127.0.0.1:1/pan");
    await real.end();
  });
});
