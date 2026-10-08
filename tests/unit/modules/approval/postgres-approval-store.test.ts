import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createPendingApproval,
  readApprovalBinding,
  sameApprovalBinding,
  withApprovalStatus,
} from "../../../../src/modules/approval/domain/approval.js";
import {
  APPROVAL_POLICY_VERSION_V1,
  APPROVAL_PURPOSE_V1,
  APPROVAL_SCHEMA_SQL,
  APPROVAL_SCOPE_V1,
  APPROVAL_SKILL_VERSION_V1,
  type ApprovalRecord,
  type ApprovalStatus,
  applyApprovalSchema,
  createPgPool,
  isApproval,
  PostgresApprovalStore,
  type SqlPool,
} from "../../../../src/modules/approval/index.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-8222-222222222222";
const STATUSES = [
  "pending",
  "approved",
  "rejected",
  "expired",
  "released",
  "invalidated",
] as const satisfies readonly ApprovalStatus[];

const bindingOf = (overrides: Record<string, unknown> = {}) => {
  const binding = readApprovalBinding({
    requestId: "req-1",
    fromAgentId: FROM,
    toAgentId: TO,
    skillVersion: APPROVAL_SKILL_VERSION_V1,
    purpose: APPROVAL_PURPOSE_V1,
    scope: APPROVAL_SCOPE_V1,
    start: "2026-10-08T15:00:00.000Z",
    end: "2026-10-08T16:00:00.000Z",
    policyVersion: APPROVAL_POLICY_VERSION_V1,
    ...overrides,
  });
  if (binding === null) {
    throw new Error("fixture");
  }
  return binding;
};

const pendingOf = (overrides: Record<string, unknown> = {}): ApprovalRecord => {
  const created = createPendingApproval(bindingOf(overrides), "2026-10-08T12:10:00.000Z");
  if (created === null) {
    throw new Error("fixture");
  }
  return created;
};

const rowOf = (record: ApprovalRecord, overrides: Record<string, unknown> = {}) => ({
  approval_id: record.id,
  request_id: record.requestId,
  from_agent_id: record.fromAgentId,
  to_agent_id: record.toAgentId,
  skill_version: record.skillVersion,
  purpose: record.purpose,
  scope: record.scope,
  start_at: record.start,
  end_at: record.end,
  policy_version: record.policyVersion,
  status: record.status,
  expires_at: record.expiresAt,
  ...overrides,
});

const retitled = (record: ApprovalRecord, status: ApprovalStatus): ApprovalRecord =>
  withApprovalStatus(record, status);

type Script = Readonly<{
  rows?: readonly unknown[];
  rowCount?: number | null;
  error?: Error;
}>;

