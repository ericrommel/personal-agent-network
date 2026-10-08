import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyAuditSchema,
  AUDIT_SCHEMA_SQL,
  createPgPool,
  PostgresAuditLog,
  type SqlPool,
  type TrustedAuditOperator,
} from "../../../../src/modules/audit/index.js";

const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const INVALID = { ok: false, error: { code: "AUDIT_COMMAND_INVALID" } } as const;
const AUDIT_ID = "pan_audit_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const operator = (key = "local-owner"): TrustedAuditOperator =>
  ({ kind: "trusted-audit-operator", key }) as TrustedAuditOperator;

const command = (requestId = "req-1") => ({
  kind: "audit-event",
  category: "decision",
  requestId,
  outcome: "deny",
});

const clockAt = (nowMs: number) => ({ nowMs: () => nowMs });

const rowOf = (recordedAt: string, requestId = "req-1") => ({
  audit_id: AUDIT_ID,
  recorded_at: recordedAt,
  category: "decision",
  request_id: requestId,
  outcome: "deny",
});

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

describe("PostgreSQL audit log", () => {
  it("appends a minimized event and deletes strictly older rows", async () => {
    const recordedAt = new Date(NOW).toISOString();
    const pool = scripted([
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [rowOf(recordedAt)] },
    ]);
    const log = new PostgresAuditLog(pool.pool, clockAt(NOW));
    const saved = await log.append(operator(), command());
    expect(saved.ok).toBe(true);
    if (!saved.ok) {
      throw new Error("fixture");
    }
    expect(saved.value).toEqual({
      kind: "audit-event",
      id: AUDIT_ID,
      recordedAt,
      category: "decision",
      requestId: "req-1",
      outcome: "deny",
    });
    expect(pool.queries[1]).toBe("DELETE FROM audit_records WHERE recorded_at < $1");
    expect(pool.params[1]).toEqual([new Date(NOW - RETENTION_MS).toISOString()]);
    expect(pool.queries[2]).toContain("INSERT INTO audit_records");
    expect(pool.queries).toEqual(["BEGIN", pool.queries[1], pool.queries[2], "COMMIT"]);
    expect(pool.released()).toBe(1);
  });

  it("keeps a row recorded at the retention cutoff and fails a corrupt read", async () => {
    const cutoff = new Date(NOW - RETENTION_MS).toISOString();
    const kept = scripted([{ rowCount: 0, rows: [] }, { rows: [rowOf(cutoff, "boundary")] }]);
    const log = new PostgresAuditLog(kept.pool, clockAt(NOW));
    const read = await log.read(operator());
    expect(read.ok).toBe(true);
    if (!read.ok) {
      throw new Error("fixture");
    }
    expect(read.value.map((event) => event.requestId)).toEqual(["boundary"]);
    expect(Object.isFrozen(read.value)).toBe(true);
    expect(kept.queries[2]).toContain("ORDER BY recorded_at, audit_id");

    const corrupt = scripted([
      { rowCount: 0, rows: [] },
      { rows: [rowOf(cutoff), { audit_id: "not-an-id" }] },
    ]);
    expect(await new PostgresAuditLog(corrupt.pool, clockAt(NOW)).read(operator())).toEqual(
      INVALID,
    );
    expect(corrupt.queries.at(-1)).toBe("COMMIT");
  });

  it("rejects untrusted callers, extra fields, and a bad clock before querying", async () => {
    const pool = scripted([]);
    const log = new PostgresAuditLog(pool.pool, clockAt(NOW));
    expect(await log.append(operator("bad key"), command())).toEqual(INVALID);
    expect(await log.read({ kind: "trusted-audit-operator" } as TrustedAuditOperator)).toEqual(
      INVALID,
    );
    expect(await log.deleteAll(null as unknown as TrustedAuditOperator)).toEqual(INVALID);
    expect(await log.deleteExpired(operator("owner@node"))).toEqual(INVALID);
    const extra = command();
    Object.defineProperty(extra, "result", { value: false, enumerable: false });
    expect(await log.append(operator(), extra)).toEqual(INVALID);
    expect(await log.append(operator(), { ...command(), outcome: "ALLOW" })).toEqual(INVALID);
    expect(await log.append(operator(), null)).toEqual(INVALID);
    expect(
      await new PostgresAuditLog(pool.pool, { nowMs: () => Number.NaN }).append(
        operator(),
        command(),
      ),
    ).toEqual(INVALID);
    expect(
      await new PostgresAuditLog(pool.pool, { nowMs: () => Number.MAX_VALUE }).read(operator()),
    ).toEqual(INVALID);
    expect(
      await new PostgresAuditLog(pool.pool, {
        nowMs: () => {
          throw new Error("clock down");
        },
      }).deleteExpired(operator()),
    ).toEqual(INVALID);
    expect(pool.queries).toEqual([]);
  });

  it("accepts a null-prototype command and fails closed when the driver throws", async () => {
    const recordedAt = new Date(NOW).toISOString();
    const pool = scripted([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [rowOf(recordedAt, "null-proto")] },
    ]);
    const log = new PostgresAuditLog(pool.pool, clockAt(NOW));
    const nullPrototype = Object.assign(Object.create(null), command("null-proto"));
    const saved = await log.append(operator(), nullPrototype);
    expect(saved.ok).toBe(true);

    const missed = scripted([
      { rowCount: 0, rows: [] },
      { rowCount: 0, rows: [] },
    ]);
    expect(
      await new PostgresAuditLog(missed.pool, clockAt(NOW)).append(operator(), command()),
    ).toEqual(INVALID);
    expect(missed.queries).toContain("ROLLBACK");

    const nullCount = scripted([
      { rowCount: 0, rows: [] },
      { rowCount: null, rows: [rowOf(recordedAt)] },
    ]);
    expect(
      await new PostgresAuditLog(nullCount.pool, clockAt(NOW)).append(operator(), command()),
    ).toEqual(INVALID);

    const unreadable = scripted([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [null] },
    ]);
    expect(
      await new PostgresAuditLog(unreadable.pool, clockAt(NOW)).append(operator(), command()),
    ).toEqual(INVALID);

    const thrown = scripted([{ error: new Error("insert down") }]);
    expect(
      await new PostgresAuditLog(thrown.pool, clockAt(NOW)).append(operator(), command()),
    ).toEqual(INVALID);
    expect(thrown.released()).toBe(1);

    const rollback = scripted([{ error: new Error("insert down") }], { rollbackFails: true });
    expect(await new PostgresAuditLog(rollback.pool, clockAt(NOW)).read(operator())).toEqual(
      INVALID,
    );

    const offline = scripted([], { connectFails: true });
    const offlineLog = new PostgresAuditLog(offline.pool, clockAt(NOW));
    expect(await offlineLog.append(operator(), command())).toEqual(INVALID);
    expect(await offlineLog.read(operator())).toEqual(INVALID);
    expect(await offlineLog.deleteAll(operator())).toEqual(INVALID);
    expect(await offlineLog.deleteExpired(operator())).toEqual(INVALID);
  });

  it("deletes every row or only expired rows for a trusted operator", async () => {
    const all = scripted([{ rowCount: 2, rows: [] }]);
    const log = new PostgresAuditLog(all.pool, clockAt(NOW));
    expect(await log.deleteAll(operator())).toEqual({ ok: true, value: true });
    expect(all.queries[1]).toBe("DELETE FROM audit_records");

    const expired = scripted([{ rowCount: 1, rows: [] }]);
    expect(
      await new PostgresAuditLog(expired.pool, clockAt(NOW)).deleteExpired(operator()),
    ).toEqual({
      ok: true,
      value: true,
    });
    expect(expired.params[1]).toEqual([new Date(NOW - RETENTION_MS).toISOString()]);

    const exploded = new Proxy(command(), {
      ownKeys() {
        throw new Error("keys");
      },
    });
    expect(await log.append(operator(), exploded)).toEqual(INVALID);
    const unreadableCommand = new Proxy(command(), {
      get() {
        throw new Error("unreadable command");
      },
    });
    expect(await log.append(operator(), unreadableCommand)).toEqual(INVALID);
    const unreadableOperator = new Proxy(operator(), {
      get() {
        throw new Error("unreadable operator");
      },
    });
    expect(await log.append(unreadableOperator, command())).toEqual(INVALID);
    const inherited = Object.create({
      kind: "audit-event",
      category: "decision",
      requestId: "req-1",
      outcome: "deny",
    }) as unknown;
    expect(await log.append(operator(), inherited)).toEqual(INVALID);
    const accessor = command();
    Object.defineProperty(accessor, "outcome", { enumerable: true, get: () => "deny" });
    expect(await log.append(operator(), accessor)).toEqual(INVALID);
  });

  it("matches the migration and wraps a pool without opening a real connection", async () => {
    const migration = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../../migrations/0003_audit.sql"),
      "utf8",
    );
    expect(AUDIT_SCHEMA_SQL.trim()).toBe(migration.trim());

    const schema = scripted([{ rowCount: 0, rows: [] }]);
    await applyAuditSchema(schema.pool);
    expect(schema.queries[0]).toContain("CREATE TABLE IF NOT EXISTS audit_records");
    expect(schema.released()).toBe(1);
    const schemaDown = scripted([{ error: new Error("ddl down") }]);
    await expect(applyAuditSchema(schemaDown.pool)).rejects.toThrow("ddl down");
    expect(schemaDown.released()).toBe(1);

    let ended = false;
    let released = false;
    const wrapped = createPgPool("postgres://pan:pan@127.0.0.1:1/pan", () => ({
      async connect() {
        return {
          async query(_sql: string, params?: readonly unknown[]) {
            return { rows: [{ echoed: params?.[0] ?? null }], rowCount: null, extra: true };
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
