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

type NormalizedPermission = Readonly<{
  decision: unknown;
  purpose: unknown;
  scope: unknown;
}>;

/**
 * D1 and D2: relationship, advertisement, and permission are read twice.
 * A change between the reads denies. The reverse relationship pair is never read.
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
    const firstRelationship = await exactTrue(ports.readActive(requesterId, targetId));
    const firstAdvertisement = await exactTrue(
      ports.readAdvertised(targetId, AVAILABILITY_SKILL_VERSION_V1),
    );
    const firstPermission = normalizePermission(await ports.readPermission(requesterId, targetId));
    const secondRelationship = await exactTrue(ports.readActive(requesterId, targetId));
    const secondAdvertisement = await exactTrue(
      ports.readAdvertised(targetId, AVAILABILITY_SKILL_VERSION_V1),
    );
    const secondPermission = normalizePermission(await ports.readPermission(requesterId, targetId));
    if (
      firstRelationship !== secondRelationship ||
      firstAdvertisement !== secondAdvertisement ||
      !samePermission(firstPermission, secondPermission)
    ) {
      return "DENY";
    }
    return evaluatePolicy({
      contract: POLICY_FACTS_CONTRACT_V1,
      relationshipActive: secondRelationship,
      advertisementPresent: secondAdvertisement,
      skillVersion: AVAILABILITY_SKILL_VERSION_V1,
      permission: secondPermission,
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

const normalizePermission = (input: unknown): NormalizedPermission => {
  if (!isExactData(input, SNAPSHOT_KEYS)) {
    return { decision: "absent", purpose: "absent", scope: "absent" };
  }
  const record = input as Record<string, unknown>;
  return {
    decision: record.decision,
    purpose: record.purpose,
    scope: record.scope,
  };
};

const samePermission = (left: NormalizedPermission, right: NormalizedPermission): boolean =>
  left.decision === right.decision && left.purpose === right.purpose && left.scope === right.scope;

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
