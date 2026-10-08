import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  applyAuditSchema,
  createPgPool,
  PostgresAuditLog,
  type SqlPool,
  type TrustedAuditOperator,
} from "../../src/modules/audit/index.js";
import type { AvailabilityInterval } from "../../src/modules/context/index.js";
import { type AgentIdentity, createAgentIdentity } from "../../src/modules/identity/index.js";
import { AVAILABILITY_REQUEST_CONTRACT_V1 } from "../../src/modules/messaging/index.js";
import { LocalAvailabilityNode } from "../../src/runtime/local-availability-node.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const AUDIT_TABLE_LOCK = 81421003;
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "req-audit-restart";
const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const START = new Date(NOW + 60_000).toISOString();
const END = new Date(NOW + 60_000 + 3_600_000).toISOString();
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const operator = { kind: "trusted-audit-operator", key: "local-owner" } as TrustedAuditOperator;

const agent = (id: string): AgentIdentity => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

describe.skipIf(databaseUrl === "")("denied audit row survives a second process", () => {
  let pool: SqlPool | undefined;

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end();
    }
  });

  it("loads the minimized deny event in a new process", async () => {
    pool = createPgPool(databaseUrl);
    await applyAuditSchema(pool);
    const lock = await pool.connect();
    await lock.query("SELECT pg_advisory_lock($1)", [AUDIT_TABLE_LOCK]);
    try {
      await lock.query("TRUNCATE audit_records", []);
      await runRestartProbe(pool);
    } finally {
      await lock.query("SELECT pg_advisory_unlock($1)", [AUDIT_TABLE_LOCK]);
      lock.release();
    }
  });
});

const runRestartProbe = async (pool: SqlPool): Promise<void> => {
  let reads = 0;
  const context = {
    get busyIntervals(): readonly AvailabilityInterval[] {
      reads += 1;
      return [];
    },
  };
  const clock = {
    now: () => new Date(NOW).toISOString(),
    nowMs: () => NOW,
  };
  const node = new LocalAvailabilityNode({
    clock,
    agents: [agent(FROM), agent(TO)],
    context,
    audit: new PostgresAuditLog(pool, clock),
  });
  expect(
    await node.handle(
      {
        schema: "pan.authenticated-agent-principal/v1",
        kind: "authenticated-agent",
        agentId: FROM,
        authenticatedAt: new Date(NOW).toISOString(),
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
        "tests/integration/audit-restart-probe.test.ts",
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
  expect(output.text).toContain("reads the denied audit row after restart");
  expect(output.text).toMatch(/1 passed/);
  expect(output.text).not.toMatch(/skipped/i);
  expect(output.text).not.toContain("postgres://");

  const seen = await new PostgresAuditLog(pool, clock).read(operator);
  expect(seen.ok).toBe(true);
  if (!seen.ok) {
    throw new Error("fixture");
  }
  expect(seen.value).toHaveLength(1);
  expect(seen.value[0]).toMatchObject({
    category: "decision",
    requestId: REQUEST_ID,
    outcome: "deny",
  });
};
