import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_REQUEST_CONTRACT_V1,
  AVAILABILITY_SCOPE_V1,
  handleAvailabilityRequest,
  principalFromUriSan,
} from "../../../../src/modules/messaging/index.js";

const REQUESTER = "pan_agent_11111111-1111-4111-8111-111111111111";
const TARGET = "pan_agent_22222222-2222-4222-a222-222222222222";

const principal = principalFromUriSan(`urn:pan:agent:${REQUESTER}`, "2026-10-08T00:00:00.000Z");
const body = {
  contract: AVAILABILITY_REQUEST_CONTRACT_V1,
  requestId: "req-1",
  targetAgentId: TARGET,
  purpose: AVAILABILITY_PURPOSE_V1,
  scope: AVAILABILITY_SCOPE_V1,
  start: "2026-10-08T01:00:00.000Z",
  end: "2026-10-08T02:00:00.000Z",
};

const ports = (decision: unknown, result: unknown = true) => {
  const calls: string[] = [];
  return {
    calls,
    async decide(_input: {
      requesterId: string;
      targetId: string;
      purpose: string;
      scope: string;
    }): Promise<unknown> {
      calls.push("decide");
      return decision;
    },
    async readActive(_requesterId: string, _targetId: string): Promise<unknown> {
      calls.push("read");
      return true;
    },
    async openApproval(_binding: {
      requestId: string;
      requesterId: string;
      targetId: string;
      start: string;
      end: string;
    }): Promise<unknown> {
      calls.push("approval");
      return { status: "approved" };
    },
    async release(_requestId: string, _relationshipActive: boolean): Promise<unknown> {
      calls.push("release");
      return true;
    },
    async queryAvailability(_input: {
      requesterId: string;
      targetId: string;
      start: string;
      end: string;
    }): Promise<unknown> {
      calls.push("query");
      return result;
    },
  };
};

describe("availability message boundary", () => {
  it("returns only the boolean on ALLOW and does not use the body as the sender", async () => {
    const gate = ports("ALLOW", false);
    expect(await handleAvailabilityRequest(principal, body, gate)).toEqual({ result: false });
    expect(gate.calls).toEqual(["decide", "query"]);
    expect(
      principalFromUriSan("urn:pan:agent:not-an-agent", "2026-10-08T00:00:00.000Z"),
    ).toBeNull();
    expect(principalFromUriSan(`urn:pan:agent:${REQUESTER}`, "not-a-date")).toBeNull();
  });

  it("uses one denial shape for deny, ask, invalid input, and a null context result", async () => {
    expect(await handleAvailabilityRequest(principal, body, ports("DENY"))).toEqual({
      outcome: "unavailable",
    });
    expect(ports("DENY").calls).not.toContain("query");
    const asking = ports("ASK");
    asking.openApproval = async () => ({ status: "pending" });
    expect(await handleAvailabilityRequest(principal, body, asking)).toEqual({
      outcome: "unavailable",
    });
    expect(await handleAvailabilityRequest(null, body, ports("ALLOW"))).toEqual({
      outcome: "unavailable",
    });
    expect(
      await handleAvailabilityRequest(principal, { ...body, purpose: "other" }, ports("ALLOW")),
    ).toEqual({ outcome: "unavailable" });
    expect(await handleAvailabilityRequest(principal, body, ports("ALLOW", null))).toEqual({
      outcome: "unavailable",
    });
    const thrown = ports("ALLOW");
    thrown.decide = async () => {
      throw new Error("down");
    };
    expect(await handleAvailabilityRequest(principal, body, thrown)).toEqual({
      outcome: "unavailable",
    });
  });

  it("releases an approved ASK only after a fresh active relationship read", async () => {
    const gate = ports("ASK", true);
    let active = true;
    gate.readActive = async (from: string, to: string) => {
      expect(from).toBe(REQUESTER);
      expect(to).toBe(TARGET);
      return active;
    };
    expect(await handleAvailabilityRequest(principal, body, gate)).toEqual({ result: true });
    active = false;
    gate.release = async (_requestId: string, relationshipActive: boolean) => relationshipActive;
    expect(await handleAvailabilityRequest(principal, body, gate)).toEqual({
      outcome: "unavailable",
    });
    expect(principalFromUriSan(7, "2026-10-08T00:00:00.000Z")).toBeNull();
    const wrongSchema = { ...principal, schema: "pan.other/v1" };
    expect(await handleAvailabilityRequest(wrongSchema, body, ports("ALLOW"))).toEqual({
      outcome: "unavailable",
    });
    expect(
      await handleAvailabilityRequest(principal, { ...body, extra: true }, ports("ALLOW")),
    ).toEqual({ outcome: "unavailable" });
    expect(
      await handleAvailabilityRequest(
        principal,
        { ...body, targetAgentId: "pan_human_33333333-3333-4333-8333-333333333333" },
        ports("ALLOW"),
      ),
    ).toEqual({ outcome: "unavailable" });
    const odd = ports("ASK");
    odd.openApproval = async () => "approved";
    expect(await handleAvailabilityRequest(principal, body, odd)).toEqual({
      outcome: "unavailable",
    });
    const exploding = ports("ASK");
    exploding.openApproval = async () => {
      throw new Error("approval down");
    };
    expect(await handleAvailabilityRequest(principal, body, exploding)).toEqual({
      outcome: "unavailable",
    });
    const queryDown = ports("ALLOW");
    queryDown.queryAvailability = async () => {
      throw new Error("context down");
    };
    expect(await handleAvailabilityRequest(principal, body, queryDown)).toEqual({
      outcome: "unavailable",
    });
    expect(await handleAvailabilityRequest(principal, body, ports("MAYBE"))).toEqual({
      outcome: "unavailable",
    });
    const inherited = Object.assign(Object.create({ leaked: true }), body);
    expect(await handleAvailabilityRequest(principal, inherited, ports("ALLOW"))).toEqual({
      outcome: "unavailable",
    });
  });
});
