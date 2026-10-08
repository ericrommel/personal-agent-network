import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  type SqlPool as ApprovalPool,
  applyApprovalSchema,
  createPgPool as createApprovalPool,
  PostgresApprovalStore,
  type TrustedApprovalSource,
} from "../../src/modules/approval/index.js";
import {
  type AuditEvent,
  type SqlPool as AuditPool,
  applyAuditSchema,
  createPgPool as createAuditPool,
  PostgresAuditLog,
  type TrustedAuditOperator,
} from "../../src/modules/audit/index.js";
import type { AvailabilityInterval } from "../../src/modules/context/index.js";
import { type AgentIdentity, createAgentIdentity } from "../../src/modules/identity/index.js";
import {
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_REQUEST_CONTRACT_V1,
  AVAILABILITY_SCOPE_V1,
} from "../../src/modules/messaging/index.js";
import {
  AwaitedSkillPermissionStore,
  applySkillPermissionSchema,
  createPgPool as createPermissionPool,
  type SqlPool as PermissionPool,
  PostgresSkillPermissionStore,
  SKILL_PERMISSION_COMMAND_CONTRACT_V1,
  type TrustedPermissionSource,
} from "../../src/modules/permissions/index.js";
import {
  applyRelationshipSchema,
  createPgPool as createRelationshipPool,
  PostgresRelationshipStore,
  RELATIONSHIP_COMMAND_CONTRACT_V1,
  type SqlPool as RelationshipPool,
  type TrustedRelationshipSource,
} from "../../src/modules/relationships/index.js";
import {
  type SqlPool as AdvertisementPool,
  AVAILABILITY_SKILL_VERSION_V1,
  AwaitedSkillAdvertisementStore,
  applySkillAdvertisementSchema,
  createPgPool as createAdvertisementPool,
  PostgresSkillAdvertisementStore,
  SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
  type TrustedSkillAdvertisementSource,
} from "../../src/modules/skills/index.js";
import { LocalAvailabilityNode } from "../../src/runtime/local-availability-node.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const RELATIONSHIP_TABLE_LOCK = 81421001;
const APPROVAL_TABLE_LOCK = 81421002;
const AUDIT_TABLE_LOCK = 81421003;
const PERMISSION_TABLE_LOCK = 81421004;
const ADVERTISEMENT_TABLE_LOCK = 81421005;
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const ORIGIN = Date.parse("2026-10-08T12:00:00.000Z");
const START = new Date(ORIGIN + 60_000).toISOString();
const END = new Date(ORIGIN + 60_000 + 3_600_000).toISOString();
const REQUEST_ID = "req-release-once";
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const relationshipSource = {
  kind: "trusted-relationship-source",
  key: "local-owner",
} as TrustedRelationshipSource;
const permissionSource = {
  kind: "trusted-permission-source",
  key: "local-owner",
} as TrustedPermissionSource;
const advertisementSource = {
  kind: "trusted-skill-advertisement-source",
  key: "local-owner",
} as TrustedSkillAdvertisementSource;
const approvalSource = {
  kind: "trusted-approval-source",
  key: "local-owner",
} as TrustedApprovalSource;
const operator = { kind: "trusted-audit-operator", key: "local-owner" } as TrustedAuditOperator;
const silent = { record(): void {} };

const agent = (id: string): AgentIdentity => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

const clockAt = (state: { now: number }) => ({
  now: () => new Date(state.now).toISOString(),
  nowMs: () => state.now,
});

const principal = {
  schema: "pan.authenticated-agent-principal/v1",
  kind: "authenticated-agent",
  agentId: FROM,
  authenticatedAt: new Date(ORIGIN).toISOString(),
};

const request = {
  contract: AVAILABILITY_REQUEST_CONTRACT_V1,
  requestId: REQUEST_ID,
  targetAgentId: TO,
  purpose: AVAILABILITY_PURPOSE_V1,
  scope: AVAILABILITY_SCOPE_V1,
  start: START,
  end: END,
};

type Pools = Readonly<{
  relationship: RelationshipPool;
  approval: ApprovalPool;
  audit: AuditPool;
  permission: PermissionPool;
  advertisement: AdvertisementPool;
}>;

