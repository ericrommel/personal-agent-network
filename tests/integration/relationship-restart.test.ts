import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { createAgentIdentity, type AgentIdentity } from "../../src/modules/identity/index.js";
import {
  applyRelationshipSchema,
  createPgPool,
  PostgresRelationshipStore,
  RELATIONSHIP_COMMAND_CONTRACT_V1,
  RelationshipService,
  type SqlPool,
  type TrustedRelationshipSource,
} from "../../src/modules/relationships/index.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const source = {
  kind: "trusted-relationship-source",
  key: "local-owner",
} as TrustedRelationshipSource;

const agent = (id: string): AgentIdentity => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const RELATIONSHIP_TABLE_LOCK = 81421001;

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

describe.skipIf(databaseUrl === "")("revoked relationship survives a second process", () => {
  let pool: SqlPool | undefined;

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end();
    }
  });

  it("loads the revoked row in a new process", async () => {
    pool = createPgPool(databaseUrl);
    await applyRelationshipSchema(pool);
    const lock = await pool.connect();
    await lock.query("SELECT pg_advisory_lock($1)", [RELATIONSHIP_TABLE_LOCK]);
    try {
      await lock.query("TRUNCATE relationship_records", []);
      await runRestartProbe(pool);
    } finally {
      await lock.query("SELECT pg_advisory_unlock($1)", [RELATIONSHIP_TABLE_LOCK]);
      lock.release();
    }
  });
});

const runRestartProbe = async (pool: SqlPool): Promise<void> => {
  const agents = [agent(FROM), agent(TO)];
  const parties = {
    async findAgent(id: unknown) {
      return agents.find((item) => item.id === id) ?? null;
    },
  };
  const events = { record(): void {} };
  const service = new RelationshipService({
    parties,
    events,
    store: new PostgresRelationshipStore(pool, events),
  });
  const created = await service.create(source, {
    contract: RELATIONSHIP_COMMAND_CONTRACT_V1,
    action: "create",
    correlationId: "corr-restart",
    fromAgentId: FROM,
    toAgentId: TO,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    throw new Error("fixture");
  }
  const revoked = await service.revoke(source, {
    contract: RELATIONSHIP_COMMAND_CONTRACT_V1,
    action: "revoke",
    correlationId: "corr-restart-revoke",
    fromAgentId: FROM,
    toAgentId: TO,
    relationshipId: created.value.id,
  });
  expect(revoked.ok).toBe(true);

  const output = await new Promise<{ code: number; text: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        join(root, "node_modules/vitest/vitest.mjs"),
        "run",
        "tests/integration/relationship-restart-probe.test.ts",
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
  expect(output.text).toContain("denies because the revoked row is present");
  expect(output.text).toMatch(/1 passed/);
  expect(output.text).not.toContain("postgres://");
};
