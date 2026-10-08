import { describe, expect, it } from "vitest";
import { LocalAvailabilityNode } from "../../../src/runtime/local-availability-node.js";
import {
  runAvailabilityCli,
  type AvailabilityCliNode,
} from "../../../src/runtime/availability-cli.js";

const ORIGIN = Date.parse("2026-10-08T12:00:00.000Z");
const principal = JSON.stringify({ schema: "nope" });
const body = JSON.stringify({ contract: "pan.availability-request/v1" });

const nodeReturning = (
  response: { result: boolean } | { outcome: "unavailable" },
): AvailabilityCliNode => ({
  handle: async () => response,
});

describe("availability cli", () => {
  it("prints usage for help, an unknown command, and the wrong number of arguments", async () => {
    const node = nodeReturning({ result: true });
    expect((await runAvailabilityCli([], node)).stderr).toContain("usage:");
    expect((await runAvailabilityCli(["--help"], node)).exitCode).toBe(2);
    expect((await runAvailabilityCli(["help", "more"], node)).exitCode).toBe(2);
    expect((await runAvailabilityCli(["seed"], node)).exitCode).toBe(2);
    expect((await runAvailabilityCli(["request", principal], node)).exitCode).toBe(2);
    expect((await runAvailabilityCli(["request", principal, body, "extra"], node)).exitCode).toBe(
      2,
    );
    const missingPrincipal = ["request"];
    missingPrincipal[2] = body;
    expect((await runAvailabilityCli(missingPrincipal, node)).exitCode).toBe(2);
    const missingBody = ["request", principal];
    missingBody.length = 3;
    expect((await runAvailabilityCli(missingBody, node)).exitCode).toBe(2);
    expect((await runAvailabilityCli(["seed"], node)).stdout).toBe("");
  });

  it("rejects unparseable JSON without echoing it", async () => {
    const node = nodeReturning({ result: true });
    const badPrincipal = await runAvailabilityCli(["request", "PRIVATE-principal", body], node);
    const badBody = await runAvailabilityCli(["request", principal, "PRIVATE-body"], node);
    expect(badPrincipal.exitCode).toBe(2);
    expect(badBody.exitCode).toBe(2);
    expect(badPrincipal.stderr).not.toContain("PRIVATE");
    expect(badBody.stdout).not.toContain("PRIVATE");
    expect(badBody.stderr).not.toContain("PRIVATE");
  });

  it("prints the node response and hides a thrown handler error", async () => {
    const allowed = await runAvailabilityCli(
      ["request", principal, body],
      nodeReturning({ result: true }),
    );
    expect(allowed).toEqual({ exitCode: 0, stdout: '{"result":true}\n', stderr: "" });
    const denied = await runAvailabilityCli(
      ["request", principal, body],
      nodeReturning({ outcome: "unavailable" }),
    );
    expect(denied.stdout).toBe('{"outcome":"unavailable"}\n');
    expect(denied.exitCode).toBe(0);
    const thrown = await runAvailabilityCli(["request", "null", "null"], {
      handle: async () => {
        throw new Error("secret calendar title");
      },
    });
    expect(thrown.exitCode).toBe(1);
    expect(thrown.stdout).toBe('{"outcome":"unavailable"}\n');
    expect(`${thrown.stderr}${thrown.stdout}`).not.toContain("secret calendar");
  });

  it("sends a real empty node a request and prints its denial", async () => {
    const node = new LocalAvailabilityNode({
      clock: {
        now: () => new Date(ORIGIN).toISOString(),
        nowMs: () => ORIGIN,
      },
      agents: [],
    });
    const result = await runAvailabilityCli(["request", principal, body], node);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('{"outcome":"unavailable"}\n');
  });
});
