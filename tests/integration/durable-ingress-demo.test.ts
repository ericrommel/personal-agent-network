import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { TrustedApprovalSource } from "../../src/modules/approval/index.js";
import type { TrustedAuditOperator } from "../../src/modules/audit/index.js";
import { createAgentIdentity } from "../../src/modules/identity/index.js";
import {
  AVAILABILITY_ENVELOPE_CONTRACT_V1,
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_REQUEST_CONTRACT_V1,
  AVAILABILITY_SCOPE_V1,
} from "../../src/modules/messaging/index.js";
import {
  SKILL_PERMISSION_COMMAND_CONTRACT_V1,
  type TrustedPermissionSource,
} from "../../src/modules/permissions/index.js";
import {
  createPgPool,
  RELATIONSHIP_COMMAND_CONTRACT_V1,
  type SqlPool,
  type TrustedRelationshipSource,
} from "../../src/modules/relationships/index.js";
import {
  AVAILABILITY_SKILL_VERSION_V1,
  SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
  type TrustedSkillAdvertisementSource,
} from "../../src/modules/skills/index.js";
import { openDurableAvailabilityResources } from "../../src/runtime/durable-availability-resources.js";

const databaseUrl = process.env.PAN_RELATIONSHIP_DATABASE_URL ?? "";
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const ORIGIN = Date.parse("2026-10-08T12:00:00.000Z");
const START = new Date(ORIGIN + 60_000).toISOString();
const END = new Date(ORIGIN + 60_000 + 3_600_000).toISOString();
const SAN = `urn:pan:agent:${FROM}`;
const RECIPIENT_SAN = `urn:pan:agent:${TO}`;
const BUSY_START = new Date(ORIGIN + 30 * 60 * 1000).toISOString();
const BUSY_END = new Date(ORIGIN + 45 * 60 * 1000).toISOString();
const LOCKS = [81421001, 81421002, 81421003, 81421004, 81421005, 81421006];

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
const operator = {
  kind: "trusted-audit-operator",
  key: "local-owner",
} as TrustedAuditOperator;

const agent = (id: string) => {
  const created = createAgentIdentity(id, OWNER, "active");
  if (!created.ok) {
    throw new Error("fixture");
  }
  return created.value;
};

const clock = {
  now: () => new Date(ORIGIN).toISOString(),
  nowMs: () => ORIGIN,
};

