import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestRemoteAvailability } from "../../../src/runtime/remote-availability-client.js";
import { unavailable } from "../../../src/modules/messaging/index.js";

const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OTHER = "pan_agent_11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const START = "2026-10-08T12:01:00.000Z";
const END = "2026-10-08T13:01:00.000Z";

const directory = mkdtempSync(join(tmpdir(), "pan-ai-client-"));
const file = (name: string) => readFileSync(join(directory, name));

describe("remote availability client", () => {
  let port = 0;
  let mode = "true";
  let server: ReturnType<typeof createHttpsServer>;

  beforeAll(async () => {
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
      `subjectAltName=URI:urn:pan:agent:${OTHER}`,
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
    server = createHttpsServer(
      { key: file("server.key"), cert: file("server.crt"), ca: file("ca.crt") },
      (_request, response) => {
        if (mode === "hang") {
          return;
        }
        if (mode === "status") {
          response.writeHead(500, { "content-type": "application/json" });
          response.end('{"result":true}');
          return;
        }
        if (mode === "type") {
          response.writeHead(200, { "content-type": "text/plain" });
          response.end('{"result":true}');
          return;
        }
        if (mode === "junk") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end("nope");
          return;
        }
        if (mode === "extra") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end('{"result":true,"why":"busy"}');
          return;
        }
        if (mode === "big") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(`{"pad":"${"x".repeat(20_000)}"}`);
          return;
        }
        if (mode === "charset") {
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          response.end('{"result":true}');
          return;
        }
        if (mode === "notype") {
          response.writeHead(200);
          response.end('{"result":true}');
          return;
        }
        if (mode === "destroy") {
          response.writeHead(200, { "content-type": "application/json" });
          response.destroy(new Error("cut"));
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(mode === "false" ? '{"result":false}' : '{"result":true}');
      },
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("port");
    }
    port = address.port;
  });

  afterAll(async () => {
    server.close();
    await once(server, "close");
  });

  const client = (overrides: Partial<Parameters<typeof requestRemoteAvailability>[0]> = {}) => ({
    origin: `https://127.0.0.1:${port}`,
    servername: "localhost",
    ca: file("ca.crt"),
    cert: file("client.crt"),
    key: file("client.key"),
    recipientAgentId: TO,
    nowMs: () => NOW,
    timeoutMs: 1_000,
    ...overrides,
  });

  it("returns only the public object from a mutual-TLS peer", async () => {
    mode = "true";
    expect(
      await requestRemoteAvailability(client(), { targetAgentId: TO, start: START, end: END }),
    ).toEqual({ result: true });
    mode = "false";
    expect(
      await requestRemoteAvailability(client(), { targetAgentId: TO, start: START, end: END }),
    ).toEqual({ result: false });
  });

  it("fails closed on a bad peer, clock, interval, or response", async () => {
    const ask = { targetAgentId: TO, start: START, end: END };
    expect(await requestRemoteAvailability(client({ recipientAgentId: OTHER }), ask)).toEqual(
      unavailable(),
    );
    expect(await requestRemoteAvailability(client({ recipientAgentId: "nope" }), ask)).toEqual(
      unavailable(),
    );
    expect(
      await requestRemoteAvailability(client(), { targetAgentId: "nope", start: START, end: END }),
    ).toEqual(unavailable());
    expect(
      await requestRemoteAvailability(client({ nowMs: () => "now" as unknown as number }), ask),
    ).toEqual(unavailable());
    expect(await requestRemoteAvailability(client({ timeoutMs: 30_001 }), ask)).toEqual(
      unavailable(),
    );
    expect(await requestRemoteAvailability(client({ timeoutMs: 1.5 }), ask)).toEqual(unavailable());
    expect(await requestRemoteAvailability(client({ servername: ".." }), ask)).toEqual(
      unavailable(),
    );
    expect(
      await requestRemoteAvailability(client({ servername: 4 as unknown as string }), ask),
    ).toEqual(unavailable());
    expect(await requestRemoteAvailability(client({ nowMs: () => 1.5 }), ask)).toEqual(
      unavailable(),
    );
    expect(await requestRemoteAvailability(client({ timeoutMs: 0 }), ask)).toEqual(unavailable());
    expect(await requestRemoteAvailability(client({ servername: "bad name" }), ask)).toEqual(
      unavailable(),
    );
    expect(await requestRemoteAvailability(client({ origin: "http://127.0.0.1:1" }), ask)).toEqual(
      unavailable(),
    );
    expect(
      await requestRemoteAvailability(client({ origin: "https://user:pw@127.0.0.1:1" }), ask),
    ).toEqual(unavailable());
    expect(
      await requestRemoteAvailability(client({ origin: "https://127.0.0.1:1/extra" }), ask),
    ).toEqual(unavailable());
    expect(
      await requestRemoteAvailability(client({ origin: "https://127.0.0.1:1/?q=1" }), ask),
    ).toEqual(unavailable());
    expect(await requestRemoteAvailability(client({ origin: "https://127.0.0.1:0" }), ask)).toEqual(
      unavailable(),
    );
    expect(await requestRemoteAvailability(client({ origin: "not a url" }), ask)).toEqual(
      unavailable(),
    );
    expect(
      await requestRemoteAvailability(client({ origin: "https://127.0.0.1/#x" }), ask),
    ).toEqual(unavailable());
    expect(
      await requestRemoteAvailability(client({ origin: "https://127.0.0.1", timeoutMs: 200 }), ask),
    ).toEqual(unavailable());
    expect(
      await requestRemoteAvailability(client(), {
        targetAgentId: TO,
        start: "2026-10-08T11:00:00.000Z",
        end: END,
      }),
    ).toEqual(unavailable());
    expect(
      await requestRemoteAvailability(
        client({
          nowMs: () => {
            throw new Error("clock");
          },
        }),
        ask,
      ),
    ).toEqual(unavailable());

    for (const next of ["status", "type", "junk", "extra", "big", "notype", "destroy"] as const) {
      mode = next;
      expect(await requestRemoteAvailability(client(), ask)).toEqual(unavailable());
    }
    mode = "charset";
    expect(await requestRemoteAvailability(client(), ask)).toEqual({ result: true });
    mode = "hang";
    expect(await requestRemoteAvailability(client({ timeoutMs: 50 }), ask)).toEqual(unavailable());
    expect(
      await requestRemoteAvailability(
        client({ origin: "https://127.0.0.1:1", timeoutMs: 200 }),
        ask,
      ),
    ).toEqual(unavailable());
  });
});
