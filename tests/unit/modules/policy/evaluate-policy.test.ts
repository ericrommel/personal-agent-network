import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_SKILL_VERSION_V1,
  evaluatePolicy,
  POLICY_FACTS_CONTRACT_V1,
  POLICY_VERSION_V1,
} from "../../../../src/modules/policy/index.js";

const permission = (
  decision: "ALLOW" | "ASK" | "DENY",
  purpose = "availability_check",
  scope = "boolean",
) => ({
  decision,
  purpose,
  scope,
});

const facts = (overrides: Record<string, unknown> = {}) => ({
  contract: POLICY_FACTS_CONTRACT_V1,
  relationshipActive: true,
  advertisementPresent: true,
  skillVersion: AVAILABILITY_SKILL_VERSION_V1,
  permission: permission("ALLOW"),
  purpose: "availability_check",
  scope: "boolean",
  policyVersion: POLICY_VERSION_V1,
  ...overrides,
});

describe("provisional policy evaluator", () => {
  it("returns ALLOW or ASK only when every explicit gate matches", () => {
    expect(evaluatePolicy(facts())).toBe("ALLOW");
    expect(evaluatePolicy(facts({ permission: permission("ASK") }))).toBe("ASK");
  });

  it("AC-DOM-001 denies an active relationship and advertisement when permission is absent", () => {
    expect(evaluatePolicy(facts({ permission: { decision: "absent" } }))).toBe("DENY");
    expect(
      evaluatePolicy(facts({ advertisementPresent: false, permission: permission("ALLOW") })),
    ).toBe("DENY");
  });

  it("AC-AUTH-002 returns only DENY for an explicit denial and does not read private context", () => {
    expect(evaluatePolicy(facts({ permission: permission("DENY") }))).toBe("DENY");
    expect(evaluatePolicy(facts())).not.toHaveProperty("available");
  });

  it("denies mismatched relationship, version, purpose, scope, and malformed facts", () => {
    expect(evaluatePolicy(facts({ relationshipActive: false }))).toBe("DENY");
    expect(evaluatePolicy(facts({ skillVersion: "pan.skill.other/v1" }))).toBe("DENY");
    expect(evaluatePolicy(facts({ policyVersion: "pan.policy/v0" }))).toBe("DENY");
    expect(evaluatePolicy(facts({ purpose: "other_purpose" }))).toBe("DENY");
    expect(evaluatePolicy(facts({ scope: "raw-context" }))).toBe("DENY");
    expect(evaluatePolicy(facts({ purpose: "" }))).toBe("DENY");
    expect(evaluatePolicy(facts({ purpose: "has space" }))).toBe("DENY");
    expect(evaluatePolicy(facts({ relationshipActive: "true" }))).toBe("DENY");
    expect(evaluatePolicy(facts({ contract: "pan.other/v1" }))).toBe("DENY");
    expect(evaluatePolicy(null)).toBe("DENY");
    expect(evaluatePolicy([])).toBe("DENY");
    expect(evaluatePolicy("ALLOW")).toBe("DENY");
    expect(evaluatePolicy({ ...facts(), extra: true })).toBe("DENY");
    expect(
      evaluatePolicy(facts({ permission: { decision: "ALLOW", purpose: "availability_check" } })),
    ).toBe("DENY");
    expect(evaluatePolicy(facts({ permission: { decision: "maybe" } }))).toBe("DENY");
  });

  it("denies facts that throw while they are read", () => {
    const explosive = new Proxy(facts(), {
      get() {
        throw new Error("unreadable");
      },
    });

    expect(evaluatePolicy(explosive)).toBe("DENY");
  });

  it("accepts a null prototype and rejects an accessor", () => {
    const value = facts();
    const nullPrototype = Object.assign(Object.create(null), value);
    const accessor = facts();
    Object.defineProperty(accessor, "purpose", {
      get: () => "availability_check",
      enumerable: true,
    });

    expect(evaluatePolicy(nullPrototype)).toBe("ALLOW");
    expect(evaluatePolicy(accessor)).toBe("DENY");
  });
});
