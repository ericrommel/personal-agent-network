export const SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1 =
  "pan.skill-advertisement-command/v1" as const;
export const SKILL_ADVERTISEMENT_EVENT_CONTRACT_V1 = "pan.skill-advertisement-event/v1" as const;
export const AVAILABILITY_SKILL_VERSION_V1 = "pan.skill.availability/v1" as const;

export const SKILL_ADVERTISEMENT_ERROR_CODES = [
  "SKILL_ADVERTISEMENT_COMMAND_INVALID",
  "SKILL_ADVERTISEMENT_CONFLICT",
  "SKILL_ADVERTISEMENT_NOT_FOUND",
  "SKILL_ADVERTISEMENT_PARTY_INELIGIBLE",
  "SKILL_ADVERTISEMENT_DEPENDENCY_FAILED",
] as const;

export type SkillAdvertisementErrorCode = (typeof SKILL_ADVERTISEMENT_ERROR_CODES)[number];

export type SkillAdvertisementError = Readonly<{
  code: SkillAdvertisementErrorCode;
}>;

export type SkillAdvertisementEventCommand = "advertise" | "withdraw";
export type SkillAdvertisementEventOutcome = "accepted" | "rejected";
export type SkillAdvertisementEventControl = "none" | "validation" | "conflict" | "dependency";

export type SkillAdvertisementEvent = Readonly<{
  contract: typeof SKILL_ADVERTISEMENT_EVENT_CONTRACT_V1;
  correlationId: string;
  sourceKey: string;
  command: SkillAdvertisementEventCommand;
  outcome: SkillAdvertisementEventOutcome;
  control: SkillAdvertisementEventControl;
}>;
