export const RELATIONSHIP_COMMAND_CONTRACT_V1 = "pan.relationship-command/v1" as const;
export const RELATIONSHIP_EVENT_CONTRACT_V1 = "pan.relationship-event/v1" as const;

export const RELATIONSHIP_ERROR_CODES = [
  "RELATIONSHIP_COMMAND_INVALID",
  "RELATIONSHIP_CONFLICT",
  "RELATIONSHIP_NOT_FOUND",
  "RELATIONSHIP_PARTY_INELIGIBLE",
  "RELATIONSHIP_DEPENDENCY_FAILED",
] as const;

export type RelationshipErrorCode = (typeof RELATIONSHIP_ERROR_CODES)[number];

export type RelationshipError = Readonly<{
  code: RelationshipErrorCode;
}>;

export type RelationshipEventCommand = "create" | "revoke";
export type RelationshipEventOutcome = "accepted" | "rejected";
export type RelationshipEventControl = "none" | "validation" | "conflict" | "dependency";

export type RelationshipEvent = Readonly<{
  contract: typeof RELATIONSHIP_EVENT_CONTRACT_V1;
  correlationId: string;
  sourceKey: string;
  command: RelationshipEventCommand;
  outcome: RelationshipEventOutcome;
  control: RelationshipEventControl;
}>;
