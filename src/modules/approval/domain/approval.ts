import { randomUUID } from "node:crypto";

import { type AgentIdentityId, parseAgentIdentityId } from "../../identity/index.js";
import {
  APPROVAL_POLICY_VERSION_V1,
  APPROVAL_PURPOSE_V1,
  APPROVAL_SCOPE_V1,
  APPROVAL_SKILL_VERSION_V1,
} from "../contracts.js";

declare const approvalIdBrand: unique symbol;

export type ApprovalId = string & {
  readonly [approvalIdBrand]: "ApprovalId";
};

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "released"
  | "invalidated";

export type ApprovalBinding = Readonly<{
  requestId: string;
  fromAgentId: AgentIdentityId;
  toAgentId: AgentIdentityId;
  skillVersion: typeof APPROVAL_SKILL_VERSION_V1;
  purpose: typeof APPROVAL_PURPOSE_V1;
  scope: typeof APPROVAL_SCOPE_V1;
  start: string;
  end: string;
  policyVersion: typeof APPROVAL_POLICY_VERSION_V1;
}>;

export type ApprovalRecord = Readonly<{
  id: ApprovalId;
  requestId: string;
  fromAgentId: AgentIdentityId;
  toAgentId: AgentIdentityId;
  skillVersion: typeof APPROVAL_SKILL_VERSION_V1;
  purpose: typeof APPROVAL_PURPOSE_V1;
  scope: typeof APPROVAL_SCOPE_V1;
  start: string;
  end: string;
  policyVersion: typeof APPROVAL_POLICY_VERSION_V1;
  status: ApprovalStatus;
  expiresAt: string;
}>;

const APPROVAL_ID_PATTERN =
  /^pan_approval_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UTC_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;

const BINDING_KEYS = [
  "requestId",
  "fromAgentId",
  "toAgentId",
  "skillVersion",
  "purpose",
  "scope",
  "start",
  "end",
  "policyVersion",
] as const;

const RECORD_KEYS = [
  "id",
  "requestId",
  "fromAgentId",
  "toAgentId",
  "skillVersion",
  "purpose",
  "scope",
  "start",
  "end",
  "policyVersion",
  "status",
  "expiresAt",
] as const;

const STATUSES = ["pending", "approved", "rejected", "expired", "released", "invalidated"] as const;

export const isApprovalId = (input: unknown): input is ApprovalId =>
  typeof input === "string" && APPROVAL_ID_PATTERN.test(input);

export const parseUtcInstant = (input: unknown): number | null => {
  if (typeof input !== "string") {
    return null;
  }
  const match = UTC_INSTANT.exec(input);
  if (match === null) {
    return null;
  }
  const yearText = match[1];
  const monthText = match[2];
  const dayText = match[3];
  const hourText = match[4];
  const minuteText = match[5];
  const secondText = match[6];
  if (
    yearText === undefined ||
    monthText === undefined ||
    dayText === undefined ||
    hourText === undefined ||
    minuteText === undefined ||
    secondText === undefined
  ) {
    return null;
  }
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = match[7] === undefined ? 0 : Number(match[7]);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const instant = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const date = new Date(instant);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }
  return instant;
};

/** Local ASK fields only. This does not accept a remote message envelope. */
export const readApprovalBinding = (input: unknown): ApprovalBinding | null => {
  try {
    if (!isExactRecord(input, BINDING_KEYS)) {
      return null;
    }
    return bindingFrom(input);
  } catch {
    return null;
  }
};

export const createPendingApproval = (
  binding: ApprovalBinding,
  expiresAt: string,
): ApprovalRecord | null => {
  if (parseCanonicalUtcInstant(expiresAt) === null) {
    return null;
  }
  const record: ApprovalRecord = Object.freeze({
    id: `pan_approval_${randomUUID()}` as ApprovalId,
    requestId: binding.requestId,
    fromAgentId: binding.fromAgentId,
    toAgentId: binding.toAgentId,
    skillVersion: binding.skillVersion,
    purpose: binding.purpose,
    scope: binding.scope,
    start: binding.start,
    end: binding.end,
    policyVersion: binding.policyVersion,
    status: "pending",
    expiresAt,
  });
  return isApproval(record) ? record : null;
};

