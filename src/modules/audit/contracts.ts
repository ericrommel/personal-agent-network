export const AUDIT_CATEGORIES = ["decision", "approval", "disclosure", "revocation"] as const;

export const AUDIT_OUTCOMES = [
  "allow",
  "ask",
  "deny",
  "released",
  "invalidated",
  "unavailable",
] as const;

export const AUDIT_ERROR_CODES = ["AUDIT_COMMAND_INVALID"] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export type AuditErrorCode = (typeof AUDIT_ERROR_CODES)[number];

/** Errors expose the closed code and nothing else. */
export type AuditError = Readonly<{
  code: AuditErrorCode;
}>;

/**
 * Minimized retained record. `id` and `recordedAt` are minted by the log.
 * There is no availability result, interval, profile, message, or permission effect.
 */
export type AuditEvent = Readonly<{
  kind: "audit-event";
  id: string;
  recordedAt: string;
  category: AuditCategory;
  requestId: string;
  outcome: AuditOutcome;
}>;

declare const trustedAuditOperatorBrand: unique symbol;

/** Established by the local control path. There is intentionally no public parser. */
export type TrustedAuditOperator = Readonly<{
  kind: "trusted-audit-operator";
  key: string;
  readonly [trustedAuditOperatorBrand]: true;
}>;
