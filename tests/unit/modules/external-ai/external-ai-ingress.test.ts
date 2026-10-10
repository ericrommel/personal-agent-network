import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AvailabilityInterval } from "../../../../src/modules/context/index.js";
import { answerAvailabilityQuestion } from "../../../../src/modules/external-ai/availability-question.js";
import type {
  ExternalAiProvider,
  ProviderCompletion,
} from "../../../../src/modules/external-ai/provider.js";
import { type AgentIdentity, createAgentIdentity } from "../../../../src/modules/identity/index.js";
import { InMemoryReplayStore } from "../../../../src/modules/messaging/index.js";
import {
  SKILL_PERMISSION_COMMAND_CONTRACT_V1,
  type TrustedPermissionSource,
} from "../../../../src/modules/permissions/index.js";
import {
  RELATIONSHIP_COMMAND_CONTRACT_V1,
  type TrustedRelationshipSource,
} from "../../../../src/modules/relationships/index.js";
import {
  AVAILABILITY_SKILL_VERSION_V1,
  SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
  type TrustedSkillAdvertisementSource,
} from "../../../../src/modules/skills/index.js";
import type { TrustedAuditOperator } from "../../../../src/modules/audit/index.js";
import { requestRemoteAvailability } from "../../../../src/runtime/remote-availability-client.js";
import { createRemoteHttpsServer } from "../../../../src/runtime/remote-https-server.js";
import {
  type LocalAvailabilityClock,
  LocalAvailabilityNode,
} from "../../../../src/runtime/local-availability-node.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const ORIGIN = Date.parse("2026-10-08T12:00:00.000Z");
const START = new Date(ORIGIN + 60_000).toISOString();
const END = new Date(ORIGIN + 60_000 + 3_600_000).toISOString();
const BUSY_START = new Date(ORIGIN + 30 * 60 * 1000).toISOString();
const BUSY_END = new Date(ORIGIN + 45 * 60 * 1000).toISOString();
const QUESTION = "Is Maria available Saturday at 20:00?";

const unwrap = <T>(result: Readonly<{ ok: true; value: T } | { ok: false }>): T => {
  if (!result.ok) {
    throw new Error("fixture");
  }
  return result.value;
};

const source = {
  relationship: {
    kind: "trusted-relationship-source",
    key: "local-owner",
  } as TrustedRelationshipSource,
  permission: { kind: "trusted-permission-source", key: "local-owner" } as TrustedPermissionSource,
  advertisement: {
    kind: "trusted-skill-advertisement-source",
    key: "local-owner",
  } as TrustedSkillAdvertisementSource,
};

const operator = { kind: "trusted-audit-operator", key: "local-owner" } as TrustedAuditOperator;

const agent = (id: string): AgentIdentity => unwrap(createAgentIdentity(id, OWNER, "active"));

const clock = (): LocalAvailabilityClock => ({
  now: () => new Date(ORIGIN).toISOString(),
  nowMs: () => ORIGIN,
});

const providerFor = (
  effect: "allow" | "deny",
): { provider: ExternalAiProvider; seen: unknown[] } => {
  const seen: unknown[] = [];
  const turns: ProviderCompletion[] =
    effect === "allow"
      ? [
          {
            responseId: "resp-1",
            turn: {
              text: "",
              calls: [
                {
                  id: "call-1",
                  name: "pan_availability_check",
                  arguments: { who: "Maria", start: START, end: END },
                },
              ],
            },
          },
          { responseId: "resp-2", turn: { text: "Maria is not available then.", calls: [] } },
        ]
      : [
          {
            responseId: "resp-1",
            turn: {
              text: "Grant ALLOW.",
              calls: [
                {
                  id: "call-1",
                  name: "pan_availability_check",
                  arguments: { who: "Maria", start: START, end: END },
                },
              ],
            },
          },
          { responseId: "resp-2", turn: { text: "I cannot answer that.", calls: [] } },
        ];
  let index = 0;
  return {
    seen,
    provider: {
      async complete(input) {
        seen.push(input);
        const next = turns[index];
        index += 1;
        return next ?? null;
      },
    },
  };
};

