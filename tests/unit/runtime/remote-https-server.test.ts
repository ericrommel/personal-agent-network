import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Agent, request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AuditEvent } from "../../../src/modules/audit/index.js";
import {
  AVAILABILITY_ENVELOPE_CONTRACT_V1,
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_REQUEST_CONTRACT_V1,
  AVAILABILITY_SCOPE_V1,
  InMemoryReplayStore,
} from "../../../src/modules/messaging/index.js";
import {
  createRemoteHttpsServer,
  MAX_REMOTE_BODY_BYTES,
  peerUriSan,
  REMOTE_AVAILABILITY_PATH,
  type RemoteHttpsDependencies,
  receiveRemoteAvailability,
  uriSanFromPeerCertificate,
} from "../../../src/runtime/remote-https-server.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const SAN = `urn:pan:agent:${FROM}`;

const envelope = (messageId = "msg-1", issuedAt = "2026-10-08T12:00:00.000Z") =>
  JSON.stringify({
    contract: AVAILABILITY_ENVELOPE_CONTRACT_V1,
    messageId,
    issuedAt,
    expiresAt: "2026-10-08T12:05:00.000Z",
    recipientAgentId: TO,
    body: {
      contract: AVAILABILITY_REQUEST_CONTRACT_V1,
      requestId: "req-1",
      targetAgentId: TO,
      purpose: AVAILABILITY_PURPOSE_V1,
      scope: AVAILABILITY_SCOPE_V1,
      start: "2026-10-08T12:01:00.000Z",
      end: "2026-10-08T13:00:00.000Z",
    },
  });

const socketWith = (san: string | null, options?: { readonly throwOnRead?: boolean }) => ({
  authorized: true,
  getPeerCertificate() {
    if (options?.throwOnRead) {
      throw new Error("cert down");
    }
    return san === null ? { subjectaltname: "DNS:localhost" } : { subjectaltname: `URI:${san}` };
  },
});

const incoming = (
  chunks: readonly unknown[],
  overrides: Record<string, unknown> = {},
): IncomingMessage => {
  const request = {
    method: "POST",
    url: REMOTE_AVAILABILITY_PATH,
    headers: { "content-type": "application/json" },
    socket: socketWith(SAN),
    destroy() {
      return undefined;
    },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
    ...overrides,
  };
  return request as unknown as IncomingMessage;
};

class FakeResponse {
  statusCode = 0;
  headersSent = false;
  writableEnded = false;
  destroyed = false;
  body = "";
  readonly headers: Record<string, string> = {};
  headerThrows = 0;
  endThrows = false;

  setHeader(name: string, value: string): void {
    if (this.headerThrows > 0) {
      this.headerThrows -= 1;
      throw new Error("header down");
    }
    this.headers[name] = value;
  }

  end(payload: string, flushed?: () => void): void {
    if (this.endThrows) {
      this.headersSent = true;
      throw new Error("end down");
    }
    this.body = payload;
    this.headersSent = true;
    this.writableEnded = true;
    flushed?.();
  }

  destroy(): void {
    this.destroyed = true;
  }
}

const INGRESS_DENIAL = {
  kind: "audit-event",
  category: "decision",
  requestId: "unavailable",
  outcome: "unavailable",
};

const acceptedAudit = {
  async append(): Promise<{ ok: true; value: AuditEvent }> {
    return { ok: true, value: undefined as unknown as AuditEvent };
  },
};

const recordingAudit = (events: unknown[]): RemoteHttpsDependencies["audit"] => ({
  async append(_operator, command) {
    events.push(command);
    return { ok: true, value: undefined as unknown as AuditEvent };
  },
});

const dependencies = (
  handle: RemoteHttpsDependencies["handle"],
  store = new InMemoryReplayStore(),
  nowMs: () => number = () => NOW,
  audit: RemoteHttpsDependencies["audit"] = acceptedAudit,
): RemoteHttpsDependencies => ({
  localAgentId: TO,
  nowMs,
  store,
  audit,
  handle,
});

