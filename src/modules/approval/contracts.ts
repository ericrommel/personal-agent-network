export const APPROVAL_SKILL_VERSION_V1 = "pan.skill.availability/v1" as const;
export const APPROVAL_PURPOSE_V1 = "availability_check" as const;
export const APPROVAL_SCOPE_V1 = "availability_boolean" as const;
export const APPROVAL_POLICY_VERSION_V1 = "pan.policy/v1" as const;

/** Human decision window. Expiry is this long after local creation. */
export const APPROVAL_LIFETIME_MS = 10 * 60 * 1000;

export const APPROVAL_ERROR_CODES = [
  "APPROVAL_COMMAND_INVALID",
  "APPROVAL_CONFLICT",
  "APPROVAL_NOT_FOUND",
  "APPROVAL_DEPENDENCY_FAILED",
] as const;

export type ApprovalErrorCode = (typeof APPROVAL_ERROR_CODES)[number];

export type ApprovalError = Readonly<{
  code: ApprovalErrorCode;
}>;

export type ApprovalClock = Readonly<{
  now(): string;
}>;

declare const trustedApprovalSourceBrand: unique symbol;

/**
 * Local owner path only. There is no parser from a remote payload.
 * Callers must pass this object; the service checks its shape again.
 */
export type TrustedApprovalSource = Readonly<{
  kind: "trusted-approval-source";
  key: string;
  readonly [trustedApprovalSourceBrand]: true;
}>;
