import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPendingApproval,
  readApprovalBinding,
  withApprovalStatus,
} from "../../src/modules/approval/domain/approval.js";
import {
  APPROVAL_POLICY_VERSION_V1,
  APPROVAL_PURPOSE_V1,
  APPROVAL_SCOPE_V1,
  APPROVAL_SKILL_VERSION_V1,
  type ApprovalRecord,
  applyApprovalSchema,
  createPgPool,
  isApproval,
  PostgresApprovalStore,
  type SqlPool,
} from "../../src/modules/approval/index.js";

// Skipped when PAN_RELATIONSHIP_DATABASE_URL is missing or empty.
// That skip is the local Docker limitation. This file does not start Docker
// and does not invent a database URL or password.

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const APPROVAL_TABLE_LOCK = 81421002;
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-8222-222222222222";
const CORRUPT_ID = "pan_approval_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const bindingOf = (overrides: Record<string, unknown> = {}) => {
  const binding = readApprovalBinding({
    requestId: "req-durable",
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

const codeOf = (result: unknown): string | null => {
  if (typeof result !== "object" || result === null || !("code" in result)) {
    return null;
  }
  return typeof result.code === "string" ? result.code : null;
};

const totalOf = (rows: readonly unknown[]): number => {
  const first = rows[0];
  if (typeof first !== "object" || first === null || !("total" in first)) {
    throw new Error("count");
  }
  const total = first.total;
  if (typeof total === "number") {
    return total;
  }
  if (typeof total === "string") {
    return Number(total);
  }
  throw new Error("count");
};

describe.skipIf(databaseUrl === "")("durable approval records", () => {
  let pool: SqlPool | undefined;
  let lock: Awaited<ReturnType<SqlPool["connect"]>> | undefined;

  const usePool = (): SqlPool => {
    if (pool === undefined) {
      throw new Error("pool");
    }
    return pool;
  };

  beforeAll(async () => {
    pool = createPgPool(databaseUrl);
    await applyApprovalSchema(pool);
    await applyApprovalSchema(pool);
    lock = await pool.connect();
    await lock.query("SELECT pg_advisory_lock($1)", [APPROVAL_TABLE_LOCK]);
    try {
      await lock.query("TRUNCATE approval_records", []);
    } catch (error) {
      await lock.query("SELECT pg_advisory_unlock($1)", [APPROVAL_TABLE_LOCK]);
      lock.release();
      lock = undefined;
      throw error;
    }
  });

  afterAll(async () => {
    if (lock !== undefined) {
      await lock.query("SELECT pg_advisory_unlock($1)", [APPROVAL_TABLE_LOCK]);
      lock.release();
    }
    if (pool !== undefined) {
      await pool.end();
    }
  });

  it("keeps one approval row across store instances and rejects a second binding", async () => {
    const store = new PostgresApprovalStore(usePool());
    const client = await usePool().connect();
    try {
      const tables = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name LIKE 'approval%'
         ORDER BY table_name`,
        [],
      );
      expect(tables.rows).toEqual([{ table_name: "approval_records" }]);
      const columns = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'approval_records'
         ORDER BY column_name`,
        [],
      );
      expect(columns.rows.map((row) => (row as { column_name: string }).column_name)).toEqual([
        "approval_id",
        "end_at",
        "expires_at",
        "from_agent_id",
        "policy_version",
        "purpose",
        "request_id",
        "scope",
        "skill_version",
        "start_at",
        "status",
        "to_agent_id",
      ]);
      const constraints = await client.query(
        `SELECT conname FROM pg_constraint
         WHERE conrelid = 'approval_records'::regclass
         ORDER BY conname`,
        [],
      );
      expect(constraints.rows.map((row) => (row as { conname: string }).conname)).toEqual([
        "approval_records_pkey",
        "approval_records_request",
        "approval_records_status",
      ]);
      await client.query("BEGIN", []);
      await expect(
        client.query(
          `INSERT INTO approval_records (
             approval_id, request_id, from_agent_id, to_agent_id, skill_version, purpose, scope,
             start_at, end_at, policy_version, status, expires_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'nope', $11)`,
          [
            CORRUPT_ID,
            "req-bad-status",
            FROM,
            TO,
            APPROVAL_SKILL_VERSION_V1,
            APPROVAL_PURPOSE_V1,
            APPROVAL_SCOPE_V1,
            "2026-10-08T15:00:00.000Z",
            "2026-10-08T16:00:00.000Z",
            APPROVAL_POLICY_VERSION_V1,
            "2026-10-08T12:10:00.000Z",
          ],
        ),
      ).rejects.toThrow();
      await client.query("ROLLBACK", []);
    } finally {
      client.release();
    }

    const created = pendingOf({ requestId: "req-durable" });
    expect(await store.insertPending(created)).toEqual(created);
    const restarted = new PostgresApprovalStore(usePool());
    expect(await restarted.findById(created.id)).toEqual(created);
    expect(await restarted.findByRequestId(created.requestId)).toEqual(created);
    expect(await restarted.findById("missing")).toBeNull();
    expect(await restarted.findByRequestId("missing")).toBeNull();
    expect(await restarted.findById(1)).toBeNull();
    expect(await restarted.findByRequestId(null)).toBeNull();

    const sameBinding = pendingOf({ requestId: "req-durable" });
    expect(await restarted.insertPending(sameBinding)).toEqual(created);
    const changed = pendingOf({ requestId: "req-durable", end: "2026-10-08T18:00:00.000Z" });
    expect(await restarted.insertPending(changed)).toEqual({ code: "APPROVAL_CONFLICT" });
    expect(await restarted.findByRequestId("req-durable")).toEqual(created);

    const other = pendingOf({ requestId: "req-other" });
    const duplicateId = Object.freeze({ ...other, id: created.id });
    expect(await restarted.insertPending(duplicateId)).toEqual({
      code: "APPROVAL_DEPENDENCY_FAILED",
    });
    expect(await restarted.findByRequestId("req-other")).toBeNull();

    const approved = withApprovalStatus(created, "approved");
    expect(await restarted.replace(approved)).toEqual(approved);
    expect(await restarted.replace(approved)).toEqual(approved);
    const released = withApprovalStatus(approved, "released");
    expect(await restarted.replace(released)).toEqual(released);
    expect(await restarted.replace(withApprovalStatus(released, "pending"))).toEqual({
      code: "APPROVAL_DEPENDENCY_FAILED",
    });
    expect(await new PostgresApprovalStore(usePool()).findById(created.id)).toEqual(released);

    const transitions = [
      ["pending", "rejected"],
      ["pending", "expired"],
      ["pending", "invalidated"],
      ["approved", "expired"],
      ["approved", "invalidated"],
    ] as const;
    for (const [from, to] of transitions) {
      const requestId = `req-${from}-${to}`;
      const pending = pendingOf({ requestId });
      expect(await restarted.insertPending(pending)).toEqual(pending);
      const current = from === "pending" ? pending : withApprovalStatus(pending, from);
      if (from !== "pending") {
        expect(await restarted.replace(current)).toEqual(current);
      }
      const next = withApprovalStatus(current, to);
      expect(await restarted.replace(next)).toEqual(next);
      expect(await restarted.findByRequestId(requestId)).toEqual(next);
    }

    const writer = await usePool().connect();
    try {
      await writer.query(
        `INSERT INTO approval_records (
           approval_id, request_id, from_agent_id, to_agent_id, skill_version, purpose, scope,
           start_at, end_at, policy_version, status, expires_at
         ) VALUES ($1, $2, 'not-an-agent', $3, $4, $5, $6, $7, $8, $9, 'pending', $10)`,
        [
          CORRUPT_ID,
          "req-corrupt",
          TO,
          APPROVAL_SKILL_VERSION_V1,
          APPROVAL_PURPOSE_V1,
          APPROVAL_SCOPE_V1,
          "2026-10-08T15:00:00.000Z",
          "2026-10-08T16:00:00.000Z",
          APPROVAL_POLICY_VERSION_V1,
          "2026-10-08T12:10:00.000Z",
        ],
      );
    } finally {
      writer.release();
    }
    expect(await restarted.findById(CORRUPT_ID)).toBeNull();
    expect(await restarted.findByRequestId("req-corrupt")).toBeNull();
    expect(await restarted.insertPending(pendingOf({ requestId: "req-corrupt" }))).toEqual({
      code: "APPROVAL_DEPENDENCY_FAILED",
    });
    const corruptReplacement = Object.freeze({
      ...pendingOf({ requestId: "req-corrupt" }),
      id: CORRUPT_ID,
    });
    expect(await restarted.replace(corruptReplacement)).toEqual({
      code: "APPROVAL_DEPENDENCY_FAILED",
    });

    const listed = await restarted.values();
    const counted = await usePool().connect();
    try {
      const count = await counted.query("SELECT COUNT(*)::int AS total FROM approval_records", []);
      expect(listed).toHaveLength(totalOf(count.rows));
    } finally {
      counted.release();
    }
    expect(listed.filter((row) => isApproval(row)).length).toBe(listed.length - 1);
    expect(
      listed.some((row) => !isApproval(row) && JSON.stringify(row).includes("req-corrupt")),
    ).toBe(true);

    const sameA = pendingOf({ requestId: "req-race-same" });
    const sameB = pendingOf({ requestId: "req-race-same" });
    const sameResults = await Promise.all([
      restarted.insertPending(sameA),
      restarted.insertPending(sameB),
    ]);
    const sameStored = await restarted.findByRequestId("req-race-same");
    expect(isApproval(sameStored)).toBe(true);
    if (!isApproval(sameStored)) {
      throw new Error("fixture");
    }
    let sameMatches = 0;
    for (const result of sameResults) {
      if (isApproval(result)) {
        expect(result).toEqual(sameStored);
        sameMatches += 1;
      } else {
        expect(codeOf(result)).toBe("APPROVAL_DEPENDENCY_FAILED");
      }
    }
    expect(sameMatches).toBeGreaterThan(0);

    const left = pendingOf({ requestId: "req-race-diff", end: "2026-10-08T16:00:00.000Z" });
    const right = pendingOf({ requestId: "req-race-diff", end: "2026-10-08T18:00:00.000Z" });
    const diffResults = await Promise.all([
      restarted.insertPending(left),
      restarted.insertPending(right),
    ]);
    const diffStored = await restarted.findByRequestId("req-race-diff");
    if (!isApproval(diffStored)) {
      throw new Error("fixture");
    }
    expect([left, right].filter((candidate) => candidate.id === diffStored.id)).toHaveLength(1);
    for (const result of diffResults) {
      if (isApproval(result)) {
        expect(result).toEqual(diffStored);
      } else {
        expect(["APPROVAL_CONFLICT", "APPROVAL_DEPENDENCY_FAILED"]).toContain(codeOf(result));
      }
    }

    const raceCount = await usePool().connect();
    try {
      const count = await raceCount.query(
        `SELECT request_id, COUNT(*)::int AS total
         FROM approval_records
         WHERE request_id IN ($1, $2)
         GROUP BY request_id`,
        ["req-race-same", "req-race-diff"],
      );
      expect(count.rows).toHaveLength(2);
      for (const row of count.rows) {
        expect(totalOf([row])).toBe(1);
      }
    } finally {
      raceCount.release();
    }
  });
});
