import { randomUUID } from "node:crypto";
import { failure, type Result, success } from "../../../shared/domain/result.js";
import { type AgentIdentityId, parseAgentIdentityId } from "../../identity/index.js";
import { AVAILABILITY_SKILL_VERSION_V1 } from "../contracts.js";

declare const skillAdvertisementIdBrand: unique symbol;

export type SkillAdvertisementId = string & {
  readonly [skillAdvertisementIdBrand]: "SkillAdvertisementId";
};

export type SkillAdvertisementStatus = "advertised" | "withdrawn";

export type SkillAdvertisement = Readonly<{
  kind: "skill-advertisement";
  id: SkillAdvertisementId;
  agentId: AgentIdentityId;
  skillVersion: typeof AVAILABILITY_SKILL_VERSION_V1;
  status: SkillAdvertisementStatus;
}>;

export type SkillAdvertisementCommandError = Readonly<{
  code: "SKILL_ADVERTISEMENT_COMMAND_INVALID";
}>;

const SKILL_ADVERTISEMENT_ID_PATTERN =
  /^pan_skill_ad_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const RECORD_KEYS = ["kind", "id", "agentId", "skillVersion", "status"] as const;

export const isSkillAdvertisementId = (input: unknown): input is SkillAdvertisementId =>
  typeof input === "string" && SKILL_ADVERTISEMENT_ID_PATTERN.test(input);

export const isPinnedSkillVersion = (
  input: unknown,
): input is typeof AVAILABILITY_SKILL_VERSION_V1 => input === AVAILABILITY_SKILL_VERSION_V1;

export const createStoredSkillAdvertisement = (agentId: AgentIdentityId): SkillAdvertisement =>
  Object.freeze({
    kind: "skill-advertisement",
    id: `pan_skill_ad_${randomUUID()}` as SkillAdvertisementId,
    agentId,
    skillVersion: AVAILABILITY_SKILL_VERSION_V1,
    status: "advertised",
  });

export const withdrawStoredSkillAdvertisement = (record: SkillAdvertisement): SkillAdvertisement =>
  record.status === "withdrawn" ? record : Object.freeze({ ...record, status: "withdrawn" });

export const createSkillAdvertisement = (
  agentId: unknown,
): Result<SkillAdvertisement, SkillAdvertisementCommandError> => {
  const parsed = parseAgentIdentityId(agentId);
  if (!parsed.ok) {
    return failure({ code: "SKILL_ADVERTISEMENT_COMMAND_INVALID" });
  }
  return success(createStoredSkillAdvertisement(parsed.value));
};

export const withdrawSkillAdvertisement = (
  record: unknown,
): Result<SkillAdvertisement, SkillAdvertisementCommandError> => {
  if (!isSkillAdvertisement(record)) {
    return failure({ code: "SKILL_ADVERTISEMENT_COMMAND_INVALID" });
  }
  return success(withdrawStoredSkillAdvertisement(record));
};

export const isSkillAdvertisement = (input: unknown): input is SkillAdvertisement => {
  try {
    if (!isExactRecord(input)) {
      return false;
    }
    const agentId = parseAgentIdentityId(input.agentId);
    return (
      input.kind === "skill-advertisement" &&
      isSkillAdvertisementId(input.id) &&
      agentId.ok &&
      isPinnedSkillVersion(input.skillVersion) &&
      (input.status === "advertised" || input.status === "withdrawn")
    );
  } catch {
    return false;
  }
};

export const advertisementKey = (agentId: unknown, skillVersion: unknown): string | null => {
  const parsed = parseAgentIdentityId(agentId);
  if (!parsed.ok || !isPinnedSkillVersion(skillVersion)) {
    return null;
  }
  return `${parsed.value}>${skillVersion}`;
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
