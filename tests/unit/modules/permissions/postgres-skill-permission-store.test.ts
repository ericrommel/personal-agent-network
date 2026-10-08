import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applySkillPermissionSchema,
  createPgPool,
  createSkillPermission,
  PostgresSkillPermissionStore,
  permissionKey,
  SKILL_PERMISSION_EVENT_CONTRACT_V1,
  SKILL_PERMISSION_SCHEMA_SQL,
  type SkillPermission,
  type SkillPermissionEvent,
  type SqlPool,
} from "../../../../src/modules/permissions/index.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";

const event = (command: SkillPermissionEvent["command"] = "grant"): SkillPermissionEvent => ({
  contract: SKILL_PERMISSION_EVENT_CONTRACT_V1,
  correlationId: "corr-1",
  sourceKey: "local-owner",
  command,
  outcome: "accepted",
  control: "none",
});

const active = (effect: "ALLOW" | "ASK" | "DENY" = "ALLOW"): SkillPermission => {
  const created = createSkillPermission(FROM, TO, effect);
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
  const parameters: unknown[][] = [];
  let released = 0;
  let rollbackFails = options?.rollbackFails ?? false;
  const pool: SqlPool = {
    async connect() {
      if (options?.connectFails) {
        throw new Error("connect down");
      }
      return {
        async query(sql: string, values?: readonly unknown[]) {
          queries.push(sql);
          parameters.push([...(values ?? [])]);
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
  return { pool, queries, parameters, released: () => released };
};

const storedRow = (record: SkillPermission, status: SkillPermission["status"] = "revoked") => ({
  permission_id: record.id,
  from_agent_id: record.fromAgentId,
  to_agent_id: record.toAgentId,
  skill_version: record.skillVersion,
  purpose: record.purpose,
  scope: record.scope,
  effect: record.effect,
  status,
});

const dependency = { code: "SKILL_PERMISSION_DEPENDENCY_FAILED" };
const conflictCode = { code: "SKILL_PERMISSION_CONFLICT" };
const notFoundCode = { code: "SKILL_PERMISSION_NOT_FOUND" };

describe("PostgreSQL skill permission store", () => {
  it("matches the reviewed migration and fails closed without a database round trip", async () => {
    const migration = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../../migrations/0004_skill_permissions.sql",
      ),
      "utf8",
    );
    expect(migration.trim()).toBe(SKILL_PERMISSION_SCHEMA_SQL.trim());

    const gate = scripted([]);
    const store = new PostgresSkillPermissionStore(gate.pool, { record() {} });
    const record = active();
    const pending = store.insertDurablePermission({ ...record, status: "revoked" }, event());
    expect(pending).toBeInstanceOf(Promise);
    expect(await pending).toEqual(dependency);
    expect(
      await store.insertDurablePermission({ kind: "nope" } as unknown as SkillPermission, event()),
    ).toEqual(dependency);
    expect(await store.revokeDurablePermission(null, TO, record.id, event())).toEqual(notFoundCode);
    expect(await store.revokeDurablePermission(FROM, FROM, record.id, event())).toEqual(
      notFoundCode,
    );
    expect(await store.revokeDurablePermission(FROM, TO, "not-an-id", event())).toEqual(
      notFoundCode,
    );
    expect(await store.findDurablePermission(null, TO)).toBeNull();
    expect(await store.findDurablePermission(FROM, FROM)).toBeNull();
    expect(gate.queries).toEqual([]);
  });

  it("inserts once, replaces a revoked row, and rolls back when the sink throws", async () => {
    const record = active();
    const happened = event();
    const recorded: SkillPermissionEvent[] = [];
    const inserted = scripted([{ rowCount: 1, rows: [{ permission_id: record.id }] }]);
    let seenAtSink: string[] = [];
    const store = new PostgresSkillPermissionStore(inserted.pool, {
      record(value) {
        seenAtSink = [...inserted.queries];
        recorded.push(value);
      },
    });

    expect(await store.insertDurablePermission(record, happened)).toBe(record);
    expect(recorded).toEqual([happened]);
    expect(seenAtSink).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO skill_permission_records"),
    ]);
    expect(inserted.queries).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO skill_permission_records"),
      "COMMIT",
    ]);
    expect(inserted.queries[1]).toContain("WHERE skill_permission_records.status = 'revoked'");
    expect(inserted.queries[1]).toContain("effect = EXCLUDED.effect");
    expect(inserted.parameters[1]).toEqual([
      permissionKey(record.fromAgentId, record.toAgentId),
      record.id,
      record.fromAgentId,
      record.toAgentId,
      record.skillVersion,
      record.purpose,
      record.scope,
      record.effect,
    ]);
    expect(JSON.stringify(inserted.parameters)).not.toContain(happened.correlationId);
    expect(inserted.queries[1]).not.toMatch(/email|profile|calendar|secret|boolean|event/i);
    expect(inserted.released()).toBe(1);

    let conflictSink = 0;
    const conflicted = scripted([{ rowCount: 0, rows: [] }]);
    const conflictStore = new PostgresSkillPermissionStore(conflicted.pool, {
      record() {
        conflictSink += 1;
      },
    });
    expect(await conflictStore.insertDurablePermission(record, event())).toEqual(conflictCode);
    expect(conflictSink).toBe(0);
    expect(conflicted.queries.at(-1)).toBe("ROLLBACK");
    expect(conflicted.queries).not.toContain("COMMIT");

    const nullCount = scripted([{ rowCount: null, rows: [] }]);
    const nullCountStore = new PostgresSkillPermissionStore(nullCount.pool, { record() {} });
    expect(await nullCountStore.insertDurablePermission(record, event())).toEqual(conflictCode);
    expect(nullCount.queries.at(-1)).toBe("ROLLBACK");

    const rolled = scripted([{ rowCount: 1, rows: [{ permission_id: record.id }] }]);
    const rollbackStore = new PostgresSkillPermissionStore(rolled.pool, {
      record() {
        throw new Error("sink down");
      },
    });
    const rolledBack = await rollbackStore.insertDurablePermission(record, event());
    expect(rolledBack).toEqual(dependency);
    expect(JSON.stringify(rolledBack)).not.toContain("sink down");
    expect(rolled.queries.at(-1)).toBe("ROLLBACK");
    expect(rolled.queries).not.toContain("COMMIT");
  });

  it("keeps a committed revoke when the sink throws and hides database failures", async () => {
    const record = active();
    const revoked = scripted([{ rows: [storedRow(record)] }]);
    const happened = event("revoke");
    const recorded: SkillPermissionEvent[] = [];
    let seenAtSink: string[] = [];
    const store = new PostgresSkillPermissionStore(revoked.pool, {
      record(value) {
        seenAtSink = [...revoked.queries];
        recorded.push(value);
      },
    });
    const saved = await store.revokeDurablePermission(FROM, TO, record.id, happened);
    expect(saved).toMatchObject({
      kind: "skill-permission",
      id: record.id,
      fromAgentId: FROM,
      toAgentId: TO,
      effect: "ALLOW",
      status: "revoked",
    });
    expect(recorded).toEqual([happened]);
    expect(seenAtSink.at(-1)).toBe("COMMIT");
    expect(revoked.queries.at(-1)).toBe("COMMIT");
    expect(revoked.parameters[1]).toEqual([`${FROM}>${TO}`, record.id]);
    expect(JSON.stringify(revoked.parameters)).not.toContain(happened.correlationId);

    const sinkDown = scripted([{ rows: [storedRow(record)] }]);
    const sinkStore = new PostgresSkillPermissionStore(sinkDown.pool, {
      record() {
        throw new Error("sink down");
      },
    });
    const kept = await sinkStore.revokeDurablePermission(FROM, TO, record.id, event("revoke"));
    expect(kept).toMatchObject({ id: record.id, status: "revoked" });
    expect(sinkDown.queries).toContain("COMMIT");
    expect(sinkDown.queries).not.toContain("ROLLBACK");

    const missing = scripted([{ rows: [], rowCount: 0 }]);
    let missingSink = 0;
    const missingStore = new PostgresSkillPermissionStore(missing.pool, {
      record() {
        missingSink += 1;
      },
    });
    expect(await missingStore.revokeDurablePermission(FROM, TO, record.id, event())).toEqual(
      notFoundCode,
    );
    expect(missingSink).toBe(0);
    expect(missing.queries.at(-1)).toBe("ROLLBACK");

    const other = active("ASK");
    const mismatched = scripted([{ rows: [{ ...storedRow(record), permission_id: other.id }] }]);
    const mismatchedStore = new PostgresSkillPermissionStore(mismatched.pool, { record() {} });
    expect(await mismatchedStore.revokeDurablePermission(FROM, TO, record.id, event())).toEqual(
      notFoundCode,
    );
    expect(mismatched.queries.at(-1)).toBe("ROLLBACK");

    const stillActive = scripted([{ rows: [storedRow(record, "active")] }]);
    const stillActiveStore = new PostgresSkillPermissionStore(stillActive.pool, { record() {} });
    expect(await stillActiveStore.revokeDurablePermission(FROM, TO, record.id, event())).toEqual(
      notFoundCode,
    );
    expect(stillActive.queries).not.toContain("COMMIT");

    const corrupt = scripted([{ rows: [{ permission_id: record.id, status: "revoked" }] }]);
    const corruptStore = new PostgresSkillPermissionStore(corrupt.pool, { record() {} });
    expect(await corruptStore.revokeDurablePermission(FROM, TO, record.id, event())).toEqual(
      notFoundCode,
    );
    expect(corrupt.queries.at(-1)).toBe("ROLLBACK");

    const broken = scripted([{ error: new Error("syntax error at skill_permission_records") }], {
      rollbackFails: true,
    });
    const brokenStore = new PostgresSkillPermissionStore(broken.pool, { record() {} });
    const hidden = await brokenStore.insertDurablePermission(record, event());
    expect(hidden).toEqual(dependency);
    expect(JSON.stringify(hidden)).not.toContain("skill_permission_records");
    expect(broken.released()).toBe(1);

    const revokeDown = scripted([
      { error: new Error("update failed on skill_permission_records") },
    ]);
    const revokeDownStore = new PostgresSkillPermissionStore(revokeDown.pool, { record() {} });
    const revokeFailure = await revokeDownStore.revokeDurablePermission(
      FROM,
      TO,
      record.id,
      event(),
    );
    expect(revokeFailure).toEqual(dependency);
    expect(JSON.stringify(revokeFailure)).not.toContain("skill_permission_records");
    expect(revokeDown.queries.at(-1)).toBe("ROLLBACK");

    const offline = scripted([], { connectFails: true });
    const offlineStore = new PostgresSkillPermissionStore(offline.pool, { record() {} });
    expect(await offlineStore.insertDurablePermission(record, event())).toEqual(dependency);
    expect(await offlineStore.revokeDurablePermission(FROM, TO, record.id, event())).toEqual(
      dependency,
    );
    expect(await offlineStore.findDurablePermission(FROM, TO)).toBeNull();
    expect(offline.released()).toBe(0);
  });

  it("reads a mapped row and returns null for a corrupt row or a failed query", async () => {
    const record = active("DENY");
    const found = scripted([
      { rows: [storedRow(record, "active")] },
      {
        rows: [
          {
            ...storedRow(record),
            kind: "relationship",
            email: "owner@node",
            event: "not-stored",
          },
        ],
      },
    ]);
    const store = new PostgresSkillPermissionStore(found.pool, { record() {} });
    expect(await store.findDurablePermission(FROM, TO)).toEqual({
      kind: "skill-permission",
      id: record.id,
      fromAgentId: record.fromAgentId,
      toAgentId: record.toAgentId,
      skillVersion: record.skillVersion,
      purpose: record.purpose,
      scope: record.scope,
      effect: "DENY",
      status: "active",
    });
    const revoked = await store.findDurablePermission(FROM, TO);
    expect(revoked).toMatchObject({ status: "revoked", kind: "skill-permission", effect: "DENY" });
    expect(Object.keys(revoked as object)).toEqual([
      "kind",
      "id",
      "fromAgentId",
      "toAgentId",
      "skillVersion",
      "purpose",
      "scope",
      "effect",
      "status",
    ]);
    expect(found.queries[0]).toContain(
      "SELECT permission_id, from_agent_id, to_agent_id, skill_version, purpose, scope, effect, status",
    );
    expect(found.queries[0]).not.toMatch(/email|profile|calendar|secret|boolean|event/i);
    expect(found.queries).not.toContain("BEGIN");
    expect(found.released()).toBe(2);

    const blank = scripted([{ rows: [] }, { rows: [null] }, { rows: [[]] }]);
    const blankStore = new PostgresSkillPermissionStore(blank.pool, { record() {} });
    expect(await blankStore.findDurablePermission(FROM, TO)).toBeNull();
    expect(await blankStore.findDurablePermission(FROM, TO)).toBeNull();
    expect(await blankStore.findDurablePermission(FROM, TO)).toBeNull();

    const corrupt = scripted([{ rows: [{ permission_id: record.id, status: "active" }] }]);
    const corruptStore = new PostgresSkillPermissionStore(corrupt.pool, { record() {} });
    expect(await corruptStore.findDurablePermission(FROM, TO)).toBeNull();

    const queryDown = scripted([{ error: new Error("select down") }]);
    const queryStore = new PostgresSkillPermissionStore(queryDown.pool, { record() {} });
    expect(await queryStore.findDurablePermission(FROM, TO)).toBeNull();
    expect(queryDown.released()).toBe(1);

    const schema = scripted([{ rowCount: 0, rows: [] }]);
    await applySkillPermissionSchema(schema.pool);
    expect(schema.queries[0]).toBe(SKILL_PERMISSION_SCHEMA_SQL);
    expect(schema.released()).toBe(1);
    const schemaDown = scripted([{ error: new Error("ddl down") }]);
    await expect(applySkillPermissionSchema(schemaDown.pool)).rejects.toThrow("ddl down");
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
              rows: [storedRow(active(), "active")],
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
    expect(result.rows).toHaveLength(1);
    client.release();
    await wrapped.end();
    expect(released).toBe(true);
    expect(ended).toBe(true);

    const real = createPgPool("postgres://pan:pan@127.0.0.1:1/pan");
    await real.end();
  });
});