describe.skipIf(databaseUrl === "")("approved ASK release survives a second process", () => {
  let relationshipPool: RelationshipPool | undefined;
  let approvalPool: ApprovalPool | undefined;
  let auditPool: AuditPool | undefined;
  let permissionPool: PermissionPool | undefined;
  let advertisementPool: AdvertisementPool | undefined;

  afterAll(async () => {
    if (relationshipPool !== undefined) {
      await relationshipPool.end();
    }
    if (approvalPool !== undefined) {
      await approvalPool.end();
    }
    if (auditPool !== undefined) {
      await auditPool.end();
    }
    if (permissionPool !== undefined) {
      await permissionPool.end();
    }
    if (advertisementPool !== undefined) {
      await advertisementPool.end();
    }
  });

  it("loads the approved ASK and releases it from a second process", async () => {
    relationshipPool = createRelationshipPool(databaseUrl);
    approvalPool = createApprovalPool(databaseUrl);
    auditPool = createAuditPool(databaseUrl);
    permissionPool = createPermissionPool(databaseUrl);
    advertisementPool = createAdvertisementPool(databaseUrl);
    await applySchemas({
      relationship: relationshipPool,
      approval: approvalPool,
      audit: auditPool,
      permission: permissionPool,
      advertisement: advertisementPool,
    });
    const lock = await relationshipPool.connect();
    await lock.query("SELECT pg_advisory_lock($1)", [RELATIONSHIP_TABLE_LOCK]);
    await lock.query("SELECT pg_advisory_lock($1)", [APPROVAL_TABLE_LOCK]);
    await lock.query("SELECT pg_advisory_lock($1)", [AUDIT_TABLE_LOCK]);
    await lock.query("SELECT pg_advisory_lock($1)", [PERMISSION_TABLE_LOCK]);
    await lock.query("SELECT pg_advisory_lock($1)", [ADVERTISEMENT_TABLE_LOCK]);
    try {
      await lock.query("TRUNCATE relationship_records", []);
      await lock.query("TRUNCATE approval_records", []);
      await lock.query("TRUNCATE audit_records", []);
      await lock.query("TRUNCATE skill_permission_records", []);
      await lock.query("TRUNCATE skill_advertisement_records", []);
      await runRestartProbe({
        relationship: relationshipPool,
        approval: approvalPool,
        audit: auditPool,
        permission: permissionPool,
        advertisement: advertisementPool,
      });
    } finally {
      await lock.query("SELECT pg_advisory_unlock($1)", [ADVERTISEMENT_TABLE_LOCK]);
      await lock.query("SELECT pg_advisory_unlock($1)", [PERMISSION_TABLE_LOCK]);
      await lock.query("SELECT pg_advisory_unlock($1)", [AUDIT_TABLE_LOCK]);
      await lock.query("SELECT pg_advisory_unlock($1)", [APPROVAL_TABLE_LOCK]);
      await lock.query("SELECT pg_advisory_unlock($1)", [RELATIONSHIP_TABLE_LOCK]);
      lock.release();
    }
  });
});

const schemaRace = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const record = error as { code?: unknown; message?: unknown };
  return (
    record.code === "23505" ||
    (typeof record.message === "string" && record.message.includes("pg_type_typname_nsp_index"))
  );
};

// Concurrent CREATE TABLE IF NOT EXISTS can collide on the row type.
const applySchemas = async (pools: Pools): Promise<void> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await applyRelationshipSchema(pools.relationship);
      await applyApprovalSchema(pools.approval);
      await applyAuditSchema(pools.audit);
      await applySkillPermissionSchema(pools.permission);
      await applySkillAdvertisementSchema(pools.advertisement);
      return;
    } catch (error) {
      if (attempt === 4 || !schemaRace(error)) {
        throw error;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 25 * (attempt + 1));
      });
    }
  }
};

const makeNode = (
  pools: Pools,
  clock: ReturnType<typeof clockAt>,
  context: { readonly busyIntervals: readonly AvailabilityInterval[] },
): LocalAvailabilityNode =>
  new LocalAvailabilityNode({
    clock,
    agents: [agent(FROM), agent(TO)],
    context,
    relationshipStore: new PostgresRelationshipStore(pools.relationship, silent),
    approvalStore: new PostgresApprovalStore(pools.approval),
    permissionStore: new AwaitedSkillPermissionStore(
      new PostgresSkillPermissionStore(pools.permission, silent),
    ),
    advertisementStore: new AwaitedSkillAdvertisementStore(
      new PostgresSkillAdvertisementStore(pools.advertisement, silent),
    ),
    audit: new PostgresAuditLog(pools.audit, clock),
  });

