import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  type SqlPool as AuditPool,
  applyAuditSchema,
  createPgPool as createAuditPool,
  PostgresAuditLog,
  type TrustedAuditOperator,
} from "../../src/modules/audit/index.js";
import type { AvailabilityInterval } from "../../src/modules/context/index.js";
import { type AgentIdentity, createAgentIdentity } from "../../src/modules/identity/index.js";
import { AVAILABILITY_REQUEST_CONTRACT_V1 } from "../../src/modules/messaging/index.js";
import {
  applyRelationshipSchema,
  createPgPool,
  PostgresRelationshipStore,
  RELATIONSHIP_COMMAND_CONTRACT_V1,
  RelationshipService,
  type SqlPool,
  type TrustedRelationshipSource,
} from "../../src/modules/relationships/index.js";
import { LocalAvailabilityNode } from "../../src/runtime/local-availability-node.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const RELATIONSHIP_TABLE_LOCK = 81421001;
const AUDIT_TABLE_LOCK = 81421003;
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const ORIGIN = Date.parse("2026-10-08T12:00:00.000Z");
const START = new Date(ORIGIN + 60_000).toISOString();
const END = new Date(ORIGIN + 60_000 + 3_600_000).toISOString();
const REQUEST_ID = "req-composed";
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const source = {
  kind: "trusted-relationship-source",
  key: "local-owner",
} as TrustedRelationshipSource;

const operator = { kind: "trusted-audit-operator", key: "local-owner" } as TrustedAuditOperator;

const agent = (id: string): AgentIdentity => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

describe.skipIf(databaseUrl === "")("composed deny survives a second process", () => {
  let relationshipPool: SqlPool | undefined;
  let auditPool: AuditPool | undefined;

  afterAll(async () => {
    if (relationshipPool !== undefined) {
      await relationshipPool.end();
    }
    if (auditPool !== undefined) {
      await auditPool.end();
    }
  });

  it("loads the revoked relationship and its audit row", async () => {
    relationshipPool = createPgPool(databaseUrl);
    auditPool = createAuditPool(databaseUrl);
    await applyRelationshipSchema(relationshipPool);
    await applyAuditSchema(auditPool);
    const lock = await relationshipPool.connect();
    await lock.query("SELECT pg_advisory_lock($1)", [RELATIONSHIP_TABLE_LOCK]);
    await lock.query("SELECT pg_advisory_lock($1)", [AUDIT_TABLE_LOCK]);
    try {
      await lock.query("TRUNCATE relationship_records", []);
      await lock.query("TRUNCATE audit_records", []);
      await runRestartProbe(relationshipPool, auditPool);
    } finally {
      await lock.query("SELECT pg_advisory_unlock($1)", [AUDIT_TABLE_LOCK]);
      await lock.query("SELECT pg_advisory_unlock($1)", [RELATIONSHIP_TABLE_LOCK]);
      lock.release();
    }
  });
});

const runRestartProbe = async (relationshipPool: SqlPool, auditPool: AuditPool): Promise<void> => {
  const agents = [agent(FROM), agent(TO)];
  const parties = {
    async findAgent(id: unknown) {
      return agents.find((item) => item.id === id) ?? null;
    },
  };
  const events = { record(): void {} };
  const relationships = new RelationshipService({
    parties,
    events,
    store: new PostgresRelationshipStore(relationshipPool, events),
  });
  const created = await relationships.create(source, {
    contract: RELATIONSHIP_COMMAND_CONTRACT_V1,
    action: "create",
    correlationId: "corr-composed",
    fromAgentId: FROM,
    toAgentId: TO,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    throw new Error("fixture");
  }
  expect(
    (
      await relationships.revoke(source, {
        contract: RELATIONSHIP_COMMAND_CONTRACT_V1,
        action: "revoke",
        correlationId: "corr-composed-revoke",
        fromAgentId: FROM,
        toAgentId: TO,
        relationshipId: created.value.id,
      })
    ).ok,
  ).toBe(true);

  const clock = {
    now: () => new Date(ORIGIN).toISOString(),
    nowMs: () => ORIGIN,
  };
  let reads = 0;
  const context = {
    get busyIntervals(): readonly AvailabilityInterval[] {
      reads += 1;
      return [];
    },
  };
  const node = new LocalAvailabilityNode({
    clock,
    agents,
    context,
    relationshipStore: new PostgresRelationshipStore(relationshipPool, events),
    audit: new PostgresAuditLog(auditPool, clock),
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
        requestId: REQUEST_ID,
        targetAgentId: TO,
        purpose: "availability_check",
        scope: "availability_boolean",
        start: START,
        end: END,
      },
    ),
  ).toEqual({ outcome: "unavailable" });
  expect(reads).toBe(0);

  const output = await new Promise<{ code: number; text: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        join(root, "node_modules/vitest/vitest.mjs"),
        "run",
        "--reporter=verbose",
        "tests/integration/composed-restart-probe.test.ts",
      ],
      {
        cwd: root,
        env: { ...process.env, PAN_RESTART_PROBE: "1" },
      },
    );
    if (child.stdout === null || child.stderr === null) {
      child.kill();
      reject(new Error("probe stdio was not piped"));
      return;
    }
    let text = "";
    child.stdout.on("data", (chunk: Buffer) => {
      text += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      text += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, text });
    });
  });
  if (output.code !== 0) {
    throw new Error(redact(output.text));
  }
  expect(output.text).toContain("sees the revoked relationship and the minimized deny");
  expect(output.text).toMatch(/1 passed/);
  expect(output.text).not.toMatch(/skipped/i);
  expect(output.text).not.toContain("postgres://");

  const seen = await new PostgresAuditLog(auditPool, clock).read(operator);
  expect(seen.ok).toBe(true);
  if (!seen.ok) {
    throw new Error("fixture");
  }
  expect(seen.value.map((event) => event?.requestId).sort()).toEqual([
    REQUEST_ID,
    "req-composed-child",
  ]);
  expect(
    seen.value.every((event) => event?.category === "decision" && event.outcome === "deny"),
  ).toBe(true);
};