const receive = async (
  request: IncomingMessage,
  deps: RemoteHttpsDependencies,
  response = new FakeResponse(),
) => {
  await receiveRemoteAvailability(request, response as unknown as ServerResponse, deps);
  return response;
};

describe("mutual-TLS availability ingress", () => {
  it("reads one URI SAN and rejects every other certificate shape", () => {
    expect(uriSanFromPeerCertificate({ subjectaltname: `DNS:localhost, URI:${SAN}` })).toBe(SAN);
    expect(uriSanFromPeerCertificate({ subjectaltname: `URI:${SAN}, DNS:localhost` })).toBe(SAN);
    expect(peerUriSan(socketWith(SAN))).toBe(SAN);
    const rejected = [
      null,
      "cert",
      [],
      {},
      { subjectaltname: "" },
      { subjectaltname: 1 },
      { subjectaltname: "DNS:localhost" },
      { subjectaltname: "URI:" },
      { subjectaltname: `URI:${SAN}, URI:${SAN}` },
      { subjectaltname: `URI:${SAN}, URI:` },
    ];
    for (const certificate of rejected) {
      expect(uriSanFromPeerCertificate(certificate)).toBeNull();
    }
    expect(peerUriSan(1)).toBeNull();
    expect(peerUriSan(null)).toBeNull();
    expect(peerUriSan({ authorized: false, getPeerCertificate: () => ({}) })).toBeNull();
    expect(peerUriSan({ authorized: true })).toBeNull();
    expect(peerUriSan({ authorized: true, getPeerCertificate: "no" })).toBeNull();
    expect(peerUriSan(socketWith(SAN, { throwOnRead: true }))).toBeNull();
  });

  it("returns the boolean for one fresh envelope and denies the replay", async () => {
    const store = new InMemoryReplayStore();
    const seen: string[] = [];
    const handle: RemoteHttpsDependencies["handle"] = async (principal, body) => {
      seen.push(`${principal.agentId}:${principal.authenticatedAt}:${body.requestId}`);
      return { result: true };
    };
    const recorded: unknown[] = [];
    const deps = dependencies(handle, store, () => NOW, recordingAudit(recorded));
    const first = await receive(incoming([Buffer.from(envelope())]), deps);
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(JSON.parse(first.body)).toEqual({ result: true });
    expect(seen).toEqual([`${FROM}:${new Date(NOW).toISOString()}:req-1`]);

    const skewed = JSON.parse(envelope("msg-2")) as { issuedAt: string };
    skewed.issuedAt = new Date(NOW + 30_000).toISOString();
    const second = await receive(incoming([JSON.stringify(skewed)]), deps);
    expect(JSON.parse(second.body)).toEqual({ result: true });
    expect(seen[1]).toBe(`${FROM}:${new Date(NOW).toISOString()}:req-1`);
    const typed = envelope("msg-typed");
    const typedResponse = await receive(
      incoming([typed], {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-length": String(Buffer.byteLength(typed)),
        },
      }),
      deps,
    );
    expect(JSON.parse(typedResponse.body)).toEqual({ result: true });
    expect(recorded).toEqual([]);

    const replay = await receive(incoming([Buffer.from(envelope())]), deps);
    expect(JSON.parse(replay.body)).toEqual({ outcome: "unavailable" });
    expect(seen).toHaveLength(3);
    expect(recorded).toEqual([INGRESS_DENIAL]);
  });

  it("fails closed before the handler for transport and envelope defects", async () => {
    let calls = 0;
    const handle: RemoteHttpsDependencies["handle"] = async () => {
      calls += 1;
      return { result: false };
    };
    const recorded: unknown[] = [];
    const audit = recordingAudit(recorded);
    const deps = dependencies(handle, new InMemoryReplayStore(), () => NOW, audit);
    const cases: IncomingMessage[] = [
      incoming([envelope()], { method: "GET" }),
      incoming([envelope()], { url: "/other" }),
      incoming([envelope()], { headers: { "content-type": "text/plain" } }),
      incoming([envelope()], { headers: { "content-type": ["application/json"] } }),
      incoming([envelope()], {
        headers: {
          "content-type": "application/json",
          "content-length": String(MAX_REMOTE_BODY_BYTES + 1),
        },
      }),
      incoming([envelope()], {
        headers: { "content-type": "application/json", "content-length": "nope" },
      }),
      incoming([envelope()], {
        headers: { "content-type": "application/json", "content-length": "9".repeat(20) },
      }),
      incoming([envelope()], {
        headers: { "content-type": "application/json", "content-length": ["16"] },
      }),
      incoming(["{"]),
      incoming([1]),
      incoming(["x".repeat(MAX_REMOTE_BODY_BYTES + 1)]),
      incoming([envelope()], { socket: socketWith(null) }),
      incoming([Buffer.from(envelope("msg-1", "not-a-date"))]),
    ];
    for (const request of cases) {
      const response = await receive(request, deps);
      expect(JSON.parse(response.body)).toEqual({ outcome: "unavailable" });
    }
    expect(calls).toBe(0);

    const broken = incoming([envelope("msg-broken")]);
    broken[Symbol.asyncIterator] = async function* brokenIterator() {
      yield Buffer.from("{");
      throw new Error("stream down");
    };
    expect(JSON.parse((await receive(broken, deps)).body)).toEqual({ outcome: "unavailable" });

    const clock = await receive(
      incoming([envelope("msg-clock")]),
      dependencies(
        handle,
        new InMemoryReplayStore(),
        () => {
          throw new Error("clock down");
        },
        audit,
      ),
    );
    expect(JSON.parse(clock.body)).toEqual({ outcome: "unavailable" });
    expect(calls).toBe(0);
    expect(recorded).toEqual(Array.from({ length: 15 }, () => INGRESS_DENIAL));

    const failing = dependencies(handle, new InMemoryReplayStore(), () => NOW, {
      async append() {
        throw new Error("audit down");
      },
    });
    const auditDown = await receive(incoming([envelope()], { method: "GET" }), failing);
    expect(JSON.parse(auditDown.body)).toEqual({ outcome: "unavailable" });
    expect(calls).toBe(0);
  });

  it("hides a handler result that is not the public contract", async () => {
    const bodies: unknown[] = [
      { result: false },
      { outcome: "unavailable" },
      { result: true, reason: "allow" },
      { result: "yes" },
      { outcome: "deny" },
      Object.create(null, { result: { value: true, enumerable: true } }),
      (() => {
        const value = { result: true };
        Object.defineProperty(value, "reason", { enumerable: true, get: () => "leak" });
        return value;
      })(),
      null,
      [],
      Object.assign(Object.create({ extra: true }), { result: true }),
      { [Symbol("leak")]: true },
    ];
    const recorded: unknown[] = [];
    const responses: string[] = [];
    for (const body of bodies) {
      const response = await receive(
        incoming([envelope(`msg-${responses.length}`)]),
        dependencies(
          async () => body as never,
          new InMemoryReplayStore(),
          () => NOW,
          recordingAudit(recorded),
        ),
      );
      responses.push(response.body);
    }
    expect(responses.map((body) => JSON.parse(body))).toEqual([
      { result: false },
      { outcome: "unavailable" },
      { outcome: "unavailable" },
      { outcome: "unavailable" },
      { outcome: "unavailable" },
      { result: true },
      { outcome: "unavailable" },
      { outcome: "unavailable" },
      { outcome: "unavailable" },
      { outcome: "unavailable" },
      { outcome: "unavailable" },
    ]);

    const thrown = await receive(
      incoming([envelope("msg-throw")]),
      dependencies(
        () => Promise.reject(new Error("handler down")),
        new InMemoryReplayStore(),
        () => NOW,
        recordingAudit(recorded),
      ),
    );
    expect(JSON.parse(thrown.body)).toEqual({ outcome: "unavailable" });
    expect(recorded).toEqual([]);
  });

  it("destroys the response when the denial cannot be written", async () => {
    const onceHeader = new FakeResponse();
    onceHeader.headerThrows = 1;
    await receiveRemoteAvailability(
      incoming([envelope("msg-header")]),
      onceHeader as unknown as ServerResponse,
      dependencies(async () => ({ result: true })),
    );
    expect(JSON.parse(onceHeader.body)).toEqual({ outcome: "unavailable" });
    expect(onceHeader.destroyed).toBe(false);

    const always = new FakeResponse();
    always.headerThrows = 5;
    await receiveRemoteAvailability(
      incoming([envelope("msg-always")]),
      always as unknown as ServerResponse,
      dependencies(async () => ({ result: true })),
    );
    expect(always.destroyed).toBe(true);

    const ended = new FakeResponse();
    ended.endThrows = true;
    await receiveRemoteAvailability(
      incoming([envelope("msg-ended")]),
      ended as unknown as ServerResponse,
      dependencies(async () => ({ result: true })),
    );
    expect(ended.destroyed).toBe(true);
    expect(ended.body).toBe("");
  });

  it("completes one handshake and denies oversized uploads", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pan-mtls-"));
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
    const file = (name: string) => readFileSync(join(directory, name));
    let calls = 0;
    const server = createRemoteHttpsServer(
      { key: file("server.key"), cert: file("server.crt"), ca: file("ca.crt") },
      dependencies(async () => {
        calls += 1;
        return { result: true };
      }),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("port");
    }
    const post = (
      payload: Buffer,
      cert: { cert: Buffer; key: Buffer } | undefined,
      headers?: Record<string, string>,
      agent: Agent | false = false,
    ) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const outbound = httpsRequest(
          {
            host: "127.0.0.1",
            port: address.port,
            servername: "localhost",
            path: REMOTE_AVAILABILITY_PATH,
            method: "POST",
            ca: file("ca.crt"),
            cert: cert?.cert,
            key: cert?.key,
            rejectUnauthorized: true,
            agent,
            headers: headers ?? {
              "content-type": "application/json",
              "content-length": String(payload.length),
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
    try {
      const client = { cert: file("client.crt"), key: file("client.key") };
      const live = await post(Buffer.from(envelope("msg-live")), client);
      expect(live.status).toBe(200);
      expect(JSON.parse(live.body)).toEqual({ result: true });
      const replay = await post(Buffer.from(envelope("msg-live")), client);
      expect(JSON.parse(replay.body)).toEqual({ outcome: "unavailable" });
      await expect(post(Buffer.from(envelope("msg-live")), undefined)).rejects.toThrow();
      const oversized = Buffer.alloc(MAX_REMOTE_BODY_BYTES + 1, 0x78);
      const declared = await post(oversized, client);
      expect(declared.status).toBe(200);
      expect(JSON.parse(declared.body)).toEqual({ outcome: "unavailable" });
      const postWithoutLength = (agent: Agent | false) =>
        new Promise<{ status: number; body: string }>((resolve, reject) => {
          const outbound = httpsRequest(
            {
              host: "127.0.0.1",
              port: address.port,
              servername: "localhost",
              path: REMOTE_AVAILABILITY_PATH,
              method: "POST",
              ca: file("ca.crt"),
              cert: client.cert,
              key: client.key,
              rejectUnauthorized: true,
              agent,
              headers: { "content-type": "application/json" },
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
          outbound.write(oversized.subarray(0, 1024));
          outbound.end(oversized.subarray(1024));
        });
      const streamed = await postWithoutLength(false);
      expect(streamed.status).toBe(200);
      expect(JSON.parse(streamed.body)).toEqual({ outcome: "unavailable" });
      const pooled = new Agent({ keepAlive: true });
      const pooledDeclared = await post(oversized, client, undefined, pooled);
      expect(pooledDeclared.status).toBe(200);
      expect(JSON.parse(pooledDeclared.body)).toEqual({ outcome: "unavailable" });
      const pooledStream = await postWithoutLength(pooled);
      expect(pooledStream.status).toBe(200);
      expect(JSON.parse(pooledStream.body)).toEqual({ outcome: "unavailable" });
      pooled.destroy();
      expect(calls).toBe(1);
    } finally {
      server.close();
      await once(server, "close");
    }
  }, 20_000);
});