const redact = (text: string): string => text.replace(/postgres:\/\/\S+/g, "postgres://redacted");

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe.skipIf(databaseUrl === "")("two-process mutual-TLS availability", () => {
  let admin: SqlPool | undefined;

  afterAll(async () => {
    if (admin !== undefined) {
      await admin.end();
    }
  });

  it("denies and releases only the public object across restart", async () => {
    expect(Date.parse(BUSY_START)).toBeGreaterThan(Date.parse(START));
    expect(Date.parse(BUSY_END)).toBeLessThan(Date.parse(END));
    const directory = mkdtempSync(join(tmpdir(), "pan-durable-ingress-"));
    const openssl = (args: string[]) => {
      execFileSync("openssl", args, { cwd: directory, stdio: "pipe" });
    };
    openssl([
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      "ca.key",
      "-out",
      "ca.crt",
      "-days",
      "1",
      "-nodes",
      "-subj",
      "/CN=pan-test-ca",
    ]);
    openssl([
      "req",
      "-newkey",
      "rsa:2048",
      "-keyout",
      "server.key",
      "-out",
      "server.csr",
      "-nodes",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost",
      "-addext",
      "extendedKeyUsage=serverAuth",
    ]);
    openssl([
      "x509",
      "-req",
      "-in",
      "server.csr",
      "-CA",
      "ca.crt",
      "-CAkey",
      "ca.key",
      "-CAcreateserial",
      "-out",
      "server.crt",
      "-days",
      "1",
      "-copy_extensions",
      "copy",
    ]);
    openssl([
      "req",
      "-newkey",
      "rsa:2048",
      "-keyout",
      "client.key",
      "-out",
      "client.csr",
      "-nodes",
      "-subj",
      "/CN=pan-client",
      "-addext",
      `subjectAltName=URI:${SAN}`,
      "-addext",
      "extendedKeyUsage=clientAuth",
    ]);
    openssl([
      "x509",
      "-req",
      "-in",
      "client.csr",
      "-CA",
      "ca.crt",
      "-CAkey",
      "ca.key",
      "-CAcreateserial",
      "-out",
      "client.crt",
      "-days",
      "1",
      "-copy_extensions",
      "copy",
    ]);
    openssl([
      "req",
      "-newkey",
      "rsa:2048",
      "-keyout",
      "other.key",
      "-out",
      "other.csr",
      "-nodes",
      "-subj",
      "/CN=pan-recipient",
      "-addext",
      `subjectAltName=URI:${RECIPIENT_SAN}`,
      "-addext",
      "extendedKeyUsage=clientAuth",
    ]);
    openssl([
      "x509",
      "-req",
      "-in",
      "other.csr",
      "-CA",
      "ca.crt",
      "-CAkey",
      "ca.key",
      "-CAcreateserial",
      "-out",
      "other.crt",
      "-days",
      "1",
      "-copy_extensions",
      "copy",
    ]);
    const file = (name: string) => readFileSync(join(directory, name));
    const resources = await openDurableAvailabilityResources(databaseUrl, {
      clock,
      agents: [agent(FROM), agent(TO)],
      localAgentId: TO,
    });
    admin = createPgPool(databaseUrl);
    const lock = await admin.connect();
    let generation = 0;
    const children: ChildProcess[] = [];
    const outputs: Array<() => string> = [];
    try {
      for (const id of LOCKS) {
        await lock.query("SELECT pg_advisory_lock($1)", [id]);
      }
      for (const table of [
        "relationship_records",
        "approval_records",
        "skill_permission_records",
        "skill_advertisement_records",
        "audit_records",
        "replay_message_records",
      ]) {
        await lock.query(`TRUNCATE ${table}`, []);
      }
      const created = await resources.node.relationships.create(relationshipSource, {
        contract: RELATIONSHIP_COMMAND_CONTRACT_V1,
        action: "create",
        correlationId: "corr-demo-rel",
        fromAgentId: FROM,
        toAgentId: TO,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        throw new Error("fixture");
      }
      const advertised = await resources.node.advertisements.advertise(advertisementSource, {
        contract: SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
        action: "advertise",
        correlationId: "corr-demo-ad",
        agentId: TO,
        skillVersion: AVAILABILITY_SKILL_VERSION_V1,
      });
      expect(advertised.ok).toBe(true);
      if (!advertised.ok) {
        throw new Error("fixture");
      }
      const allow = await resources.node.permissions.grant(permissionSource, {
        contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
        action: "grant",
        correlationId: "corr-demo-allow",
        fromAgentId: FROM,
        toAgentId: TO,
        effect: "ALLOW",
      });
      expect(allow.ok).toBe(true);
      if (!allow.ok) {
        throw new Error("fixture");
      }

      const start = async () => {
        generation += 1;
        const portFile = join(directory, `port-${generation}`);
        const stopFile = join(directory, `stop-${generation}`);
        let text = "";
        const child = spawn(
          process.execPath,
          [
            join(root, "node_modules/vitest/vitest.mjs"),
            "run",
            "--reporter=dot",
            "tests/integration/durable-ingress-listen-probe.test.ts",
          ],
          {
            cwd: root,
            env: {
              ...process.env,
              PAN_DURABLE_INGRESS: "1",
              PAN_RELATIONSHIP_DATABASE_URL: databaseUrl,
              PAN_CLOCK_ORIGIN: String(ORIGIN),
              PAN_LOCAL_AGENT_ID: TO,
              PAN_FROM_AGENT_ID: FROM,
              PAN_OWNER_ID: OWNER,
              PAN_INGRESS_PORT_FILE: portFile,
              PAN_INGRESS_STOP_FILE: stopFile,
              PAN_TLS_KEY: join(directory, "server.key"),
              PAN_TLS_CERT: join(directory, "server.crt"),
              PAN_TLS_CA: join(directory, "ca.crt"),
              PAN_BUSY_START: BUSY_START,
              PAN_BUSY_END: BUSY_END,
            },
          },
        );
        outputs.push(() => text);
        children.push(child);
        child.stdout?.on("data", (chunk: Buffer) => {
          text += chunk.toString("utf8");
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          text += chunk.toString("utf8");
        });
        const started = Date.now();
        while (!existsSync(portFile)) {
          if (child.exitCode !== null || Date.now() - started > 20_000) {
            throw new Error(redact(text || "ingress did not listen"));
          }
          await delay(50);
        }
        return {
          port: Number(readFileSync(portFile, "utf8")),
          stop: async () => {
            writeFileSync(stopFile, "stop");
            const [code] = (await once(child, "close")) as [number | null];
            if (code !== 0) {
              throw new Error(redact(`ingress exit ${code ?? 1}: ${text}`));
            }
          },
        };
      };

      const post = (
        port: number,
        messageId: string,
        requestId: string,
        patch?: (value: Record<string, unknown>) => void,
        material: Readonly<{ cert: string; key: string }> = {
          cert: "client.crt",
          key: "client.key",
        },
      ) => {
        const bodyRecord: Record<string, unknown> = {
          contract: AVAILABILITY_REQUEST_CONTRACT_V1,
          requestId,
          targetAgentId: TO,
          purpose: AVAILABILITY_PURPOSE_V1,
          scope: AVAILABILITY_SCOPE_V1,
          start: START,
          end: END,
        };
        const envelope: Record<string, unknown> = {
          contract: AVAILABILITY_ENVELOPE_CONTRACT_V1,
          messageId,
          issuedAt: new Date(ORIGIN).toISOString(),
          expiresAt: new Date(ORIGIN + 5 * 60 * 1000).toISOString(),
          recipientAgentId: TO,
          body: bodyRecord,
        };
        patch?.(envelope);
        const payload = JSON.stringify(envelope);
        return new Promise<{ status: number; body: string }>((resolve, reject) => {
          const outbound = httpsRequest(
            {
              host: "127.0.0.1",
              port,
              servername: "localhost",
              path: "/pan/availability/v1",
              method: "POST",
              ca: file("ca.crt"),
              cert: file(material.cert),
              key: file(material.key),
              rejectUnauthorized: true,
              agent: false,
              headers: {
                "content-type": "application/json",
                "content-length": String(Buffer.byteLength(payload)),
              },
            },
            (response) => {
              const chunks: Buffer[] = [];
              response.on("data", (chunk: Buffer) => chunks.push(chunk));
              response.on("end", () => {
                resolve({
                  status: response.statusCode ?? 0,
                  body: Buffer.concat(chunks).toString("utf8"),
                });
              });
            },
          );
          outbound.on("error", reject);
          outbound.end(payload);
        });
      };

      const publicObject = (body: string) => {
        expect(body).not.toContain(BUSY_START);
        expect(body).not.toContain(BUSY_END);
        expect(body).not.toContain("ALLOW");
        expect(body).not.toContain("ASK");
        expect(body).not.toContain("DENY");
        const parsed = JSON.parse(body) as Record<string, unknown>;
        expect(Object.keys(parsed)).toHaveLength(1);
        return parsed;
      };
      const unavailableAudits = async () => {
        const seen = await resources.audit.read(operator);
        expect(seen.ok).toBe(true);
        if (!seen.ok) {
          throw new Error("fixture");
        }
        return seen.value.filter((event) => event?.requestId === "unavailable");
      };

      let listener = await start();
      const allowed = await post(listener.port, "msg-allow", "req-allow");
      expect(allowed.status).toBe(200);
      expect(publicObject(allowed.body)).toEqual({ result: false });
      expect(publicObject((await post(listener.port, "msg-allow", "req-allow")).body)).toEqual({
        outcome: "unavailable",
      });
      expect(await resources.node.approvals.findByRequestId("req-allow")).toBeNull();
      const allowedAudit = await resources.audit.read(operator);
      expect(allowedAudit.ok).toBe(true);
      if (!allowedAudit.ok) {
        throw new Error("fixture");
      }
      const allowEvent = allowedAudit.value.find((event) => event?.requestId === "req-allow");
      expect(allowEvent).toMatchObject({
        kind: "audit-event",
        category: "disclosure",
        outcome: "released",
        requestId: "req-allow",
      });
      expect(Object.keys(allowEvent ?? {}).sort()).toEqual([
        "category",
        "id",
        "kind",
        "outcome",
        "recordedAt",
        "requestId",
      ]);
      expect(JSON.stringify(allowEvent)).not.toContain(START);
      expect(JSON.stringify(allowEvent)).not.toContain(END);
      const ingressDenial = allowedAudit.value.find((event) => event?.requestId === "unavailable");
      expect(ingressDenial).toMatchObject({
        kind: "audit-event",
        category: "decision",
        outcome: "unavailable",
        requestId: "unavailable",
      });
      expect(Object.keys(ingressDenial ?? {}).sort()).toEqual([
        "category",
        "id",
        "kind",
        "outcome",
        "recordedAt",
        "requestId",
      ]);
      expect(JSON.stringify(ingressDenial)).not.toContain(START);
      expect(JSON.stringify(ingressDenial)).not.toContain(END);
      expect(JSON.stringify(ingressDenial)).not.toContain("msg-allow");

      const freshnessBefore = (await unavailableAudits()).length;
      expect(
        publicObject(
          (
            await post(listener.port, "msg-stale", "req-stale", (value) => {
              value.issuedAt = new Date(ORIGIN - 32_000).toISOString();
              value.expiresAt = new Date(ORIGIN - 31_000).toISOString();
            })
          ).body,
        ),
      ).toEqual({ outcome: "unavailable" });
      expect(
        publicObject(
          (
            await post(listener.port, "msg-future", "req-future", (value) => {
              value.issuedAt = new Date(ORIGIN + 30_001).toISOString();
              value.expiresAt = new Date(ORIGIN + 31_001).toISOString();
            })
          ).body,
        ),
      ).toEqual({ outcome: "unavailable" });
      expect(await resources.node.approvals.findByRequestId("req-stale")).toBeNull();
      expect(await resources.node.approvals.findByRequestId("req-future")).toBeNull();
      const freshnessAudits = await unavailableAudits();
      expect(freshnessAudits.length).toBe(freshnessBefore + 2);
      expect(JSON.stringify(freshnessAudits)).not.toContain("msg-stale");
      expect(JSON.stringify(freshnessAudits)).not.toContain("msg-future");
      expect(JSON.stringify(freshnessAudits)).not.toContain(BUSY_START);
      expect(JSON.stringify(freshnessAudits)).not.toContain(START);

      const senderResponse = await post(listener.port, "msg-sender", "req-sender", undefined, {
        cert: "other.crt",
        key: "other.key",
      });
      expect(senderResponse.status).toBe(200);
      expect(publicObject(senderResponse.body)).toEqual({ outcome: "unavailable" });
      expect(await resources.node.approvals.findByRequestId("req-sender")).toBeNull();
      expect(await resources.node.relationships.readActive(FROM, TO)).toBe(true);
      expect(await resources.node.permissions.readSnapshot(FROM, TO)).toMatchObject({
        decision: "ALLOW",
      });
      const senderAudit = await resources.audit.read(operator);
      expect(senderAudit.ok).toBe(true);
      if (!senderAudit.ok) {
        throw new Error("fixture");
      }
      const senderEvent = senderAudit.value.find((event) => event?.requestId === "req-sender");
      expect(senderEvent).toMatchObject({
        kind: "audit-event",
        category: "decision",
        outcome: "deny",
      });
      expect(Object.keys(senderEvent ?? {}).sort()).toEqual([
        "category",
        "id",
        "kind",
        "outcome",
        "recordedAt",
        "requestId",
      ]);
      expect(JSON.stringify(senderEvent)).not.toContain(BUSY_START);
      expect(JSON.stringify(senderEvent)).not.toContain("ALLOW");

      expect(
        (
          await resources.node.permissions.revoke(permissionSource, {
            contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
            action: "revoke",
            correlationId: "corr-demo-revoke-allow",
            fromAgentId: FROM,
            toAgentId: TO,
            effect: "ALLOW",
            permissionId: allow.value.id,
          })
        ).ok,
      ).toBe(true);
      const ask = await resources.node.permissions.grant(permissionSource, {
        contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
        action: "grant",
        correlationId: "corr-demo-ask",
        fromAgentId: FROM,
        toAgentId: TO,
        effect: "ASK",
      });
      expect(ask.ok).toBe(true);
      if (!ask.ok) {
        throw new Error("fixture");
      }
      expect(publicObject((await post(listener.port, "msg-ask", "req-ask")).body)).toEqual({
        outcome: "unavailable",
      });
      const pending = await resources.node.approvals.findByRequestId("req-ask");
      expect(pending?.status).toBe("pending");
      expect((await resources.node.approvals.approve(approvalSource, pending?.id)).ok).toBe(true);
      await listener.stop();
      listener = await start();
      expect(publicObject((await post(listener.port, "msg-release", "req-ask")).body)).toEqual({
        result: false,
      });
      expect(publicObject((await post(listener.port, "msg-release", "req-ask")).body)).toEqual({
        outcome: "unavailable",
      });
      await listener.stop();
      listener = await start();
      expect(publicObject((await post(listener.port, "msg-release", "req-ask")).body)).toEqual({
        outcome: "unavailable",
      });
      expect((await resources.node.approvals.findByRequestId("req-ask"))?.status).toBe("released");
      expect(publicObject((await post(listener.port, "msg-spent", "req-ask")).body)).toEqual({
        outcome: "unavailable",
      });

      expect(
        (
          await resources.node.permissions.revoke(permissionSource, {
            contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
            action: "revoke",
            correlationId: "corr-demo-revoke-ask",
            fromAgentId: FROM,
            toAgentId: TO,
            effect: "ASK",
            permissionId: ask.value.id,
          })
        ).ok,
      ).toBe(true);
      const deny = await resources.node.permissions.grant(permissionSource, {
        contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
        action: "grant",
        correlationId: "corr-demo-deny",
        fromAgentId: FROM,
        toAgentId: TO,
        effect: "DENY",
      });
      expect(deny.ok).toBe(true);
      if (!deny.ok) {
        throw new Error("fixture");
      }
      expect(await resources.node.relationships.readActive(FROM, TO)).toBe(true);
      expect(await resources.node.permissions.readSnapshot(FROM, TO)).toMatchObject({
        decision: "DENY",
      });
      const deniedResponse = await post(listener.port, "msg-deny", "req-deny");
      expect(deniedResponse.status).toBe(200);
      expect(publicObject(deniedResponse.body)).toEqual({
        outcome: "unavailable",
      });
      expect(await resources.node.approvals.findByRequestId("req-deny")).toBeNull();
      const deniedAudit = await resources.audit.read(operator);
      expect(deniedAudit.ok).toBe(true);
      if (!deniedAudit.ok) {
        throw new Error("fixture");
      }
      expect(deniedAudit.value.find((event) => event?.requestId === "req-deny")).toMatchObject({
        category: "decision",
        outcome: "deny",
      });

      expect(
        publicObject(
          (
            await post(listener.port, "msg-bad", "req-bad", (value) => {
              value.extra = true;
            })
          ).body,
        ),
      ).toEqual({ outcome: "unavailable" });
      expect(
        publicObject(
          (
            await post(listener.port, "msg-recipient", "req-recipient", (value) => {
              value.recipientAgentId = FROM;
            })
          ).body,
        ),
      ).toEqual({ outcome: "unavailable" });
      expect(
        publicObject(
          (
            await post(listener.port, "msg-target", "req-target", (value) => {
              const body = value.body as Record<string, unknown>;
              body.targetAgentId = FROM;
            })
          ).body,
        ),
      ).toEqual({ outcome: "unavailable" });

      expect(
        (
          await resources.node.permissions.revoke(permissionSource, {
            contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
            action: "revoke",
            correlationId: "corr-demo-revoke-deny",
            fromAgentId: FROM,
            toAgentId: TO,
            effect: "DENY",
            permissionId: deny.value.id,
          })
        ).ok,
      ).toBe(true);
      const restored = await resources.node.permissions.grant(permissionSource, {
        contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
        action: "grant",
        correlationId: "corr-demo-allow-again",
        fromAgentId: FROM,
        toAgentId: TO,
        effect: "ALLOW",
      });
      expect(restored.ok).toBe(true);
      expect(await resources.node.relationships.readActive(FROM, TO)).toBe(true);
      expect(await resources.node.permissions.readSnapshot(FROM, TO)).toMatchObject({
        decision: "ALLOW",
      });
      const restoredResponse = await post(listener.port, "msg-allow-again", "req-allow-again");
      expect(restoredResponse.status).toBe(200);
      expect(publicObject(restoredResponse.body)).toEqual({ result: false });
      expect(await resources.node.approvals.findByRequestId("req-allow-again")).toBeNull();
      expect(
        (
          await resources.node.advertisements.withdraw(advertisementSource, {
            contract: SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
            action: "withdraw",
            correlationId: "corr-demo-ad-withdraw",
            agentId: TO,
            skillVersion: AVAILABILITY_SKILL_VERSION_V1,
            advertisementId: advertised.value.id,
          })
        ).ok,
      ).toBe(true);
      expect(
        await resources.node.advertisements.readAdvertised(TO, AVAILABILITY_SKILL_VERSION_V1),
      ).toBe(false);
      expect(await resources.node.relationships.readActive(FROM, TO)).toBe(true);
      expect(await resources.node.permissions.readSnapshot(FROM, TO)).toMatchObject({
        decision: "ALLOW",
      });
      await listener.stop();
      listener = await start();
      const withdrawnResponse = await post(listener.port, "msg-withdrawn", "req-withdrawn");
      expect(withdrawnResponse.status).toBe(200);
      expect(publicObject(withdrawnResponse.body)).toEqual({ outcome: "unavailable" });
      expect(await resources.node.approvals.findByRequestId("req-withdrawn")).toBeNull();
      const withdrawnAudit = await resources.audit.read(operator);
      expect(withdrawnAudit.ok).toBe(true);
      if (!withdrawnAudit.ok) {
        throw new Error("fixture");
      }
      const withdrawnEvent = withdrawnAudit.value.find(
        (event) => event?.requestId === "req-withdrawn",
      );
      expect(withdrawnEvent).toMatchObject({
        category: "decision",
        outcome: "deny",
      });
      expect(JSON.stringify(withdrawnEvent)).not.toContain(START);
      expect(JSON.stringify(withdrawnEvent)).not.toContain(END);
      expect(JSON.stringify(withdrawnEvent)).not.toContain(BUSY_START);
      expect(JSON.stringify(withdrawnEvent)).not.toContain(BUSY_END);
      expect(JSON.stringify(withdrawnEvent)).not.toContain("ALLOW");
      expect(JSON.stringify(withdrawnEvent)).not.toContain("withdrawn");
      expect(
        (
          await resources.node.advertisements.advertise(advertisementSource, {
            contract: SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
            action: "advertise",
            correlationId: "corr-demo-ad-again",
            agentId: TO,
            skillVersion: AVAILABILITY_SKILL_VERSION_V1,
          })
        ).ok,
      ).toBe(true);
      expect(
        await resources.node.advertisements.readAdvertised(TO, AVAILABILITY_SKILL_VERSION_V1),
      ).toBe(true);
      expect(
        (
          await resources.node.relationships.revoke(relationshipSource, {
            contract: RELATIONSHIP_COMMAND_CONTRACT_V1,
            action: "revoke",
            correlationId: "corr-demo-rel-revoke",
            fromAgentId: FROM,
            toAgentId: TO,
            relationshipId: created.value.id,
          })
        ).ok,
      ).toBe(true);
      expect(await resources.node.relationships.readActive(FROM, TO)).toBe(false);
      expect(await resources.node.permissions.readSnapshot(FROM, TO)).toMatchObject({
        decision: "ALLOW",
      });
      await listener.stop();
      listener = await start();
      const revokedResponse = await post(listener.port, "msg-rel-revoked", "req-rel-revoked");
      expect(revokedResponse.status).toBe(200);
      expect(publicObject(revokedResponse.body)).toEqual({ outcome: "unavailable" });
      expect(await resources.node.approvals.findByRequestId("req-rel-revoked")).toBeNull();
      const revokedAudit = await resources.audit.read(operator);
      expect(revokedAudit.ok).toBe(true);
      if (!revokedAudit.ok) {
        throw new Error("fixture");
      }
      const revokedEvent = revokedAudit.value.find(
        (event) => event?.requestId === "req-rel-revoked",
      );
      expect(revokedEvent).toMatchObject({
        category: "decision",
        outcome: "deny",
      });
      expect(JSON.stringify(revokedEvent)).not.toContain(START);
      expect(JSON.stringify(revokedEvent)).not.toContain(END);
      expect(JSON.stringify(revokedEvent)).not.toContain("ALLOW");
      expect(JSON.stringify(revokedEvent)).not.toContain(BUSY_START);
      expect(JSON.stringify(revokedEvent)).not.toContain(BUSY_END);
      const recorded = await resources.audit.read(operator);
      expect(recorded.ok).toBe(true);
      if (!recorded.ok) {
        throw new Error("fixture");
      }
      const recordedText = JSON.stringify(recorded.value);
      expect(recordedText).not.toContain(BUSY_START);
      expect(recordedText).not.toContain(BUSY_END);
      expect(recordedText).not.toContain("false");
      expect(recordedText).not.toContain("true");
      for (const output of outputs) {
        const text = output();
        expect(text).not.toContain(BUSY_START);
        expect(text).not.toContain(BUSY_END);
      }
      await listener.stop();
    } finally {
      for (const child of children) {
        if (child.exitCode === null) {
          child.kill();
        }
      }
      for (const id of [...LOCKS].reverse()) {
        await lock.query("SELECT pg_advisory_unlock($1)", [id]);
      }
      lock.release();
      await resources.close();
    }
  }, 180_000);
});
