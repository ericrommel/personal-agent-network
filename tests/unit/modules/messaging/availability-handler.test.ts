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

const approvedFor = (request: typeof body) => ({
  status: "approved",
  requestId: request.requestId,
  fromAgentId: REQUESTER,
  toAgentId: request.targetAgentId,
  start: request.start,
  end: request.end,
});

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
      return approvedFor(body);
    },
    async release(_requestId: string, relationshipActive: boolean): Promise<unknown> {
      calls.push(relationshipActive ? "release" : "invalidate");
      return relationshipActive;
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
    expect(gate.calls).toEqual(["decide", "query", "decide"]);
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
    expect(gate.calls.indexOf("query")).toBeLessThan(gate.calls.indexOf("release"));
    active = false;
    gate.calls.length = 0;
    expect(await handleAvailabilityRequest(principal, body, gate)).toEqual({
      outcome: "unavailable",
    });
    expect(gate.calls).toContain("invalidate");
    expect(gate.calls).not.toContain("release");
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

  it("does not deliver a boolean when authorization changes after the private read", async () => {
    const revoked = ports("ALLOW", true);
    let decisions = 0;
    revoked.decide = async () => {
      revoked.calls.push("decide");
      decisions += 1;
      return decisions === 1 ? "ALLOW" : "DENY";
    };
    expect(await handleAvailabilityRequest(principal, body, revoked)).toEqual({
      outcome: "unavailable",
    });
    expect(revoked.calls).toEqual(["decide", "query", "decide"]);

    const askRevoked = ports("ASK", true);
    let askDecisions = 0;
    askRevoked.decide = async () => {
      askRevoked.calls.push("decide");
      askDecisions += 1;
      return askDecisions === 1 ? "ASK" : "DENY";
    };
    expect(await handleAvailabilityRequest(principal, body, askRevoked)).toEqual({
      outcome: "unavailable",
    });
    expect(askRevoked.calls).toContain("invalidate");
    expect(askRevoked.calls).not.toContain("release");
  });

  it("does not treat a different approved window as consent for this request", async () => {
    const mismatched = ports("ASK", true);
    mismatched.openApproval = async () => {
      mismatched.calls.push("approval");
      return {
        ...approvedFor(body),
        end: "2026-10-08T03:00:00.000Z",
      };
    };
    expect(await handleAvailabilityRequest(principal, body, mismatched)).toEqual({
      outcome: "unavailable",
    });
    expect(mismatched.calls).toEqual(["decide", "approval"]);
  });

  it("withholds the boolean when the final relationship read or release fails", async () => {
    const relationshipDown = ports("ASK", true);
    relationshipDown.readActive = async () => {
      relationshipDown.calls.push("read");
      throw new Error("relationship down");
    };
    expect(await handleAvailabilityRequest(principal, body, relationshipDown)).toEqual({
      outcome: "unavailable",
    });

    const spent = ports("ASK", true);
    spent.release = async (_requestId: string, relationshipActive: boolean) => {
      spent.calls.push(relationshipActive ? "release" : "invalidate");
      return false;
    };
    expect(await handleAvailabilityRequest(principal, body, spent)).toEqual({
      outcome: "unavailable",
    });

    const releaseDown = ports("ASK", true);
    releaseDown.release = async () => {
      throw new Error("release down");
    };
    expect(await handleAvailabilityRequest(principal, body, releaseDown)).toEqual({
      outcome: "unavailable",
    });

    const withdrawn = ports("ASK", true);
    let approvals = 0;
    withdrawn.openApproval = async () => {
      withdrawn.calls.push("approval");
      approvals += 1;
      if (approvals === 1) {
        return approvedFor(body);
      }
      return { ...approvedFor(body), status: "invalidated" };
    };
    expect(await handleAvailabilityRequest(principal, body, withdrawn)).toEqual({
      outcome: "unavailable",
    });
    expect(withdrawn.calls).toContain("invalidate");

    const invalidateDown = ports("ASK", true);
    let decisions = 0;
    invalidateDown.decide = async () => {
      decisions += 1;
      return decisions === 1 ? "ASK" : "DENY";
    };
    invalidateDown.release = async () => {
      throw new Error("invalidate down");
    };
    expect(await handleAvailabilityRequest(principal, body, invalidateDown)).toEqual({
      outcome: "unavailable",
    });
  });
});
