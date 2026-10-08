import { randomUUID } from "node:crypto";
import { failure, type Result, success } from "../../../shared/domain/result.js";
import { type AgentIdentityId, parseAgentIdentityId } from "../../identity/index.js";
import {
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_SCOPE_V1,
  AVAILABILITY_SKILL_VERSION_V1,
  PERMISSION_EFFECTS,
  type PermissionEffect,
} from "../contracts.js";

declare const skillPermissionIdBrand: unique symbol;

export type SkillPermissionId = string & { readonly [skillPermissionIdBrand]: "SkillPermissionId" };
export type SkillPermissionStatus = "active" | "revoked";

export type SkillPermission = Readonly<{
  kind: "skill-permission";
  id: SkillPermissionId;
  fromAgentId: AgentIdentityId;
  toAgentId: AgentIdentityId;
  skillVersion: typeof AVAILABILITY_SKILL_VERSION_V1;
  purpose: typeof AVAILABILITY_PURPOSE_V1;
  scope: typeof AVAILABILITY_SCOPE_V1;
  effect: PermissionEffect;
  status: SkillPermissionStatus;
}>;

export type PermissionSnapshot = Readonly<{
  decision: PermissionEffect;
  purpose: typeof AVAILABILITY_PURPOSE_V1;
  scope: typeof AVAILABILITY_SCOPE_V1;
}>;

const ID_PATTERN =
  /^pan_skill_permission_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RECORD_KEYS = [
  "kind",
  "id",
  "fromAgentId",
  "toAgentId",
  "skillVersion",
  "purpose",
  "scope",
  "effect",
  "status",
] as const;

export const isSkillPermissionId = (input: unknown): input is SkillPermissionId =>
  typeof input === "string" && ID_PATTERN.test(input);

export const isPermissionEffect = (input: unknown): input is PermissionEffect =>
  PERMISSION_EFFECTS.some((effect) => effect === input);

export const createStoredSkillPermission = (
  fromAgentId: AgentIdentityId,
  toAgentId: AgentIdentityId,
  effect: PermissionEffect,
): SkillPermission =>
  Object.freeze({
    kind: "skill-permission",
    id: `pan_skill_permission_${randomUUID()}` as SkillPermissionId,
    fromAgentId,
    toAgentId,
    skillVersion: AVAILABILITY_SKILL_VERSION_V1,
    purpose: AVAILABILITY_PURPOSE_V1,
    scope: AVAILABILITY_SCOPE_V1,
    effect,
    status: "active",
  });

export const revokeStoredSkillPermission = (record: SkillPermission): SkillPermission =>
  record.status === "revoked" ? record : Object.freeze({ ...record, status: "revoked" });

export const isSkillPermission = (input: unknown): input is SkillPermission => {
  try {
    if (!isExactRecord(input)) {
      return false;
    }
    const fromAgentId = parseAgentIdentityId(input.fromAgentId);
    const toAgentId = parseAgentIdentityId(input.toAgentId);
    return (
      input.kind === "skill-permission" &&
      isSkillPermissionId(input.id) &&
      fromAgentId.ok &&
      toAgentId.ok &&
      fromAgentId.value !== toAgentId.value &&
      input.skillVersion === AVAILABILITY_SKILL_VERSION_V1 &&
      input.purpose === AVAILABILITY_PURPOSE_V1 &&
      input.scope === AVAILABILITY_SCOPE_V1 &&
      isPermissionEffect(input.effect) &&
      (input.status === "active" || input.status === "revoked")
    );
  } catch {
    return false;
  }
};

export const parseDirectedPair = (
  fromAgentId: unknown,
  toAgentId: unknown,
): Readonly<{ fromAgentId: AgentIdentityId; toAgentId: AgentIdentityId }> | null => {
  const from = parseAgentIdentityId(fromAgentId);
  const to = parseAgentIdentityId(toAgentId);
  if (!from.ok || !to.ok || from.value === to.value) {
    return null;
  }
  return { fromAgentId: from.value, toAgentId: to.value };
};

export const permissionKey = (fromAgentId: unknown, toAgentId: unknown): string | null => {
  const pair = parseDirectedPair(fromAgentId, toAgentId);
  return pair === null ? null : `${pair.fromAgentId}>${pair.toAgentId}`;
};

export const toSnapshot = (record: SkillPermission): PermissionSnapshot =>
  Object.freeze({
    decision: record.effect,
    purpose: record.purpose,
    scope: record.scope,
  });

const invalid = (): Result<never, { code: "SKILL_PERMISSION_COMMAND_INVALID" }> =>
  failure({ code: "SKILL_PERMISSION_COMMAND_INVALID" });

export const createSkillPermission = (
  fromAgentId: unknown,
  toAgentId: unknown,
  effect: unknown,
): Result<SkillPermission, { code: "SKILL_PERMISSION_COMMAND_INVALID" }> => {
  const pair = parseDirectedPair(fromAgentId, toAgentId);
  if (pair === null || !isPermissionEffect(effect)) {
    return invalid();
  }
  return success(createStoredSkillPermission(pair.fromAgentId, pair.toAgentId, effect));
};

const isExactRecord = (input: unknown): input is Record<string, unknown> => {
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
    keys.length === RECORD_KEYS.length &&
    keys.every((key) => typeof key === "string") &&
    RECORD_KEYS.every((key) => Object.hasOwn(input, key))
  );
};
