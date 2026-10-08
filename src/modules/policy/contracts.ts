export const POLICY_FACTS_CONTRACT_V1 = "pan.policy-facts/v1" as const;
export const POLICY_VERSION_V1 = "pan.policy/v1" as const;
export const AVAILABILITY_SKILL_VERSION_V1 = "pan.skill.availability/v1" as const;
export const AVAILABILITY_PURPOSE_V1 = "availability_check" as const;
export const AVAILABILITY_SCOPE_V1 = "availability_boolean" as const;

export const POLICY_DECISIONS = ["ALLOW", "ASK", "DENY"] as const;

export type PolicyDecision = (typeof POLICY_DECISIONS)[number];