const scripted = (
  scripts: Script[],
  options?: { readonly rollbackFails?: boolean; readonly connectFails?: boolean },
) => {
  const queries: string[] = [];
  const params: unknown[][] = [];
  let released = 0;
  let rollbackFails = options?.rollbackFails ?? false;
  const pool: SqlPool = {
    async connect() {
      if (options?.connectFails) {
        throw new Error("connect down");
      }
      return {
        async query(sql: string, queryParams: readonly unknown[] = []) {
          queries.push(sql);
          params.push([...queryParams]);
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
  return { pool, queries, params, released: () => released };
};

const dependency = { code: "APPROVAL_DEPENDENCY_FAILED" } as const;
const conflict = { code: "APPROVAL_CONFLICT" } as const;

describe("PostgreSQL approval store", () => {
  it("matches the reviewed migration and fails closed without a database round trip", async () => {
    const migration = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../../migrations/0002_approvals.sql"),
      "utf8",
    );
    expect(migration.trim()).toBe(APPROVAL_SCHEMA_SQL.trim());
    expect(APPROVAL_SCHEMA_SQL).not.toMatch(/email|secret|profile|kind|availability|interval/i);

    const gate = scripted([]);
    const store = new PostgresApprovalStore(gate.pool);
    const pending = pendingOf();
    const rejected = await store.insertPending({ status: "pending" });
    expect(rejected).toEqual(dependency);
    expect(Object.isFrozen(rejected)).toBe(true);
    expect(await store.insertPending(retitled(pending, "approved"))).toEqual(dependency);
    expect(await store.insertPending(null)).toEqual(dependency);
    expect(await store.replace({ status: "approved" })).toEqual(dependency);
    expect(await store.replace(null)).toEqual(dependency);
    expect(await store.findById(1)).toBeNull();
    expect(await store.findById(null)).toBeNull();
    expect(await store.findByRequestId(1)).toBeNull();
    expect(await store.findByRequestId(null)).toBeNull();
    expect(gate.queries).toEqual([]);
  });

  it("inserts once, replays the same binding, and conflicts when the binding differs", async () => {
    const stored = pendingOf({ requestId: "req-same" });
    const incoming = pendingOf({ requestId: "req-same" });
    expect(incoming.id).not.toBe(stored.id);
    expect(sameApprovalBinding(stored, incoming)).toBe(true);

    const inserted = scripted([{ rows: [] }, { rows: [rowOf(stored)], rowCount: 1 }]);
    const store = new PostgresApprovalStore(inserted.pool);
    const saved = await store.insertPending(stored);
    expect(saved).toEqual(stored);
    expect(Object.isFrozen(saved)).toBe(true);
    expect(inserted.queries).toEqual([
      "BEGIN",
      expect.stringContaining("WHERE approval_id = $1 OR request_id = $2"),
      expect.stringContaining("INSERT INTO approval_records"),
      "COMMIT",
    ]);
    expect(inserted.params[2]).toEqual([
      stored.id,
      stored.requestId,
      stored.fromAgentId,
      stored.toAgentId,
      stored.skillVersion,
      stored.purpose,
      stored.scope,
      stored.start,
      stored.end,
      stored.policyVersion,
      stored.status,
      stored.expiresAt,
    ]);
    expect(inserted.queries[2]).not.toMatch(/email|secret|profile|kind|availability/i);
    expect(inserted.released()).toBe(1);

    const sameBinding = scripted([{ rows: [rowOf(stored)] }]);
    const sameStore = new PostgresApprovalStore(sameBinding.pool);
    expect(await sameStore.insertPending(incoming)).toEqual(stored);
    expect(sameBinding.queries).toEqual(["BEGIN", expect.stringContaining("SELECT"), "COMMIT"]);

    const changed = pendingOf({ requestId: "req-same", end: "2026-10-08T18:00:00.000Z" });
    expect(sameApprovalBinding(stored, changed)).toBe(false);
    const conflicted = scripted([{ rows: [rowOf(stored)] }]);
    const conflictStore = new PostgresApprovalStore(conflicted.pool);
    const conflictedResult = await conflictStore.insertPending(changed);
    expect(conflictedResult).toEqual(conflict);
    expect(Object.isFrozen(conflictedResult)).toBe(true);
    expect(conflicted.queries).toEqual(["BEGIN", expect.stringContaining("SELECT"), "ROLLBACK"]);

    const other = pendingOf({ requestId: "req-other" });
    const occupied = scripted([
      {
        rows: [rowOf(changed), rowOf(other, { approval_id: stored.id })],
      },
    ]);
    const occupiedStore = new PostgresApprovalStore(occupied.pool);
    expect(await occupiedStore.insertPending(stored)).toEqual(dependency);
    expect(occupied.queries.at(-1)).toBe("ROLLBACK");

    const again = scripted([{ rows: [rowOf(stored)] }]);
    const againStore = new PostgresApprovalStore(again.pool);
    expect(await againStore.insertPending(stored)).toEqual(dependency);
    expect(again.queries.at(-1)).toBe("ROLLBACK");
  });

  it("ignores unreadable lock rows and rejects a corrupt or missed insert", async () => {
    const record = pendingOf({ requestId: "req-junk" });
    const junk = scripted([
      {
        rows: ["x", null, [], { approval_id: 12 }, { request_id: "someone-else" }],
      },
      { rows: [rowOf(record)], rowCount: 1 },
    ]);
    const store = new PostgresApprovalStore(junk.pool);
    expect(await store.insertPending(record)).toEqual(record);
    expect(junk.queries.at(-1)).toBe("COMMIT");

    const corrupt = scripted([
      {
        rows: [{ request_id: record.requestId, approval_id: "not-an-id", status: "pending" }],
      },
    ]);
    const corruptStore = new PostgresApprovalStore(corrupt.pool);
    expect(await corruptStore.insertPending(pendingOf({ requestId: record.requestId }))).toEqual(
      dependency,
    );

    const missed = scripted([{ rows: [] }, { rows: [{ status: "pending" }], rowCount: 1 }]);
    const missedStore = new PostgresApprovalStore(missed.pool);
    expect(await missedStore.insertPending(record)).toEqual(dependency);
    expect(missed.queries.at(-1)).toBe("ROLLBACK");

    const nullCount = scripted([{ rows: [] }, { rows: [rowOf(record)], rowCount: null }]);
    const nullCountStore = new PostgresApprovalStore(nullCount.pool);
    expect(await nullCountStore.insertPending(record)).toEqual(dependency);

    const zeroCount = scripted([{ rows: [] }, { rows: [rowOf(record)], rowCount: 0 }]);
    const zeroCountStore = new PostgresApprovalStore(zeroCount.pool);
    expect(await zeroCountStore.insertPending(record)).toEqual(dependency);
    expect(zeroCount.released()).toBe(1);
  });

  it("replaces each legal transition and returns the current row for the same status", async () => {
    const legal = [
      ["pending", "approved"],
      ["pending", "rejected"],
      ["pending", "expired"],
      ["pending", "invalidated"],
      ["approved", "released"],
      ["approved", "expired"],
      ["approved", "invalidated"],
    ] as const satisfies ReadonlyArray<readonly [ApprovalStatus, ApprovalStatus]>;

    for (const [from, to] of legal) {
      const current = retitled(pendingOf({ requestId: `req-${from}-${to}` }), from);
      const next = retitled(current, to);
      const script = scripted([{ rows: [rowOf(current)] }, { rows: [rowOf(next)], rowCount: 1 }]);
      const store = new PostgresApprovalStore(script.pool);
      expect(await store.replace(next)).toEqual(next);
      expect(script.queries).toEqual([
        "BEGIN",
        expect.stringContaining("WHERE approval_id = $1"),
        expect.stringContaining("UPDATE approval_records"),
        "COMMIT",
      ]);
      expect(script.params[2]).toEqual([to, next.id, next.requestId]);
      expect(script.released()).toBe(1);
    }

    for (const status of STATUSES) {
      const current = retitled(pendingOf({ requestId: `req-same-${status}` }), status);
      const script = scripted([{ rows: [rowOf(current)] }]);
      const store = new PostgresApprovalStore(script.pool);
      expect(await store.replace(current)).toEqual(current);
      expect(script.queries).toEqual(["BEGIN", expect.stringContaining("SELECT"), "COMMIT"]);
    }
  });

  it("rejects illegal replaces and changed identity, expiry, or binding", async () => {
    const illegal = [
      ["pending", "released"],
      ["approved", "pending"],
      ["approved", "rejected"],
      ["rejected", "approved"],
      ["expired", "pending"],
      ["released", "invalidated"],
      ["invalidated", "expired"],
    ] as const satisfies ReadonlyArray<readonly [ApprovalStatus, ApprovalStatus]>;

    for (const [from, to] of illegal) {
      const current = retitled(pendingOf({ requestId: `req-no-${from}-${to}` }), from);
      const next = retitled(current, to);
      const script = scripted([{ rows: [rowOf(current)] }]);
      const store = new PostgresApprovalStore(script.pool);
      expect(await store.replace(next)).toEqual(dependency);
      expect(script.queries).toEqual(["BEGIN", expect.stringContaining("SELECT"), "ROLLBACK"]);
    }

    const current = pendingOf({ requestId: "req-guard" });
    const other = pendingOf({ requestId: "req-guard-other" });
    const cases: ReadonlyArray<readonly [ApprovalRecord, unknown[]]> = [
      [Object.freeze({ ...current, requestId: "req-other" }), [rowOf(current)]],
      [current, [rowOf(current, { approval_id: other.id })]],
      [Object.freeze({ ...current, expiresAt: "2026-10-08T12:20:00.000Z" }), [rowOf(current)]],
      [Object.freeze({ ...current, end: "2026-10-08T18:00:00.000Z" }), [rowOf(current)]],
    ];
    for (const [next, rows] of cases) {
      expect(isApproval(next)).toBe(true);
      const script = scripted([{ rows }]);
      const store = new PostgresApprovalStore(script.pool);
      expect(await store.replace(next)).toEqual(dependency);
      expect(script.queries.at(-1)).toBe("ROLLBACK");
    }

    const missing = scripted([{ rows: [] }]);
    expect(await new PostgresApprovalStore(missing.pool).replace(current)).toEqual(dependency);
    const unreadable = scripted([{ rows: [{ approval_id: current.id, status: "pending" }] }]);
    expect(await new PostgresApprovalStore(unreadable.pool).replace(current)).toEqual(dependency);

    const mismatched = scripted([
      { rows: [rowOf(current)] },
      { rows: [rowOf(current)], rowCount: 1 },
    ]);
    const approved = retitled(current, "approved");
    expect(await new PostgresApprovalStore(mismatched.pool).replace(approved)).toEqual(dependency);

    const nullSaved = scripted([
      { rows: [rowOf(current)] },
      { rows: [{ status: "approved" }], rowCount: 1 },
    ]);
    expect(await new PostgresApprovalStore(nullSaved.pool).replace(approved)).toEqual(dependency);

    const nullCount = scripted([
      { rows: [rowOf(current)] },
      { rows: [rowOf(approved)], rowCount: null },
    ]);
    expect(await new PostgresApprovalStore(nullCount.pool).replace(approved)).toEqual(dependency);

    const zeroCount = scripted([
      { rows: [rowOf(current)] },
      { rows: [rowOf(approved)], rowCount: 0 },
    ]);
    expect(await new PostgresApprovalStore(zeroCount.pool).replace(approved)).toEqual(dependency);
    expect(zeroCount.queries.at(-1)).toBe("ROLLBACK");
  });

  it("reads a mapped row, a miss, a corrupt row, and every stored row", async () => {
    const record = pendingOf({ requestId: "req-read" });
    const byId = scripted([{ rows: [rowOf(record)] }]);
    const byIdStore = new PostgresApprovalStore(byId.pool);
    expect(await byIdStore.findById(record.id)).toEqual(record);
    expect(byId.queries[0]).toContain("approval_id = $1");
    expect(byId.queries[0]).not.toContain("FOR UPDATE");
    expect(byId.released()).toBe(1);

    const byRequest = scripted([{ rows: [rowOf(retitled(record, "approved"))] }]);
    const byRequestStore = new PostgresApprovalStore(byRequest.pool);
    expect(await byRequestStore.findByRequestId(record.requestId)).toEqual(
      retitled(record, "approved"),
    );
    expect(byRequest.queries[0]).toContain("request_id = $1");

    const missing = scripted([{ rows: [] }, { rows: [] }]);
    const missingStore = new PostgresApprovalStore(missing.pool);
    expect(await missingStore.findById(record.id)).toBeNull();
    expect(await missingStore.findByRequestId(record.requestId)).toBeNull();

    const corrupt = scripted([
      { rows: [null] },
      { rows: [[]] },
      { rows: [{ approval_id: record.id, status: "pending" }] },
      { rows: [{ request_id: record.requestId, status: "approved" }] },
    ]);
    const corruptStore = new PostgresApprovalStore(corrupt.pool);
    expect(await corruptStore.findById(record.id)).toBeNull();
    expect(await corruptStore.findById(record.id)).toBeNull();
    expect(await corruptStore.findByRequestId(record.requestId)).toBeNull();
    expect(await corruptStore.findByRequestId("req-read")).toBeNull();

    const listed = scripted([{ rows: [rowOf(record), { approval_id: "x" }, null, []] }]);
    const listedStore = new PostgresApprovalStore(listed.pool);
    expect(await listedStore.values()).toEqual([record, { approval_id: "x" }, null, []]);
    expect(listed.queries[0]).toContain("ORDER BY request_id");

    const empty = scripted([{ rows: [] }]);
    expect(await new PostgresApprovalStore(empty.pool).values()).toEqual([]);
    expect(empty.released()).toBe(1);
  });

  it("rolls a thrown write back and hides find failures", async () => {
    const record = pendingOf({ requestId: "req-down" });
    const broken = scripted([{ error: new Error("db down") }], { rollbackFails: true });
    const brokenStore = new PostgresApprovalStore(broken.pool);
    expect(await brokenStore.insertPending(record)).toEqual(dependency);
    expect(broken.queries).toEqual(["BEGIN", expect.stringContaining("SELECT"), "ROLLBACK"]);
    expect(broken.released()).toBe(1);

    const conflictRollback = scripted([{ rows: [rowOf(record)] }], { rollbackFails: true });
    const changed = pendingOf({ requestId: record.requestId, end: "2026-10-08T18:00:00.000Z" });
    const conflictStore = new PostgresApprovalStore(conflictRollback.pool);
    expect(await conflictStore.insertPending(changed)).toEqual(conflict);
    expect(conflictRollback.released()).toBe(1);

    const replaceDown = scripted([{ error: new Error("update down") }]);
    const replaceStore = new PostgresApprovalStore(replaceDown.pool);
    expect(await replaceStore.replace(retitled(record, "approved"))).toEqual(dependency);
    expect(replaceDown.queries.at(-1)).toBe("ROLLBACK");

    const offline = scripted([], { connectFails: true });
    const offlineStore = new PostgresApprovalStore(offline.pool);
    expect(await offlineStore.insertPending(record)).toEqual(dependency);
    expect(await offlineStore.replace(record)).toEqual(dependency);
    expect(await offlineStore.findById(record.id)).toBeNull();
    expect(await offlineStore.findByRequestId(record.requestId)).toBeNull();
    await expect(offlineStore.values()).rejects.toThrow("connect down");
    expect(offline.released()).toBe(0);

    const queryDown = scripted([{ error: new Error("select down") }]);
    const queryStore = new PostgresApprovalStore(queryDown.pool);
    expect(await queryStore.findByRequestId(record.requestId)).toBeNull();
    expect(queryDown.released()).toBe(1);

    const valuesDown = scripted([{ error: new Error("values down") }]);
    const valuesStore = new PostgresApprovalStore(valuesDown.pool);
    await expect(valuesStore.values()).rejects.toThrow("values down");
    expect(valuesDown.released()).toBe(1);

    const schema = scripted([{ rowCount: 0, rows: [] }]);
    await applyApprovalSchema(schema.pool);
    expect(schema.queries[0]).toContain("CREATE TABLE IF NOT EXISTS approval_records");
    expect(schema.released()).toBe(1);
    const schemaDown = scripted([{ error: new Error("ddl down") }]);
    await expect(applyApprovalSchema(schemaDown.pool)).rejects.toThrow("ddl down");
    expect(schemaDown.released()).toBe(1);
  });

  it("wraps node-postgres without opening a connection in the unit test", async () => {
    let ended = false;
    let released = false;
    const wrapped = createPgPool("postgres://pan:pan@127.0.0.1:1/pan", () => ({
      async connect() {
        return {
          async query(_sql: string, params?: readonly unknown[]) {
            return {
              rows: [{ echoed: params?.[0] ?? null }],
              rowCount: null,
              extra: true,
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
    expect(result).toEqual({ rows: [{ echoed: "pan" }], rowCount: null });
    expect(Object.hasOwn(result, "extra")).toBe(false);
    client.release();
    await wrapped.end();
    expect(released).toBe(true);
    expect(ended).toBe(true);

    const real = createPgPool("postgres://pan:pan@127.0.0.1:1/pan");
    await real.end();
  });
});
