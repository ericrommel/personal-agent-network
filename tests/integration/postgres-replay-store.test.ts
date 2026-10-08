import { afterAll, describe, expect, it } from "vitest";
import {
  AVAILABILITY_ENVELOPE_CONTRACT_V1,
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_REQUEST_CONTRACT_V1,
  AVAILABILITY_SCOPE_V1,
  acceptRemoteEnvelope,
  applyReplaySchema,
  createPgPool,
  PostgresReplayStore,
  type SqlPool,
} from "../../src/modules/messaging/index.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const REPLAY_TABLE_LOCK = 81421006;
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const SAN = `urn:pan:agent:${FROM}`;

const envelope = (messageId: string) => ({
  contract: AVAILABILITY_ENVELOPE_CONTRACT_V1,
  messageId,
  issuedAt: "2026-10-08T12:00:00.000Z",
  expiresAt: "2026-10-08T12:05:00.000Z",
  recipientAgentId: TO,
  body: {
    contract: AVAILABILITY_REQUEST_CONTRACT_V1,
    requestId: "req-1",
    targetAgentId: TO,
    purpose: AVAILABILITY_PURPOSE_V1,
    scope: AVAILABILITY_SCOPE_V1,
    start: "2026-10-08T12:01:00.000Z",
    end: "2026-10-08T13:00:00.000Z",
  },
});

describe.skipIf(databaseUrl === "")("durable replay message ids", () => {
  let pool: SqlPool | undefined;

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end();
    }
  });

  it("keeps one message id across store instances and stores nothing else", async () => {
    pool = createPgPool(databaseUrl);
    await applyReplaySchema(pool);
    const lock = await pool.connect();
    await lock.query("SELECT pg_advisory_lock($1)", [REPLAY_TABLE_LOCK]);
    try {
      await lock.query("TRUNCATE replay_message_records", []);
      const first = new PostgresReplayStore(pool);
      const accepted = await acceptRemoteEnvelope(envelope("msg-1"), SAN, TO, NOW, first);
      expect(accepted?.body.requestId).toBe("req-1");
      expect(await first.remember("bad id")).toBe("duplicate");

      const restarted = new PostgresReplayStore(pool);
      expect(await acceptRemoteEnvelope(envelope("msg-1"), SAN, TO, NOW, restarted)).toBeNull();
      const fresh = await acceptRemoteEnvelope(envelope("msg-2"), SAN, TO, NOW, restarted);
      expect(fresh?.body.requestId).toBe("req-1");

      const columns = await lock.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'replay_message_records'
         ORDER BY column_name`,
        [],
      );
      expect(columns.rows).toEqual([{ column_name: "message_id" }]);
      const stored = await lock.query(
        "SELECT message_id FROM replay_message_records ORDER BY message_id",
        [],
      );
      expect(stored.rows).toEqual([{ message_id: "msg-1" }, { message_id: "msg-2" }]);
    } finally {
      await lock.query("SELECT pg_advisory_unlock($1)", [REPLAY_TABLE_LOCK]);
      lock.release();
    }
  });
});
