import { afterAll, describe, expect, it } from "vitest";
import {
  createPgPool,
  PostgresAuditLog,
  type SqlPool,
  type TrustedAuditOperator,
} from "../../src/modules/audit/index.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const enabled = process.env.PAN_RESTART_PROBE === "1" && databaseUrl !== "";
const REQUEST_ID = "req-audit-restart";
const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const operator = { kind: "trusted-audit-operator", key: "local-owner" } as TrustedAuditOperator;

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

describe.skipIf(!enabled)("fresh process reads the minimized audit row", () => {
  let pool: SqlPool | undefined;

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end();
    }
  });

  it("reads the denied audit row after restart", async () => {
    try {
      pool = createPgPool(databaseUrl);
      const read = await new PostgresAuditLog(pool, { nowMs: () => NOW }).read(operator);
      expect(read.ok).toBe(true);
      if (!read.ok) {
        throw new Error("fixture");
      }
      expect(read.value).toHaveLength(1);
      const event = read.value[0];
      expect(event).toEqual({
        kind: "audit-event",
        id: event?.id,
        recordedAt: new Date(NOW).toISOString(),
        category: "decision",
        requestId: REQUEST_ID,
        outcome: "deny",
      });
      expect(event?.id).toMatch(/^pan_audit_/);
      expect(Object.keys(event ?? {}).sort()).toEqual([
        "category",
        "id",
        "kind",
        "outcome",
        "recordedAt",
        "requestId",
      ]);
      const text = JSON.stringify(event);
      expect(text).not.toContain("availability_boolean");
      expect(text).not.toContain("T12:01");
      expect(text).not.toContain("ALLOW");
      expect(event).not.toHaveProperty("result");
    } catch (error) {
      const message = error instanceof Error ? error.message : "probe failed";
      throw new Error(redact(message));
    }
  });
});
