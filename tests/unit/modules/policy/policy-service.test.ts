import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_SCOPE_V1,
  decideAuthorization,
} from "../../../../src/modules/policy/index.js";

const REQUESTER = "pan_agent_11111111-1111-4111-8111-111111111111";
const TARGET = "pan_agent_22222222-2222-4222-a222-222222222222";

const ports = (overrides?: {
  active?: unknown;
  advertised?: unknown;
  permission?: unknown;
  activeReads?: unknown[];
  advertisedReads?: unknown[];
  permissionReads?: unknown[];
  onActive?: (from: unknown, to: unknown) => void;
}) => {
  const reads = [...(overrides?.activeReads ?? [])];
  const advertisedReads = [...(overrides?.advertisedReads ?? [])];
  const permissionReads = [...(overrides?.permissionReads ?? [])];
  return {
    calls: [] as string[],
    async readActive(from: unknown, to: unknown) {
      overrides?.onActive?.(from, to);
      this.calls.push(`${String(from)}>${String(to)}`);
      if (reads.length > 0) {
        return reads.shift();
      }
      return overrides?.active ?? true;
    },
    async readAdvertised() {
      if (advertisedReads.length > 0) {
        return advertisedReads.shift();
      }
      return overrides?.advertised ?? true;
    },
    async readPermission() {
      if (permissionReads.length > 0) {
        return permissionReads.shift();
      }
      if (overrides && "permission" in overrides) {
        return overrides.permission;
      }
      return {
        decision: "ALLOW",
        purpose: AVAILABILITY_PURPOSE_V1,
        scope: AVAILABILITY_SCOPE_V1,
      };
    },
  };
};

describe("authorization policy service", () => {
  it("AC-DOM-001 denies when permission is absent even if relationship and advertisement are true", async () => {
    const gate = ports({ permission: null });
    expect(await decideAuthorization(gate, REQUESTER, TARGET)).toBe("DENY");
    expect(gate.calls).toEqual([`${REQUESTER}>${TARGET}`, `${REQUESTER}>${TARGET}`]);
  });

  it("returns the explicit permission effect and does not read the reverse pair", async () => {
    expect(
      await decideAuthorization(ports({ permission: snapshot("ASK") }), REQUESTER, TARGET),
    ).toBe("ASK");
    expect(
      await decideAuthorization(ports({ permission: snapshot("DENY") }), REQUESTER, TARGET),
    ).toBe("DENY");
    expect(await decideAuthorization(ports(), REQUESTER, TARGET)).toBe("ALLOW");
  });

  it("fails closed for the reverse relationship, stale read, bad purpose, and thrown ports", async () => {
    expect(await decideAuthorization(ports({ active: false }), REQUESTER, TARGET)).toBe("DENY");
    expect(
      await decideAuthorization(ports({ activeReads: [true, false] }), REQUESTER, TARGET),
    ).toBe("DENY");
    expect(
      await decideAuthorization(
        ports({ permissionReads: [snapshot("ALLOW"), null] }),
        REQUESTER,
        TARGET,
      ),
    ).toBe("DENY");
    expect(
      await decideAuthorization(ports({ advertisedReads: [true, false] }), REQUESTER, TARGET),
    ).toBe("DENY");
    expect(
      await decideAuthorization(
        ports({ permissionReads: [snapshot("ALLOW"), snapshot("ASK")] }),
        REQUESTER,
        TARGET,
      ),
    ).toBe("DENY");
    expect(await decideAuthorization(ports({ advertised: "true" }), REQUESTER, TARGET)).toBe(
      "DENY",
    );
    expect(await decideAuthorization(ports(), REQUESTER, TARGET, "other_purpose")).toBe("DENY");
    expect(
      await decideAuthorization(ports(), REQUESTER, TARGET, AVAILABILITY_PURPOSE_V1, "raw"),
    ).toBe("DENY");
    const thrown = ports();
    thrown.readActive = async () => {
      throw new Error("down");
    };
    expect(await decideAuthorization(thrown, REQUESTER, TARGET)).toBe("DENY");
    const inherited = Object.assign(Object.create({ leaked: true }), snapshot("ALLOW"));
    expect(await decideAuthorization(ports({ permission: inherited }), REQUESTER, TARGET)).toBe(
      "DENY",
    );
  });
});

const snapshot = (decision: "ALLOW" | "ASK" | "DENY") => ({
  decision,
  purpose: AVAILABILITY_PURPOSE_V1,
  scope: AVAILABILITY_SCOPE_V1,
});
