import { randomUUID } from "node:crypto";

import { failure, type Result, success } from "../../../shared/domain/result.js";
import { type AgentIdentityId, parseAgentIdentityId } from "../../identity/index.js";

declare const relationshipIdBrand: unique symbol;

export type RelationshipId = string & {
  readonly [relationshipIdBrand]: "RelationshipId";
};

export type RelationshipStatus = "active" | "revoked";

export type Relationship = Readonly<{
  kind: "relationship";
  id: RelationshipId;
  fromAgentId: AgentIdentityId;
  toAgentId: AgentIdentityId;
  status: RelationshipStatus;
}>;

export type RelationshipCommandError = Readonly<{
  code: "RELATIONSHIP_COMMAND_INVALID";
}>;

const RELATIONSHIP_ID_PATTERN =
  /^pan_relationship_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const RELATIONSHIP_KEYS = ["kind", "id", "fromAgentId", "toAgentId", "status"] as const;

export const createRelationship = (
  from: unknown,
  to: unknown,
): Result<Relationship, RelationshipCommandError> => {
  const parsedFrom = parseAgentIdentityId(from);
  const parsedTo = parseAgentIdentityId(to);
  if (!parsedFrom.ok || !parsedTo.ok || parsedFrom.value === parsedTo.value) {
    return invalidRelationship();
  }

  return success(createStoredRelationship(parsedFrom.value, parsedTo.value));
};

export const createStoredRelationship = (
  fromAgentId: AgentIdentityId,
  toAgentId: AgentIdentityId,
): Relationship =>
  Object.freeze({
    kind: "relationship" as const,
    id: `pan_relationship_${randomUUID()}` as RelationshipId,
    fromAgentId,
    toAgentId,
    status: "active" as const,
  });

export const revokeStoredRelationship = (record: Relationship): Relationship =>
  record.status === "revoked" ? record : Object.freeze({ ...record, status: "revoked" as const });

export const revokeRelationship = (
  record: unknown,
): Result<Relationship, RelationshipCommandError> => {
  if (!isRelationship(record)) {
    return invalidRelationship();
  }

  return success(revokeStoredRelationship(record));
};

export const isRelationshipId = (input: unknown): input is RelationshipId =>
  typeof input === "string" && RELATIONSHIP_ID_PATTERN.test(input);

export const isRelationship = (input: unknown): input is Relationship => {
  try {
    if (!isExactRecord(input)) {
      return false;
    }
    const fromAgentId = parseAgentIdentityId(input.fromAgentId);
    const toAgentId = parseAgentIdentityId(input.toAgentId);
    return (
      input.kind === "relationship" &&
      isRelationshipId(input.id) &&
      fromAgentId.ok &&
      toAgentId.ok &&
      fromAgentId.value !== toAgentId.value &&
      (input.status === "active" || input.status === "revoked")
    );
  } catch {
    return false;
  }
};

export const directedPairKey = (from: unknown, to: unknown): string | null => {
  const parsedFrom = parseAgentIdentityId(from);
  const parsedTo = parseAgentIdentityId(to);
  if (!parsedFrom.ok || !parsedTo.ok || parsedFrom.value === parsedTo.value) {
    return null;
  }

  return `${parsedFrom.value}>${parsedTo.value}`;
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
    keys.length === RELATIONSHIP_KEYS.length &&
    keys.every((key) => typeof key === "string") &&
    RELATIONSHIP_KEYS.every((key) => Object.hasOwn(input, key))
  );
};

const invalidRelationship = (): Result<never, RelationshipCommandError> =>
  failure({ code: "RELATIONSHIP_COMMAND_INVALID" });