const runRestartProbe = async (pools: Pools): Promise<void> => {
  const state = { now: ORIGIN };
  const clock = clockAt(state);
  let reads = 0;
  const context = {
    get busyIntervals(): readonly AvailabilityInterval[] {
      reads += 1;
      return [];
    },
  };
  const node = makeNode(pools, clock, context);
  expect(
    (
      await node.relationships.create(relationshipSource, {
        contract: RELATIONSHIP_COMMAND_CONTRACT_V1,
        action: "create",
        correlationId: "corr-ask-rel",
        fromAgentId: FROM,
        toAgentId: TO,
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await node.advertisements.advertise(advertisementSource, {
        contract: SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
        action: "advertise",
        correlationId: "corr-ask-ad",
        agentId: TO,
        skillVersion: AVAILABILITY_SKILL_VERSION_V1,
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await node.permissions.grant(permissionSource, {
        contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
        action: "grant",
        correlationId: "corr-ask-grant",
        fromAgentId: FROM,
        toAgentId: TO,
        effect: "ASK",
      })
    ).ok,
  ).toBe(true);

  expect(await node.handle(principal, request)).toEqual({ outcome: "unavailable" });
  expect(reads).toBe(0);
  const pending = await node.approvals.findByRequestId(REQUEST_ID);
  expect(pending?.status).toBe("pending");
  const approved = await node.approvals.approve(approvalSource, pending?.id);
  expect(approved.ok).toBe(true);
  if (!approved.ok) {
    throw new Error("fixture");
  }
  expect(approved.value.id.startsWith("pan_approval_")).toBe(true);

  const output = await spawnProbe();
  if (output.code !== 0) {
    throw new Error(redact(output.text));
  }
  expect(output.text).toContain("releases the approved ASK once from the restarted rows");
  expect(output.text).toMatch(/1 passed/);
  expect(output.text).not.toMatch(/skipped/i);
  expect(output.text).not.toContain("postgres://");

  const spent = await node.approvals.findByRequestId(REQUEST_ID);
  expect(spent?.status).toBe("released");
  expect(spent?.id).toBe(approved.value.id);
  expect(await node.releaseByRequestId(REQUEST_ID, true)).toBe(false);
  expect(reads).toBe(0);
  state.now = ORIGIN + 3_000;
  expect(await node.handle(principal, request)).toEqual({ outcome: "unavailable" });
  expect(reads).toBe(0);

  const seen = await new PostgresAuditLog(pools.audit, clock).read(operator);
  expect(seen.ok).toBe(true);
  if (!seen.ok) {
    throw new Error("fixture");
  }
  expect(seen.value).toEqual([
    auditEvent(seen.value, 0, new Date(ORIGIN).toISOString(), "approval", "unavailable"),
    auditEvent(seen.value, 1, new Date(ORIGIN + 1_000).toISOString(), "disclosure", "released"),
    auditEvent(seen.value, 2, new Date(ORIGIN + 2_000).toISOString(), "approval", "unavailable"),
    auditEvent(seen.value, 3, new Date(ORIGIN + 3_000).toISOString(), "approval", "unavailable"),
  ]);
  expectMinimized(seen.value);
};

const auditEvent = (
  seen: readonly AuditEvent[],
  index: number,
  recordedAt: string,
  category: "approval" | "disclosure",
  outcome: "unavailable" | "released",
) => ({
  kind: "audit-event" as const,
  id: seen[index]?.id,
  recordedAt,
  category,
  requestId: REQUEST_ID,
  outcome,
});

const expectMinimized = (value: unknown): void => {
  const text = JSON.stringify(value);
  expect(text).not.toContain(START);
  expect(text).not.toContain(END);
  expect(text).not.toContain("ASK");
  expect(text).not.toContain("ALLOW");
  expect(text).not.toContain("DENY");
  expect(text).not.toContain("pan_approval_");
  expect(text).not.toContain("availability_boolean");
  expect(text).not.toContain('"result"');
};

const spawnProbe = (): Promise<{ code: number; text: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        join(root, "node_modules/vitest/vitest.mjs"),
        "run",
        "--reporter=verbose",
        "tests/integration/ask-success-restart-probe.test.ts",
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
