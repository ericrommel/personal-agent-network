import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_SKILL_VERSION_V1,
  advertisementKey,
  applySkillAdvertisementSchema,
  createPgPool,
  createSkillAdvertisement,
  PostgresSkillAdvertisementStore,
  SKILL_ADVERTISEMENT_EVENT_CONTRACT_V1,
  SKILL_ADVERTISEMENT_SCHEMA_SQL,
  type SkillAdvertisement,
  type SkillAdvertisementEvent,
  type SqlPool,
} from "../../../../src/modules/skills/index.js";

const AGENT = "pan_agent_11111111-1111-4111-8111-111111111111";
const VERSION = AVAILABILITY_SKILL_VERSION_V1;

const event = (
  command: SkillAdvertisementEvent["command"] = "advertise",
): SkillAdvertisementEvent => ({
  contract: SKILL_ADVERTISEMENT_EVENT_CONTRACT_V1,
  correlationId: "corr-1",
  sourceKey: "local-owner",
  command,
  outcome: "accepted",
  control: "none",
});

const advertised = (): SkillAdvertisement => {
  const created = createSkillAdvertisement(AGENT);
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

const storedRow = (
  record: SkillAdvertisement,
  status: SkillAdvertisement["status"] = "withdrawn",
) => ({
  advertisement_id: record.id,
  agent_id: record.agentId,
  skill_version: record.skillVersion,
  status,
});

const dependency = { code: "SKILL_ADVERTISEMENT_DEPENDENCY_FAILED" };
const conflictCode = { code: "SKILL_ADVERTISEMENT_CONFLICT" };
const notFoundCode = { code: "SKILL_ADVERTISEMENT_NOT_FOUND" };

describe("PostgreSQL skill advertisement store", () => {
  it("matches the reviewed migration and fails closed without a database round trip", async () => {
    const migration = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../../migrations/0005_skill_advertisements.sql",
      ),
      "utf8",
    );
    expect(migration.trim()).toBe(SKILL_ADVERTISEMENT_SCHEMA_SQL.trim());

    const gate = scripted([]);
    const store = new PostgresSkillAdvertisementStore(gate.pool, { record() {} });
    const record = advertised();
    const pending = store.insertAdvertised({ ...record, status: "withdrawn" }, event());
    expect(pending).toBeInstanceOf(Promise);
    expect(await pending).toEqual(dependency);
    expect(
      await store.insertAdvertised({ kind: "nope" } as unknown as SkillAdvertisement, event()),
    ).toEqual(dependency);
    expect(await store.withdrawMatching(null, VERSION, record.id, event())).toEqual(notFoundCode);
    expect(await store.withdrawMatching(AGENT, "pan.skill.other/v1", record.id, event())).toEqual(
      notFoundCode,
    );
    expect(await store.withdrawMatching(AGENT, VERSION, "not-an-id", event())).toEqual(
      notFoundCode,
    );
    expect(await store.findCurrent(null, VERSION)).toBeNull();
    expect(await store.findCurrent(AGENT, "pan.skill.other/v1")).toBeNull();
    expect(gate.queries).toEqual([]);
  });

  it("inserts once, replaces a withdrawn row, and rolls back when the sink throws", async () => {
    const record = advertised();
    const happened = event();
    const recorded: SkillAdvertisementEvent[] = [];
    const inserted = scripted([{ rowCount: 1, rows: [{ advertisement_id: record.id }] }]);
    let seenAtSink: string[] = [];
    const store = new PostgresSkillAdvertisementStore(inserted.pool, {
      record(value) {
        seenAtSink = [...inserted.queries];
        recorded.push(value);
      },
    });

    expect(await store.insertAdvertised(record, happened)).toBe(record);
    expect(recorded).toEqual([happened]);
    expect(seenAtSink).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO skill_advertisement_records"),
    ]);
    expect(inserted.queries).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO skill_advertisement_records"),
      "COMMIT",
    ]);
    expect(inserted.queries[1]).toContain("WHERE skill_advertisement_records.status = 'withdrawn'");
    expect(inserted.queries[1]).toContain("SET advertisement_id = EXCLUDED.advertisement_id");
    expect(inserted.parameters[1]).toEqual([
      advertisementKey(record.agentId, record.skillVersion),
      record.id,
      record.agentId,
      record.skillVersion,
    ]);
    expect(JSON.stringify(inserted.parameters)).not.toContain(happened.correlationId);
    expect(inserted.queries[1]).not.toMatch(/permission|email|profile|calendar|secret|event/i);
    expect(inserted.released()).toBe(1);

    let conflictSink = 0;
    const conflicted = scripted([{ rowCount: 0, rows: [] }]);
    const conflictStore = new PostgresSkillAdvertisementStore(conflicted.pool, {
      record() {
        conflictSink += 1;
      },
    });
    expect(await conflictStore.insertAdvertised(record, event())).toEqual(conflictCode);
    expect(conflictSink).toBe(0);
    expect(conflicted.queries.at(-1)).toBe("ROLLBACK");
    expect(conflicted.queries).not.toContain("COMMIT");

    const nullCount = scripted([{ rowCount: null, rows: [] }]);
    const nullCountStore = new PostgresSkillAdvertisementStore(nullCount.pool, { record() {} });
    expect(await nullCountStore.insertAdvertised(record, event())).toEqual(conflictCode);
    expect(nullCount.queries.at(-1)).toBe("ROLLBACK");

    const rolled = scripted([{ rowCount: 1, rows: [{ advertisement_id: record.id }] }]);
    const rollbackStore = new PostgresSkillAdvertisementStore(rolled.pool, {
      record() {
        throw new Error("sink down");
      },
    });
    const rolledBack = await rollbackStore.insertAdvertised(record, event());
    expect(rolledBack).toEqual(dependency);
    expect(JSON.stringify(rolledBack)).not.toContain("sink down");
    expect(rolled.queries.at(-1)).toBe("ROLLBACK");
    expect(rolled.queries).not.toContain("COMMIT");
  });

  it("keeps a committed withdrawal when the sink throws and hides database failures", async () => {
    const record = advertised();
    const withdrawn = scripted([{ rows: [storedRow(record)] }]);
    const happened = event("withdraw");
    const recorded: SkillAdvertisementEvent[] = [];
    let seenAtSink: string[] = [];
    const store = new PostgresSkillAdvertisementStore(withdrawn.pool, {
      record(value) {
        seenAtSink = [...withdrawn.queries];
        recorded.push(value);
      },
    });
    const saved = await store.withdrawMatching(AGENT, VERSION, record.id, happened);
    expect(saved).toMatchObject({
      kind: "skill-advertisement",
      id: record.id,
      agentId: AGENT,
      skillVersion: VERSION,
      status: "withdrawn",
    });
    expect(recorded).toEqual([happened]);
    expect(seenAtSink.at(-1)).toBe("COMMIT");
    expect(withdrawn.queries.at(-1)).toBe("COMMIT");
    expect(withdrawn.parameters[1]).toEqual([`${AGENT}>${VERSION}`, record.id]);
    expect(JSON.stringify(withdrawn.parameters)).not.toContain(happened.correlationId);

    const sinkDown = scripted([{ rows: [storedRow(record)] }]);
    const sinkStore = new PostgresSkillAdvertisementStore(sinkDown.pool, {
      record() {
        throw new Error("sink down");
      },
    });
    const kept = await sinkStore.withdrawMatching(AGENT, VERSION, record.id, event("withdraw"));
    expect(kept).toMatchObject({ id: record.id, status: "withdrawn" });
    expect(sinkDown.queries).toContain("COMMIT");
    expect(sinkDown.queries).not.toContain("ROLLBACK");

    const missing = scripted([{ rows: [], rowCount: 0 }]);
    let missingSink = 0;
    const missingStore = new PostgresSkillAdvertisementStore(missing.pool, {
      record() {
        missingSink += 1;
      },
    });
    expect(await missingStore.withdrawMatching(AGENT, VERSION, record.id, event())).toEqual(
      notFoundCode,
    );
    expect(missingSink).toBe(0);
    expect(missing.queries.at(-1)).toBe("ROLLBACK");

    const other = advertised();
    const mismatched = scripted([{ rows: [{ ...storedRow(record), advertisement_id: other.id }] }]);
    const mismatchedStore = new PostgresSkillAdvertisementStore(mismatched.pool, { record() {} });
    expect(await mismatchedStore.withdrawMatching(AGENT, VERSION, record.id, event())).toEqual(
      notFoundCode,
    );
    expect(mismatched.queries.at(-1)).toBe("ROLLBACK");

    const stillAdvertised = scripted([{ rows: [storedRow(record, "advertised")] }]);
    const stillAdvertisedStore = new PostgresSkillAdvertisementStore(stillAdvertised.pool, {
      record() {},
    });
    expect(await stillAdvertisedStore.withdrawMatching(AGENT, VERSION, record.id, event())).toEqual(
      notFoundCode,
    );
    expect(stillAdvertised.queries).not.toContain("COMMIT");

    const corrupt = scripted([{ rows: [{ advertisement_id: record.id, status: "withdrawn" }] }]);
    const corruptStore = new PostgresSkillAdvertisementStore(corrupt.pool, { record() {} });
    expect(await corruptStore.withdrawMatching(AGENT, VERSION, record.id, event())).toEqual(
      notFoundCode,
    );
    expect(corrupt.queries.at(-1)).toBe("ROLLBACK");

    const broken = scripted([{ error: new Error("syntax error at skill_advertisement_records") }], {
      rollbackFails: true,
    });
    const brokenStore = new PostgresSkillAdvertisementStore(broken.pool, { record() {} });
    const hidden = await brokenStore.insertAdvertised(record, event());
    expect(hidden).toEqual(dependency);
    expect(JSON.stringify(hidden)).not.toContain("skill_advertisement_records");
    expect(broken.released()).toBe(1);

    const withdrawDown = scripted([
      { error: new Error("update failed on skill_advertisement_records") },
    ]);
    const withdrawDownStore = new PostgresSkillAdvertisementStore(withdrawDown.pool, {
      record() {},
    });
    const withdrawFailure = await withdrawDownStore.withdrawMatching(
      AGENT,
      VERSION,
      record.id,
      event(),
    );
    expect(withdrawFailure).toEqual(dependency);
    expect(JSON.stringify(withdrawFailure)).not.toContain("skill_advertisement_records");
    expect(withdrawDown.queries.at(-1)).toBe("ROLLBACK");

    const offline = scripted([], { connectFails: true });
    const offlineStore = new PostgresSkillAdvertisementStore(offline.pool, { record() {} });
    expect(await offlineStore.insertAdvertised(record, event())).toEqual(dependency);
    expect(await offlineStore.withdrawMatching(AGENT, VERSION, record.id, event())).toEqual(
      dependency,
    );
    expect(await offlineStore.findCurrent(AGENT, VERSION)).toBeNull();
    expect(offline.released()).toBe(0);
  });

  it("reads a mapped row and returns null for a corrupt row or a failed query", async () => {
    const record = advertised();
    const found = scripted([
      { rows: [storedRow(record, "advertised")] },
      {
        rows: [
          {
            ...storedRow(record),
            kind: "permission",
            permission: "ALLOW",
            event: "not-stored",
          },
        ],
      },
    ]);
    const store = new PostgresSkillAdvertisementStore(found.pool, { record() {} });
    expect(await store.findCurrent(AGENT, VERSION)).toEqual({
      kind: "skill-advertisement",
      id: record.id,
      agentId: record.agentId,
      skillVersion: record.skillVersion,
      status: "advertised",
    });
    const withdrawn = await store.findCurrent(AGENT, VERSION);
    expect(withdrawn).toMatchObject({ status: "withdrawn", kind: "skill-advertisement" });
    expect(Object.keys(withdrawn as object)).toEqual([
      "kind",
      "id",
      "agentId",
      "skillVersion",
      "status",
    ]);
    expect(found.queries[0]).toContain("SELECT advertisement_id, agent_id, skill_version, status");
    expect(found.queries[0]).not.toMatch(/permission|email|profile|calendar|secret|event/i);
    expect(found.queries).not.toContain("BEGIN");
    expect(found.released()).toBe(2);

    const blank = scripted([{ rows: [] }, { rows: [null] }, { rows: [[]] }]);
    const blankStore = new PostgresSkillAdvertisementStore(blank.pool, { record() {} });
    expect(await blankStore.findCurrent(AGENT, VERSION)).toBeNull();
    expect(await blankStore.findCurrent(AGENT, VERSION)).toBeNull();
    expect(await blankStore.findCurrent(AGENT, VERSION)).toBeNull();

    const corrupt = scripted([{ rows: [{ advertisement_id: record.id, status: "advertised" }] }]);
    const corruptStore = new PostgresSkillAdvertisementStore(corrupt.pool, { record() {} });
    expect(await corruptStore.findCurrent(AGENT, VERSION)).toBeNull();

    const queryDown = scripted([{ error: new Error("select down") }]);
    const queryStore = new PostgresSkillAdvertisementStore(queryDown.pool, { record() {} });
    expect(await queryStore.findCurrent(AGENT, VERSION)).toBeNull();
    expect(queryDown.released()).toBe(1);

    const schema = scripted([{ rowCount: 0, rows: [] }]);
    await applySkillAdvertisementSchema(schema.pool);
    expect(schema.queries[0]).toBe(SKILL_ADVERTISEMENT_SCHEMA_SQL);
    expect(schema.released()).toBe(1);
    const schemaDown = scripted([{ error: new Error("ddl down") }]);
    await expect(applySkillAdvertisementSchema(schemaDown.pool)).rejects.toThrow("ddl down");
    expect(schemaDown.released()).toBe(1);
  });

  it("wraps node-postgres without opening a connection in the unit test", async () => {
    let ended = false;
    let released = false;
    const wrapped = createPgPool("postgres://127.0.0.1:1/pan", () => ({
      async connect() {
        return {
          async query() {
            return {
              rows: [storedRow(advertised(), "advertised")],
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

    const real = createPgPool("postgres://127.0.0.1:1/pan");
    await real.end();
  });
});