export const withApprovalStatus = (
  record: ApprovalRecord,
  status: ApprovalStatus,
): ApprovalRecord => (record.status === status ? record : Object.freeze({ ...record, status }));

export const isApproval = (input: unknown): input is ApprovalRecord => {
  try {
    if (!isExactRecord(input, RECORD_KEYS)) {
      return false;
    }
    const binding = bindingFrom({
      requestId: input.requestId,
      fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId,
      skillVersion: input.skillVersion,
      purpose: input.purpose,
      scope: input.scope,
      start: input.start,
      end: input.end,
      policyVersion: input.policyVersion,
    });
    return (
      binding !== null &&
      isApprovalId(input.id) &&
      isStatus(input.status) &&
      parseCanonicalUtcInstant(input.expiresAt) !== null &&
      input.requestId === binding.requestId &&
      input.fromAgentId === binding.fromAgentId &&
      input.toAgentId === binding.toAgentId &&
      input.start === binding.start &&
      input.end === binding.end
    );
  } catch {
    return false;
  }
};

export const sameApprovalBinding = (left: ApprovalRecord, right: ApprovalRecord): boolean =>
  left.requestId === right.requestId &&
  left.fromAgentId === right.fromAgentId &&
  left.toAgentId === right.toAgentId &&
  left.skillVersion === right.skillVersion &&
  left.purpose === right.purpose &&
  left.scope === right.scope &&
  left.start === right.start &&
  left.end === right.end &&
  left.policyVersion === right.policyVersion;

const bindingFrom = (input: Record<string, unknown>): ApprovalBinding | null => {
  const fromAgentId = parseAgentIdentityId(input.fromAgentId);
  const toAgentId = parseAgentIdentityId(input.toAgentId);
  const startMs = parseUtcInstant(input.start);
  const endMs = parseUtcInstant(input.end);
  if (
    typeof input.requestId !== "string" ||
    !TOKEN.test(input.requestId) ||
    !fromAgentId.ok ||
    !toAgentId.ok ||
    fromAgentId.value === toAgentId.value ||
    input.skillVersion !== APPROVAL_SKILL_VERSION_V1 ||
    input.purpose !== APPROVAL_PURPOSE_V1 ||
    input.scope !== APPROVAL_SCOPE_V1 ||
    input.policyVersion !== APPROVAL_POLICY_VERSION_V1 ||
    typeof input.start !== "string" ||
    typeof input.end !== "string" ||
    startMs === null ||
    endMs === null ||
    startMs >= endMs
  ) {
    return null;
  }
  return {
    requestId: input.requestId,
    fromAgentId: fromAgentId.value,
    toAgentId: toAgentId.value,
    skillVersion: APPROVAL_SKILL_VERSION_V1,
    purpose: APPROVAL_PURPOSE_V1,
    scope: APPROVAL_SCOPE_V1,
    start: input.start,
    end: input.end,
    policyVersion: APPROVAL_POLICY_VERSION_V1,
  };
};

const parseCanonicalUtcInstant = (input: unknown): number | null => {
  const instant = parseUtcInstant(input);
  if (instant === null || typeof input !== "string" || new Date(instant).toISOString() !== input) {
    return null;
  }
  return instant;
};

const isStatus = (input: unknown): input is ApprovalStatus =>
  STATUSES.some((status) => status === input);

const isExactRecord = (
  input: unknown,
  expected: readonly string[],
): input is Record<string, unknown> => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(input) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  const keys = Reflect.ownKeys(input);
  return (
    Object.values(Object.getOwnPropertyDescriptors(input)).every((item) => "value" in item) &&
    keys.length === expected.length &&
    keys.every((key) => typeof key === "string") &&
    expected.every((key) => Object.hasOwn(input, key))
  );
};
