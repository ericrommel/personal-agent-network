import { afterAll, describe, expect, it } from "vitest";
import type { AvailabilityInterval } from "../../src/modules/context/index.js";
import { createAgentIdentity, type AgentIdentity } from "../../src/modules/identity/index.js";
import { AVAILABILITY_REQUEST_CONTRACT_V1 } from "../../src/modules/messaging/index.js";
import {
  createPgPool,
  PostgresRelationshipStore,
  RelationshipService,
  type SqlPool,
} from "../../src/modules/relationships/index.js";
import { LocalAvailabilityNode } from "../../src/runtime/local-availability-node.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const enabled = process.env.PAN_RESTART_PROBE === "1" && databaseUrl !== "";
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const ORIGIN = Date.parse("2026-10-08T12:00:00.000Z");
const START = new Date(ORIGIN + 60_000).toISOString();
const END = new Date(ORIGIN + 60_000 + 3_600_000).toISOString();

const agent = (id: string): AgentIdentity => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

describe.skipIf(!enabled)("fresh process loads the revoked relationship", () => {
  let pool: SqlPool | undefined;

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end();
    }
  });

  it("denies because the revoked row is present", async () => {
    try {
      pool = createPgPool(databaseUrl);
      const client = await pool.connect();
      const found = await client.query(
        "SELECT status FROM relationship_records WHERE pair_key = $1",
        [`${FROM}>${TO}`],
      );
      client.release();
      expect(found.rows).toEqual([{ status: "revoked" }]);

      const agents = [agent(FROM), agent(TO)];
      const parties = {
        async findAgent(id: unknown) {
          return agents.find((item) => item.id === id) ?? null;
        },
      };
      const events = { record(): void {} };
      const store = new PostgresRelationshipStore(pool, events);
      const active = await new RelationshipService({ parties, events, store }).readActive(FROM, TO);
      expect(active).toBe(false);

      let reads = 0;
      const context = {
        get busyIntervals(): readonly AvailabilityInterval[] {
          reads += 1;
          return [];
        },
      };
      const node = new LocalAvailabilityNode({
        clock: {
          now: () => new Date(ORIGIN).toISOString(),
          nowMs: () => ORIGIN,
        },
        agents,
        context,
        relationshipStore: store,
      });
      expect(
        await node.handle(
          {
            schema: "pan.authenticated-agent-principal/v1",
            kind: "authenticated-agent",
            agentId: FROM,
            authenticatedAt: new Date(ORIGIN).toISOString(),
          },
          {
            contract: AVAILABILITY_REQUEST_CONTRACT_V1,
            requestId: "req-restart",
            targetAgentId: TO,
            purpose: "availability_check",
            scope: "availability_boolean",
            start: START,
            end: END,
          },
        ),
      ).toEqual({ outcome: "unavailable" });
      expect(reads).toBe(0);
      expect(agents.map((item) => item.id)).toEqual([FROM, TO]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "probe failed";
      throw new Error(redact(message));
    }
  });
});
