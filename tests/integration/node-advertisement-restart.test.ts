import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { type AgentIdentity, createAgentIdentity } from "../../src/modules/identity/index.js";
import {
  AVAILABILITY_SKILL_VERSION_V1,
  AwaitedSkillAdvertisementStore,
  applySkillAdvertisementSchema,
  createPgPool,
  PostgresSkillAdvertisementStore,
  SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
  type SqlPool,
  type TrustedSkillAdvertisementSource,
} from "../../src/modules/skills/index.js";
import { LocalAvailabilityNode } from "../../src/runtime/local-availability-node.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const ADVERTISEMENT_TABLE_LOCK = 81421005;
const AGENT = "pan_agent_11111111-1111-4111-8111-111111111111";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const VERSION = AVAILABILITY_SKILL_VERSION_V1;
const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const source = {
  kind: "trusted-skill-advertisement-source",
  key: "local-owner",
} as TrustedSkillAdvertisementSource;

const agent = (id: string): AgentIdentity => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

describe.skipIf(databaseUrl === "")("node sees a withdrawn advertisement after restart", () => {
  let pool: SqlPool | undefined;

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end();
    }
  });

  it("lets the new node see the withdrawn row", async () => {
    pool = createPgPool(databaseUrl);
    await applySkillAdvertisementSchema(pool);
    const lock = await pool.connect();
    await lock.query("SELECT pg_advisory_lock($1)", [ADVERTISEMENT_TABLE_LOCK]);
    try {
      await lock.query("TRUNCATE skill_advertisement_records", []);
      await runRestartProbe(pool);
    } finally {
      await lock.query("SELECT pg_advisory_unlock($1)", [ADVERTISEMENT_TABLE_LOCK]);
      lock.release();
    }
  });
});

const runRestartProbe = async (pool: SqlPool): Promise<void> => {
  const node = new LocalAvailabilityNode({
    clock: {
      now: () => new Date(NOW).toISOString(),
      nowMs: () => NOW,
    },
    agents: [agent(AGENT)],
    advertisementStore: new AwaitedSkillAdvertisementStore(
      new PostgresSkillAdvertisementStore(pool, { record() {} }),
    ),
  });
  const created = await node.advertisements.advertise(source, {
    contract: SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
    action: "advertise",
    correlationId: "corr-node-ad",
    agentId: AGENT,
    skillVersion: VERSION,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    throw new Error("fixture");
  }
  expect(
    (
      await node.advertisements.withdraw(source, {
        contract: SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
        action: "withdraw",
        correlationId: "corr-node-ad-withdraw",
        agentId: AGENT,
        skillVersion: VERSION,
        advertisementId: created.value.id,
      })
    ).ok,
  ).toBe(true);

  const output = await new Promise<{ code: number; text: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        join(root, "node_modules/vitest/vitest.mjs"),
        "run",
        "--reporter=verbose",
        "tests/integration/node-advertisement-restart-probe.test.ts",
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
  expect(output.text).toContain("the node reads false because the withdrawn row is present");
  expect(output.text).toMatch(/1 passed/);
  expect(output.text).not.toMatch(/skipped/i);
  expect(output.text).not.toContain("postgres://");
  expect(await node.advertisements.readAdvertised(AGENT, VERSION)).toBe(false);
};