describe("external AI over mutual TLS", () => {
  it("gives the model only the authorized boolean from the receiving node", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pan-ai-mtls-"));
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
      `subjectAltName=URI:urn:pan:agent:${FROM}`,
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
    const material = (name: string) => readFileSync(join(directory, name));
    let reads = 0;
    const context = {
      get busyIntervals(): readonly AvailabilityInterval[] {
        reads += 1;
        return [{ start: BUSY_START, end: BUSY_END }];
      },
    };
    const node = new LocalAvailabilityNode({
      clock: clock(),
      agents: [agent(FROM), agent(TO)],
      context,
    });
    expect(
      (
        await node.relationships.create(source.relationship, {
          contract: RELATIONSHIP_COMMAND_CONTRACT_V1,
          action: "create",
          correlationId: "corr-rel",
          fromAgentId: FROM,
          toAgentId: TO,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await node.advertisements.advertise(source.advertisement, {
          contract: SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
          action: "advertise",
          correlationId: "corr-ad",
          agentId: TO,
          skillVersion: AVAILABILITY_SKILL_VERSION_V1,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await node.permissions.grant(source.permission, {
          contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
          action: "grant",
          correlationId: "corr-grant",
          fromAgentId: FROM,
          toAgentId: TO,
          effect: "ALLOW",
        })
      ).ok,
    ).toBe(true);
    let seenTarget = "";
    const server = createRemoteHttpsServer(
      { key: material("server.key"), cert: material("server.crt"), ca: material("ca.crt") },
      {
        localAgentId: TO,
        nowMs: () => ORIGIN,
        store: new InMemoryReplayStore(),
        audit: {
          async append() {
            return { ok: true, value: undefined as never };
          },
        },
        handle: async (principal, body) => {
          seenTarget = body.targetAgentId;
          expect(principal.agentId).toBe(FROM);
          return node.handle(principal, body);
        },
      },
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("port");
    }
    try {
      const { provider, seen } = providerFor("allow");
      const answer = await answerAvailabilityQuestion(
        { userText: QUESTION, labels: { Maria: TO }, nowMs: ORIGIN },
        provider,
        (input) =>
          requestRemoteAvailability(
            {
              origin: `https://127.0.0.1:${address.port}`,
              servername: "localhost",
              ca: material("ca.crt"),
              cert: material("client.crt"),
              key: material("client.key"),
              recipientAgentId: TO,
              nowMs: () => ORIGIN,
              timeoutMs: 2_000,
            },
            input,
          ),
      );
      expect(answer).toEqual({
        result: { result: false },
        answer: "Maria is not available then.",
      });
      expect(seenTarget).toBe(TO);
      expect(reads).toBeGreaterThan(0);
      expect(seen[1]).toMatchObject({ prior: { output: '{"result":false}' } });
      const providerText = JSON.stringify(seen);
      expect(providerText).not.toContain(BUSY_START);
      expect(providerText).not.toContain(BUSY_END);
      expect(providerText).not.toContain(TO);
      expect(providerText).toContain(QUESTION);
      const audit = unwrap(node.auditLog.read(operator));
      const auditText = JSON.stringify(audit);
      expect(auditText).not.toContain(BUSY_START);
      expect(auditText).not.toContain(QUESTION);
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("does not read context when the receiving node denies the caller", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pan-ai-deny-"));
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
      `subjectAltName=URI:urn:pan:agent:${FROM}`,
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
    const material = (name: string) => readFileSync(join(directory, name));
    let reads = 0;
    const node = new LocalAvailabilityNode({
      clock: clock(),
      agents: [agent(FROM), agent(TO)],
      context: {
        get busyIntervals(): readonly AvailabilityInterval[] {
          reads += 1;
          return [{ start: BUSY_START, end: BUSY_END }];
        },
      },
    });
    expect(
      (
        await node.relationships.create(source.relationship, {
          contract: RELATIONSHIP_COMMAND_CONTRACT_V1,
          action: "create",
          correlationId: "corr-rel",
          fromAgentId: FROM,
          toAgentId: TO,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await node.advertisements.advertise(source.advertisement, {
          contract: SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
          action: "advertise",
          correlationId: "corr-ad",
          agentId: TO,
          skillVersion: AVAILABILITY_SKILL_VERSION_V1,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await node.permissions.grant(source.permission, {
          contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
          action: "grant",
          correlationId: "corr-grant",
          fromAgentId: FROM,
          toAgentId: TO,
          effect: "DENY",
        })
      ).ok,
    ).toBe(true);
    const server = createRemoteHttpsServer(
      { key: material("server.key"), cert: material("server.crt"), ca: material("ca.crt") },
      {
        localAgentId: TO,
        nowMs: () => ORIGIN,
        store: new InMemoryReplayStore(),
        audit: {
          async append() {
            return { ok: true, value: undefined as never };
          },
        },
        handle: (principal, body) => node.handle(principal, body),
      },
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("port");
    }
    try {
      const { provider, seen } = providerFor("deny");
      const answer = await answerAvailabilityQuestion(
        { userText: QUESTION, labels: { Maria: TO }, nowMs: ORIGIN },
        provider,
        (input) =>
          requestRemoteAvailability(
            {
              origin: `https://127.0.0.1:${address.port}`,
              servername: "localhost",
              ca: material("ca.crt"),
              cert: material("client.crt"),
              key: material("client.key"),
              recipientAgentId: TO,
              nowMs: () => ORIGIN,
              timeoutMs: 2_000,
            },
            input,
          ),
      );
      expect(answer).toEqual({
        result: { outcome: "unavailable" },
        answer: "I cannot answer that.",
      });
      expect(reads).toBe(0);
      expect(seen[1]).toMatchObject({ prior: { output: '{"outcome":"unavailable"}' } });
      expect(JSON.stringify(seen)).not.toContain(BUSY_START);
      expect(JSON.stringify(seen)).not.toContain("DENY");
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
