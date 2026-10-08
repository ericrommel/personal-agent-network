import { once } from "node:events";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createAgentIdentity } from "../../src/modules/identity/index.js";
import { openDurableAvailabilityResources } from "../../src/runtime/durable-availability-resources.js";
import { createRemoteHttpsServer } from "../../src/runtime/remote-https-server.js";

const enabled = process.env.PAN_DURABLE_INGRESS === "1";

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`missing ${name}`);
  }
  return value;
};

describe.skipIf(!enabled)("durable ingress listener", () => {
  it("listens until the stop file appears", async () => {
    const origin = Number(required("PAN_CLOCK_ORIGIN"));
    const localAgentId = required("PAN_LOCAL_AGENT_ID");
    const fromId = required("PAN_FROM_AGENT_ID");
    const ownerId = required("PAN_OWNER_ID");
    expect(Number.isSafeInteger(origin)).toBe(true);
    const from = createAgentIdentity(fromId, ownerId, "active");
    const to = createAgentIdentity(localAgentId, ownerId, "active");
    if (!from.ok || !to.ok) {
      throw new Error("fixture");
    }
    const resources = await openDurableAvailabilityResources(
      required("PAN_RELATIONSHIP_DATABASE_URL"),
      {
        clock: {
          now: () => new Date(origin).toISOString(),
          nowMs: () => origin,
        },
        agents: [from.value, to.value],
        localAgentId,
      },
    );
    const server = createRemoteHttpsServer(
      {
        key: readFileSync(required("PAN_TLS_KEY")),
        cert: readFileSync(required("PAN_TLS_CERT")),
        ca: readFileSync(required("PAN_TLS_CA")),
      },
      resources.dependencies,
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("port");
    }
    writeFileSync(required("PAN_INGRESS_PORT_FILE"), String(address.port));
    const stopFile = required("PAN_INGRESS_STOP_FILE");
    while (!existsSync(stopFile)) {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
    server.close();
    await once(server, "close");
    await resources.close();
  }, 120_000);
});
