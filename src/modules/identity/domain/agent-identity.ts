import {
  type AgentIdentityId,
  type HumanIdentityId,
  parseAgentIdentityId,
  parseHumanIdentityId,
} from "../../../shared/domain/identity-ids.js";
import { failure, type Result, success } from "../../../shared/domain/result.js";
import type { IdentityDomainError } from "./identity-errors.js";

export const AGENT_IDENTITY_STATUSES = ["active", "disabled"] as const;

export type AgentIdentityStatus = (typeof AGENT_IDENTITY_STATUSES)[number];

export type AgentIdentity = Readonly<{
  kind: "agent";
  id: AgentIdentityId;
  ownerId: HumanIdentityId;
  status: AgentIdentityStatus;
}>;

export const createAgentIdentity = (
  id: unknown,
  ownerId: unknown,
  status: unknown = "active",
): Result<AgentIdentity, IdentityDomainError> => {
  const parsedId = parseAgentIdentityId(id);
  if (!parsedId.ok) {
    return parsedId;
  }

  const parsedOwnerId = parseHumanIdentityId(ownerId);
  if (!parsedOwnerId.ok) {
    return failure({ code: "IDENTITY_ID_INVALID", field: "ownerId" });
  }

  if (!isAgentIdentityStatus(status)) {
    return failure({ code: "IDENTITY_STATUS_INVALID", field: "status" });
  }

  return success(
    Object.freeze({
      kind: "agent" as const,
      id: parsedId.value,
      ownerId: parsedOwnerId.value,
      status,
    }),
  );
};

export const setAgentIdentityStatus = (
  identity: unknown,
  status: unknown,
): Result<AgentIdentity, IdentityDomainError> => {
  try {
    if (!isAgentIdentityRecord(identity)) {
      return failure({ code: "IDENTITY_ID_INVALID", field: "agentIdentityId" });
    }

    const validated = createAgentIdentity(identity.id, identity.ownerId, identity.status);
    if (!validated.ok) {
      return validated;
    }

    if (!isAgentIdentityStatus(status)) {
      return failure({ code: "IDENTITY_STATUS_INVALID", field: "status" });
    }

    return identity.status === status
      ? success(validated.value)
      : success(Object.freeze({ ...validated.value, status }));
  } catch {
    return failure({ code: "IDENTITY_ID_INVALID", field: "agentIdentityId" });
  }
};

export const isAgentIdentityStatus = (input: unknown): input is AgentIdentityStatus =>
  typeof input === "string" && AGENT_IDENTITY_STATUSES.some((status) => status === input);

export const isAgentIdentityEligibleForPrincipal = (identity: unknown): boolean => {
  try {
    if (!isAgentIdentityRecord(identity)) {
      return false;
    }
    const validated = createAgentIdentity(identity.id, identity.ownerId, identity.status);
    return validated.ok && validated.value.status === "active";
  } catch {
    return false;
  }
};

const isAgentIdentityRecord = (input: unknown): input is Record<string, unknown> => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(input) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(input);
  const expectedKeys = ["kind", "id", "ownerId", "status"] as const;
  return (
    Object.values(descriptors).every((descriptor) => "value" in descriptor) &&
    keys.length === expectedKeys.length &&
    keys.every((key) => typeof key === "string") &&
    expectedKeys.every((key) => Object.hasOwn(input, key)) &&
    (input as Record<string, unknown>).kind === "agent"
  );
};
