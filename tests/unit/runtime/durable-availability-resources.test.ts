import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SqlPool as ApprovalSqlPool } from "../../../src/modules/approval/index.js";
import type { SqlPool as AuditSqlPool } from "../../../src/modules/audit/index.js";
import { createAgentIdentity } from "../../../src/modules/identity/index.js";
import {
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_REQUEST_CONTRACT_V1,
  AVAILABILITY_SCOPE_V1,
  type SqlPool as ReplaySqlPool,
} from "../../../src/modules/messaging/index.js";
import type { SqlPool as PermissionSqlPool } from "../../../src/modules/permissions/index.js";
import type { SqlPool as RelationshipSqlPool } from "../../../src/modules/relationships/index.js";
import {
  RELATIONSHIP_COMMAND_CONTRACT_V1,
  type TrustedRelationshipSource,
} from "../../../src/modules/relationships/index.js";
import type { SqlPool as AdvertisementSqlPool } from "../../../src/modules/skills/index.js";
import {
  type DurablePoolOpeners,
  openDurableAvailabilityResources,
} from "../../../src/runtime/durable-availability-resources.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const ORIGIN = Date.parse("2026-10-08T12:00:00.000Z");

const agent = (id: string) => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const options = {
  clock: {
    now: () => new Date(ORIGIN).toISOString(),
    nowMs: () => ORIGIN,
  },
  agents: [agent(FROM), agent(TO)],
  localAgentId: TO,
};

type FakePool = RelationshipSqlPool &
  ApprovalSqlPool &
  PermissionSqlPool &
  AdvertisementSqlPool &
  AuditSqlPool &
  ReplaySqlPool & { ends: number; failEnd: boolean; failQuery: boolean };

const fakePool = (): FakePool => {
  const pool = {
    ends: 0,
    failEnd: false,
    failQuery: false,
    async connect() {
      return {
        query: async () => {
          if (pool.failQuery) {
            throw new Error("schema down");
          }
          return { rows: [], rowCount: 1 };
        },
        release() {
          return undefined;
        },
      };
    },
    async end() {
      pool.ends += 1;
      if (pool.failEnd) {
        throw new Error("end down");
      }
    },
  };
  return pool;
};

const openersFrom = (pools: FakePool[]): DurablePoolOpeners => {
  let index = 0;
  const next = (): FakePool => {
    const pool = pools[index];
    index += 1;
    if (pool === undefined) {
      throw new Error("opener down");
    }
    return pool;
  };
  return {
    relationships: next,
    approvals: next,
    permissions: next,
    advertisements: next,
    audit: next,
    replay: next,
  };
};

describe("durable availability resources", () => {
  it("wires injected pools and does not listen from main or the CLI", async () => {
    const pools = Array.from({ length: 6 }, () => fakePool());
    const resources = await openDurableAvailabilityResources(
      "postgres://example",
      options,
      openersFrom(pools),
    );
    expect(resources.dependencies.localAgentId).toBe(TO);
    expect(resources.dependencies.nowMs()).toBe(ORIGIN);
    expect(resources.dependencies.store).toBe(resources.replay);
    expect(resources.dependencies.audit).toBe(resources.audit);
    const from = agent(FROM);
    const to = agent(TO);
    expect(
      await resources.dependencies.handle(
        {
          schema: "pan.authenticated-agent-principal/v1",
          kind: "authenticated-agent",
          agentId: from.id,
          authenticatedAt: new Date(ORIGIN).toISOString(),
        },
        {
          contract: AVAILABILITY_REQUEST_CONTRACT_V1,
          requestId: "req-1",
          targetAgentId: to.id,
          purpose: AVAILABILITY_PURPOSE_V1,
          scope: AVAILABILITY_SCOPE_V1,
          start: new Date(ORIGIN + 60_000).toISOString(),
          end: new Date(ORIGIN + 3_660_000).toISOString(),
        },
      ),
    ).toEqual({ outcome: "unavailable" });
    const relationshipSource = {
      kind: "trusted-relationship-source",
      key: "local-owner",
    } as TrustedRelationshipSource;
    expect(
      (
        await resources.node.relationships.create(relationshipSource, {
          contract: RELATIONSHIP_COMMAND_CONTRACT_V1,
          action: "create",
          correlationId: "corr-unit",
          fromAgentId: FROM,
          toAgentId: TO,
        })
      ).ok,
    ).toBe(true);
    await resources.close();
    const contextualPools = Array.from({ length: 6 }, () => fakePool());
    const contextual = await openDurableAvailabilityResources(
      "postgres://example",
      { ...options, context: { busyIntervals: [] } },
      openersFrom(contextualPools),
    );
    await contextual.close();
    expect(pools.every((pool) => pool.ends === 1)).toBe(true);
    expect(contextualPools.every((pool) => pool.ends === 1)).toBe(true);
    expect(readFileSync("src/main.ts", "utf8")).not.toContain("durable-availability-resources");
    expect(readFileSync("src/runtime/availability-cli.ts", "utf8")).not.toContain(
      "durable-availability-resources",
    );
  });

  it("rejects a blank URL or agent id before opening a pool", async () => {
    const pools = [fakePool()];
    const openers = openersFrom(pools);
    await expect(openDurableAvailabilityResources("  ", options, openers)).rejects.toThrow(
      /database URL/,
    );
    await expect(
      openDurableAvailabilityResources(
        "postgres://example",
        { ...options, localAgentId: " " },
        openers,
      ),
    ).rejects.toThrow(/local agent id/);
    expect(pools[0]?.ends).toBe(0);
  });

  it("closes pools opened before an opener fails", async () => {
    const pools = [fakePool(), fakePool()];
    let calls = 0;
    const openers = openersFrom(pools);
    const failing: DurablePoolOpeners = {
      ...openers,
      permissions: () => {
        calls += 1;
        throw new Error("pool down");
      },
    };
    await expect(
      openDurableAvailabilityResources("postgres://example", options, failing),
    ).rejects.toThrow(/pool down/);
    expect(calls).toBe(1);
    expect(pools[0]?.ends).toBe(1);
    expect(pools[1]?.ends).toBe(1);
  });

  it("closes every pool when schema setup fails, including a pool that fails to end", async () => {
    const pools = Array.from({ length: 6 }, () => fakePool());
    const first = pools[0];
    if (first === undefined) {
      throw new Error("fixture");
    }
    first.failQuery = true;
    first.failEnd = true;
    await expect(
      openDurableAvailabilityResources("postgres://example", options, openersFrom(pools)),
    ).rejects.toThrow(/schema down/);
    expect(pools.every((pool) => pool.ends === 1)).toBe(true);
  });

  it("uses the PostgreSQL pool factories when none are injected", async () => {
    await expect(
      openDurableAvailabilityResources("postgres://pan:pan@127.0.0.1:1/pan", options),
    ).rejects.toThrow();
  }, 15_000);
});
