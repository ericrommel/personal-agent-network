import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { type AgentIdentity, createAgentIdentity } from "../../src/modules/identity/index.js";
import {
  AwaitedSkillPermissionStore,
  applySkillPermissionSchema,
  createPgPool,
  PostgresSkillPermissionStore,
  SKILL_PERMISSION_COMMAND_CONTRACT_V1,
  type SqlPool,
  type TrustedPermissionSource,
} from "../../src/modules/permissions/index.js";
import { LocalAvailabilityNode } from "../../src/runtime/local-availability-node.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const PERMISSION_TABLE_LOCK = 81421004;
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const source = { kind: "trusted-permission-source", key: "local-owner" } as TrustedPermissionSource;

const agent = (id: string): AgentIdentity => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

const command = (action: "grant" | "revoke", permissionId?: string) => ({
  contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
  action,
  correlationId: action === "grant" ? "corr-perm-restart" : "corr-perm-restart-revoke",
  fromAgentId: FROM,
  toAgentId: TO,
  effect: "ALLOW",
  ...(permissionId === undefined ? {} : { permissionId }),
});

describe.skipIf(databaseUrl === "")("revoked permission survives a second process", () => {
  let pool: SqlPool | undefined;

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end();
    }
  });

  it("lets the new process see the revoked row", async () => {
    pool = createPgPool(databaseUrl);
    await applySkillPermissionSchema(pool);
    const lock = await pool.connect();
    await lock.query("SELECT pg_advisory_lock($1)", [PERMISSION_TABLE_LOCK]);
    try {
      await lock.query("TRUNCATE skill_permission_records", []);
      await runRestartProbe(pool);
    } finally {
      await lock.query("SELECT pg_advisory_unlock($1)", [PERMISSION_TABLE_LOCK]);
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
    agents: [agent(FROM), agent(TO)],
    permissionStore: new AwaitedSkillPermissionStore(
      new PostgresSkillPermissionStore(pool, { record() {} }),
    ),
  });
  const granted = await node.permissions.grant(source, command("grant"));
  expect(granted.ok).toBe(true);
  if (!granted.ok) {
    throw new Error("fixture");
  }
  expect((await node.permissions.revoke(source, command("revoke", granted.value.id))).ok).toBe(
    true,
  );

  const output = await new Promise<{ code: number; text: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        join(root, "node_modules/vitest/vitest.mjs"),
        "run",
        "--reporter=verbose",
        "tests/integration/permission-restart-probe.test.ts",
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
  expect(output.text).toContain("denies because the revoked permission row is present");
  expect(output.text).toMatch(/1 passed/);
  expect(output.text).not.toMatch(/skipped/i);
  expect(output.text).not.toContain("postgres://");
  expect(await node.permissions.readSnapshot(FROM, TO)).toBeNull();
};
