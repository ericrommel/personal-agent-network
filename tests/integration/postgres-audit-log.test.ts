import { afterAll, describe, expect, it } from "vitest";
import {
  applyAuditSchema,
  createPgPool,
  PostgresAuditLog,
  type SqlPool,
  type TrustedAuditOperator,
} from "../../src/modules/audit/index.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const operator = { kind: "trusted-audit-operator", key: "local-owner" } as TrustedAuditOperator;
const command = (requestId: string) => ({
  kind: "audit-event",
  category: "disclosure",
  requestId,
  outcome: "released",
});

describe.skipIf(databaseUrl === "")("durable minimized audit log", () => {
  let pool: SqlPool | undefined;

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end();
    }
  });

  it("keeps a row at the cutoff for a second log and deletes the rest", async () => {
    pool = createPgPool(databaseUrl);
    await applyAuditSchema(pool);
    const client = await pool.connect();
    await client.query("TRUNCATE audit_records", []);
    client.release();

    const clock = { nowMs: () => NOW - RETENTION_MS };
    const first = new PostgresAuditLog(pool, clock);
    const saved = await first.append(operator, command("boundary"));
    expect(saved.ok).toBe(true);
    if (!saved.ok) {
      throw new Error("fixture");
    }

    const later = new PostgresAuditLog(pool, { nowMs: () => NOW });
    const read = await later.read(operator);
    expect(read.ok).toBe(true);
    if (!read.ok) {
      throw new Error("fixture");
    }
    expect(read.value).toEqual([saved.value]);

    const fresh = await later.append(operator, command("fresh"));
    expect(fresh.ok).toBe(true);
    const afterAppend = await later.read(operator);
    expect(afterAppend.ok).toBe(true);
    if (!afterAppend.ok || !fresh.ok) {
      throw new Error("fixture");
    }
    expect(afterAppend.value).toEqual([saved.value, fresh.value]);

    const justAfter = new PostgresAuditLog(pool, { nowMs: () => NOW + 1 });
    const dropped = await justAfter.read(operator);
    expect(dropped.ok).toBe(true);
    if (!dropped.ok) {
      throw new Error("fixture");
    }
    expect(dropped.value).toEqual([fresh.value]);

    expect(await justAfter.deleteAll(operator)).toEqual({ ok: true, value: true });
    const empty = await new PostgresAuditLog(pool, { nowMs: () => NOW }).read(operator);
    expect(empty).toEqual({ ok: true, value: [] });
  });
});
