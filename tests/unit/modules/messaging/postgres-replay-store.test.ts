import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_ENVELOPE_CONTRACT_V1,
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_REQUEST_CONTRACT_V1,
  AVAILABILITY_SCOPE_V1,
  acceptRemoteEnvelope,
  applyReplaySchema,
  createPgPool,
  PostgresReplayStore,
  REPLAY_SCHEMA_SQL,
  type SqlPool,
} from "../../../../src/modules/messaging/index.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const SAN = `urn:pan:agent:${FROM}`;

type Step =
  | { readonly op: "result"; readonly rows?: readonly unknown[]; readonly rowCount?: number | null }
  | { readonly op: "throw"; readonly error: unknown }
  | { readonly op: "connect"; readonly error: unknown };

const scripted = (steps: Step[], options?: { readonly rollbackFails?: boolean }) => {
  const queries: string[] = [];
  let released = 0;
  let connects = 0;
  let rollbackFails = options?.rollbackFails ?? false;
  const pool: SqlPool = {
    async connect() {
      connects += 1;
      const pending = steps[0];
      if (pending?.op === "connect") {
        steps.shift();
        throw pending.error;
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
          const step = steps.shift();
          if (step === undefined || step.op === "connect") {
            throw new Error(`unexpected ${sql}`);
          }
          if (step.op === "throw") {
            throw step.error;
          }
          return {
            rows: step.rows ?? [],
            rowCount: step.rowCount === undefined ? (step.rows?.length ?? 0) : step.rowCount,
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
  return { pool, queries, released: () => released, connects: () => connects };
};

const coded = (code: string, message = "duplicate key"): Error => {
  const error = new Error(message);
  (error as Error & { code: string }).code = code;
  return error;
};

const saved = (messageId: string) =>
  ({ op: "result", rows: [{ message_id: messageId }], rowCount: 1 }) as const;

const envelope = (messageId = "msg-1", requestId = "req-1") => ({
  contract: AVAILABILITY_ENVELOPE_CONTRACT_V1,
  messageId,
  issuedAt: "2026-10-08T12:00:00.000Z",
  expiresAt: "2026-10-08T12:05:00.000Z",
  recipientAgentId: TO,
  body: {
    contract: AVAILABILITY_REQUEST_CONTRACT_V1,
    requestId,
    targetAgentId: TO,
    purpose: AVAILABILITY_PURPOSE_V1,
    scope: AVAILABILITY_SCOPE_V1,
    start: "2026-10-08T12:01:00.000Z",
    end: "2026-10-08T13:00:00.000Z",
  },
});

describe("PostgreSQL replay store", () => {
  it("remembers one message id and denies the duplicate at the gate", async () => {
    const pool = scripted([saved("msg-1"), { op: "throw", error: coded("23505") }, saved("msg-2")]);
    const store = new PostgresReplayStore(pool.pool);
    const accepted = await acceptRemoteEnvelope(envelope(), SAN, TO, NOW, store);
    expect(accepted?.principal.authenticatedAt).toBe("2026-10-08T12:00:00.000Z");
    expect(accepted?.body.requestId).toBe("req-1");
    expect(
      await acceptRemoteEnvelope(envelope("msg-1", "req-other"), SAN, TO, NOW, store),
    ).toBeNull();
    const again = await acceptRemoteEnvelope(envelope("msg-2"), SAN, TO, NOW, store);
    expect(again?.body.requestId).toBe("req-1");
    expect(pool.queries.filter((sql) => sql.startsWith("INSERT"))).toHaveLength(3);
  });

  it("does not insert an unusable id", async () => {
    const pool = scripted([]);
    const store = new PostgresReplayStore(pool.pool);
    expect(await store.remember("")).toBe("duplicate");
    expect(await store.remember("bad id")).toBe("duplicate");
    expect(await store.remember("a".repeat(129))).toBe("duplicate");
    expect(await store.remember(1 as unknown as string)).toBe("duplicate");
    expect(pool.connects()).toBe(0);
  });

  it("accepts a maximum-length token and fails closed when the insert is not that id", async () => {
    const messageId = "a".repeat(128);
    const accepted = scripted([saved(messageId)]);
    expect(await new PostgresReplayStore(accepted.pool).remember(messageId)).toBe("accepted");
    expect(accepted.queries).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO replay_message_records"),
      "COMMIT",
    ]);

    const cases: Step[] = [
      { op: "result", rows: [], rowCount: 1 },
      { op: "result", rows: [null], rowCount: 1 },
      { op: "result", rows: [[]], rowCount: 1 },
      { op: "result", rows: [1], rowCount: 1 },
      { op: "result", rows: [{ message_id: 1 }], rowCount: 1 },
      { op: "result", rows: [{ message_id: "other" }], rowCount: 1 },
      { op: "result", rows: [{ message_id: "msg-1" }], rowCount: 0 },
      { op: "result", rows: [{ message_id: "msg-1" }], rowCount: null },
    ];
    for (const step of cases) {
      const pool = scripted([step]);
      await expect(new PostgresReplayStore(pool.pool).remember("msg-1")).rejects.toThrow(
        "replay insert missed",
      );
      expect(pool.queries).toContain("ROLLBACK");
      expect(pool.released()).toBe(1);
    }
  });

  it("returns duplicate on a unique violation and rethrows every other failure", async () => {
    const raced = scripted([{ op: "throw", error: coded("23505") }], { rollbackFails: true });
    expect(await new PostgresReplayStore(raced.pool).remember("msg-1")).toBe("duplicate");
    expect(raced.queries).toContain("ROLLBACK");

    const denied = scripted([{ op: "throw", error: coded("42501", "permission") }]);
    await expect(new PostgresReplayStore(denied.pool).remember("msg-1")).rejects.toThrow(
      "permission",
    );
    const text = scripted([{ op: "throw", error: "down" }]);
    await expect(new PostgresReplayStore(text.pool).remember("msg-1")).rejects.toBe("down");
    const empty = scripted([{ op: "throw", error: null }]);
    await expect(new PostgresReplayStore(empty.pool).remember("msg-1")).rejects.toBeNull();
    const offline = scripted([{ op: "connect", error: new Error("connect down") }]);
    await expect(new PostgresReplayStore(offline.pool).remember("msg-1")).rejects.toThrow(
      "connect down",
    );
    expect(offline.released()).toBe(0);

    const missed = scripted([{ op: "result", rows: [], rowCount: 0 }], { rollbackFails: true });
    await expect(new PostgresReplayStore(missed.pool).remember("msg-1")).rejects.toThrow(
      "replay insert missed",
    );
  });

  it("retries only the schema row-type race and matches the migration", async () => {
    const migration = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../../migrations/0006_replay_messages.sql",
      ),
      "utf8",
    );
    expect(REPLAY_SCHEMA_SQL.trim()).toBe(migration.trim());

    const created = scripted([{ op: "result", rowCount: 0, rows: [] }]);
    await applyReplaySchema(created.pool);
    expect(created.queries[0]).toContain("CREATE TABLE IF NOT EXISTS replay_message_records");
    expect(created.released()).toBe(1);

    const raced = scripted([
      { op: "throw", error: coded("23505") },
      { op: "throw", error: { message: "duplicate pg_type_typname_nsp_index" } },
      { op: "result", rowCount: 0, rows: [] },
    ]);
    await applyReplaySchema(raced.pool);
    expect(raced.released()).toBe(3);

    const connected = scripted([
      { op: "connect", error: { code: "23505" } },
      { op: "result", rowCount: 0, rows: [] },
    ]);
    await applyReplaySchema(connected.pool);
    expect(connected.released()).toBe(1);
    expect(connected.connects()).toBe(2);

    await expect(
      applyReplaySchema(scripted([{ op: "throw", error: new Error("ddl down") }]).pool),
    ).rejects.toThrow("ddl down");
    await expect(applyReplaySchema(scripted([{ op: "throw", error: "nope" }]).pool)).rejects.toBe(
      "nope",
    );
    await expect(
      applyReplaySchema(scripted([{ op: "throw", error: null }]).pool),
    ).rejects.toBeNull();
    await expect(
      applyReplaySchema(scripted([{ op: "throw", error: { message: 4 } }]).pool),
    ).rejects.toEqual({ message: 4 });
    await expect(
      applyReplaySchema(scripted([{ op: "throw", error: { message: "other" } }]).pool),
    ).rejects.toEqual({ message: "other" });

    const exhausted = scripted(
      Array.from({ length: 5 }, () => ({ op: "throw", error: coded("23505") }) as const),
    );
    await expect(applyReplaySchema(exhausted.pool)).rejects.toThrow("duplicate key");
    expect(exhausted.connects()).toBe(5);

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
