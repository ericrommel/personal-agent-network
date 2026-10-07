export const SKILL_PERMISSION_COMMAND_CONTRACT_V1 = "pan.skill-permission-command/v1" as const;
export const SKILL_PERMISSION_EVENT_CONTRACT_V1 = "pan.skill-permission-event/v1" as const;
export const AVAILABILITY_SKILL_VERSION_V1 = "pan.skill.availability/v1" as const;
export const AVAILABILITY_PURPOSE_V1 = "availability_check" as const;
export const AVAILABILITY_SCOPE_V1 = "availability_boolean" as const;
export const PERMISSION_EFFECTS = ["ALLOW", "ASK", "DENY"] as const;

export type PermissionEffect = (typeof PERMISSION_EFFECTS)[number];

export const SKILL_PERMISSION_ERROR_CODES = [
  "SKILL_PERMISSION_COMMAND_INVALID",
  "SKILL_PERMISSION_CONFLICT",
  "SKILL_PERMISSION_NOT_FOUND",
  "SKILL_PERMISSION_PARTY_INELIGIBLE",
  "SKILL_PERMISSION_DEPENDENCY_FAILED",
] as const;

export type SkillPermissionErrorCode = (typeof SKILL_PERMISSION_ERROR_CODES)[number];
export type SkillPermissionError = Readonly<{ code: SkillPermissionErrorCode }>;
export type SkillPermissionEventCommand = "grant" | "revoke";
export type SkillPermissionEventOutcome = "accepted" | "rejected";
export type SkillPermissionEventControl = "none" | "validation" | "conflict" | "dependency";

export type SkillPermissionEvent = Readonly<{
  contract: typeof SKILL_PERMISSION_EVENT_CONTRACT_V1;
  correlationId: string;
  sourceKey: string;
  command: SkillPermissionEventCommand;
  outcome: SkillPermissionEventOutcome;
  control: SkillPermissionEventControl;
}>;
