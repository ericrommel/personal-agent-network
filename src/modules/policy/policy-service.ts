import {
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_SCOPE_V1,
  AVAILABILITY_SKILL_VERSION_V1,
  POLICY_FACTS_CONTRACT_V1,
  POLICY_VERSION_V1,
  type PolicyDecision,
} from "./contracts.js";
import { evaluatePolicy } from "./evaluate-policy.js";

export type PolicyPorts = Readonly<{
  readActive(fromAgentId: unknown, toAgentId: unknown): Promise<unknown>;
  readAdvertised(agentId: unknown, skillVersion: unknown): Promise<unknown>;
  readPermission(fromAgentId: unknown, toAgentId: unknown): Promise<unknown>;
}>;

const SNAPSHOT_KEYS = ["decision", "purpose", "scope"] as const;

/**
 * D2: only a fresh requester -> target read counts. The reverse pair is never read.
 * D3: purpose is availability_check. Scope is the boolean disclosure name.
 */
export const decideAuthorization = async (
  ports: PolicyPorts,
  requesterId: unknown,
  targetId: unknown,
  purpose: unknown = AVAILABILITY_PURPOSE_V1,
  scope: unknown = AVAILABILITY_SCOPE_V1,
): Promise<PolicyDecision> => {
  try {
    if (purpose !== AVAILABILITY_PURPOSE_V1 || scope !== AVAILABILITY_SCOPE_V1) {
      return "DENY";
    }
    const relationshipActive = await exactTrue(ports.readActive(requesterId, targetId));
    const advertisementPresent = await exactTrue(
      ports.readAdvertised(targetId, AVAILABILITY_SKILL_VERSION_V1),
    );
    const permission = await ports.readPermission(requesterId, targetId);
    const stillActive = await exactTrue(ports.readActive(requesterId, targetId));
    return evaluatePolicy({
      contract: POLICY_FACTS_CONTRACT_V1,
      relationshipActive: relationshipActive && stillActive,
      advertisementPresent,
      skillVersion: AVAILABILITY_SKILL_VERSION_V1,
      permission: normalizePermission(permission),
      purpose: AVAILABILITY_PURPOSE_V1,
      scope: AVAILABILITY_SCOPE_V1,
      policyVersion: POLICY_VERSION_V1,
    });
  } catch {
    return "DENY";
  }
};

const exactTrue = async (value: Promise<unknown>): Promise<boolean> => {
  const resolved = await value;
  return resolved === true;
};

const normalizePermission = (input: unknown): { decision: "absent" } | unknown => {
  if (!isExactData(input, SNAPSHOT_KEYS)) {
    return { decision: "absent" };
  }
  return input;
};

const isExactData = (input: unknown, expected: readonly string[]): boolean => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(input) as unknown;
  const keys = Reflect.ownKeys(input);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.values(Object.getOwnPropertyDescriptors(input)).every((item) => "value" in item) &&
    keys.length === expected.length &&
    keys.every((key) => typeof key === "string") &&
    expected.every((key) => Object.hasOwn(input, key))
  );
};
