import {
  AVAILABILITY_SKILL_VERSION_V1,
  POLICY_DECISIONS,
  POLICY_FACTS_CONTRACT_V1,
  POLICY_VERSION_V1,
  type PolicyDecision,
} from "./contracts.js";

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FACT_KEYS = [
  "contract",
  "relationshipActive",
  "advertisementPresent",
  "skillVersion",
  "permission",
  "purpose",
  "scope",
  "policyVersion",
] as const;

type ExplicitPermission = Readonly<{
  decision: "ALLOW" | "ASK" | "DENY";
  purpose: string;
  scope: string;
}>;

/**
 * Provisional internal evaluator. Facts are explicit inputs. This function does not
 * choose who may grant permission, which directed relationship pair was read, or what
 * an availability interval means.
 */
export const evaluatePolicy = (input: unknown): PolicyDecision => {
  try {
    const facts = readFacts(input);
    if (facts === null) {
      return "DENY";
    }
    if (
      facts.policyVersion !== POLICY_VERSION_V1 ||
      facts.relationshipActive !== true ||
      facts.advertisementPresent !== true ||
      facts.skillVersion !== AVAILABILITY_SKILL_VERSION_V1
    ) {
      return "DENY";
    }
    const permission = readPermission(facts.permission);
    if (permission === null || permission.decision === "DENY") {
      return "DENY";
    }
    if (facts.purpose !== permission.purpose || facts.scope !== permission.scope) {
      return "DENY";
    }
    return permission.decision;
  } catch {
    return "DENY";
  }
};

const readFacts = (
  input: unknown,
): Readonly<{
  relationshipActive: boolean;
  advertisementPresent: boolean;
  skillVersion: string;
  permission: unknown;
  purpose: string;
  scope: string;
  policyVersion: string;
}> | null => {
  if (!isExactData(input, FACT_KEYS)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  if (
    record.contract !== POLICY_FACTS_CONTRACT_V1 ||
    typeof record.relationshipActive !== "boolean" ||
    typeof record.advertisementPresent !== "boolean" ||
    typeof record.skillVersion !== "string" ||
    typeof record.policyVersion !== "string" ||
    !isToken(record.purpose) ||
    !isToken(record.scope)
  ) {
    return null;
  }
  return {
    relationshipActive: record.relationshipActive,
    advertisementPresent: record.advertisementPresent,
    skillVersion: record.skillVersion,
    permission: record.permission,
    purpose: record.purpose,
    scope: record.scope,
    policyVersion: record.policyVersion,
  };
};

const readPermission = (input: unknown): ExplicitPermission | null => {
  if (isExactData(input, ["decision"]) && (input as { decision?: unknown }).decision === "absent") {
    return null;
  }
  if (
    !isExactData(input, ["decision", "purpose", "scope"]) ||
    !isExplicitDecision((input as { decision?: unknown }).decision) ||
    !isToken((input as { purpose?: unknown }).purpose) ||
    !isToken((input as { scope?: unknown }).scope)
  ) {
    return null;
  }
  const record = input as { decision: "ALLOW" | "ASK" | "DENY"; purpose: string; scope: string };
  return {
    decision: record.decision,
    purpose: record.purpose,
    scope: record.scope,
  };
};

const isExplicitDecision = (input: unknown): input is ExplicitPermission["decision"] =>
  POLICY_DECISIONS.some((decision) => decision === input);

const isToken = (input: unknown): input is string => typeof input === "string" && TOKEN.test(input);

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
