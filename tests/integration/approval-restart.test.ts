import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  APPROVAL_POLICY_VERSION_V1,
  APPROVAL_PURPOSE_V1,
  APPROVAL_SCOPE_V1,
  APPROVAL_SKILL_VERSION_V1,
  applyApprovalSchema,
  createPgPool,
  PostgresApprovalStore,
  type SqlPool,
  type TrustedApprovalSource,
} from "../../src/modules/approval/index.js";
import { type AgentIdentity, createAgentIdentity } from "../../src/modules/identity/index.js";
import { LocalAvailabilityNode } from "../../src/runtime/local-availability-node.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const APPROVAL_TABLE_LOCK = 81421002;
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-8222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "req-restart";
const NOW = "2026-10-08T12:00:00.000Z";
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const owner = { kind: "trusted-approval-source", key: "local-owner" } as TrustedApprovalSource;

const agent = (id: string): AgentIdentity => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

describe.skipIf(databaseUrl === "")("approved approval survives a second process", () => {
  let pool: SqlPool | undefined;

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end();
    }
  });

  it("lets the new process release the row once", async () => {
    pool = createPgPool(databaseUrl);
    await applyApprovalSchema(pool);
    const lock = await pool.connect();
    await lock.query("SELECT pg_advisory_lock($1)", [APPROVAL_TABLE_LOCK]);
    try {
      await lock.query("TRUNCATE approval_records", []);
      await runRestartProbe(pool);
    } finally {
      await lock.query("SELECT pg_advisory_unlock($1)", [APPROVAL_TABLE_LOCK]);
      lock.release();
    }
  });
});

const runRestartProbe = async (pool: SqlPool): Promise<void> => {
  const node = new LocalAvailabilityNode({
    clock: { now: () => NOW, nowMs: () => Date.parse(NOW) },
    agents: [agent(FROM), agent(TO)],
    approvalStore: new PostgresApprovalStore(pool),
  });
  const created = await node.approvals.createAsk({
    requestId: REQUEST_ID,
    fromAgentId: FROM,
    toAgentId: TO,
    skillVersion: APPROVAL_SKILL_VERSION_V1,
    purpose: APPROVAL_PURPOSE_V1,
    scope: APPROVAL_SCOPE_V1,
    start: "2026-10-08T15:00:00.000Z",
    end: "2026-10-08T16:00:00.000Z",
    policyVersion: APPROVAL_POLICY_VERSION_V1,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    throw new Error("fixture");
  }
  const approved = await node.approvals.approve(owner, created.value.id);
  expect(approved.ok).toBe(true);

  const output = await new Promise<{ code: number; text: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        join(root, "node_modules/vitest/vitest.mjs"),
        "run",
        "--reporter=verbose",
        "tests/integration/approval-restart-probe.test.ts",
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
  expect(output.text).toContain("releases the restarted approval once");
  expect(output.text).toMatch(/1 passed/);
  expect(output.text).not.toMatch(/skipped/i);
  expect(output.text).not.toContain("postgres://");

  expect(await node.releaseByRequestId(REQUEST_ID, true)).toBe(false);
  expect((await node.approvals.findByRequestId(REQUEST_ID))?.status).toBe("released");
};
