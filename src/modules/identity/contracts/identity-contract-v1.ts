import { failure, type Result, success } from "../../../shared/domain/result.js";
import { type AgentIdentity, createAgentIdentity } from "../domain/agent-identity.js";
import { createHumanIdentity, type HumanIdentity } from "../domain/human-identity.js";
import type { IdentityContractError } from "../domain/identity-errors.js";

export const IDENTITY_LOCAL_CONTRACT_V1 = "pan.identity.local/v1" as const;

export type HumanIdentitySnapshotV1 = Readonly<{
  schema: typeof IDENTITY_LOCAL_CONTRACT_V1;
  kind: "human";
  id: string;
}>;

export type AgentIdentitySnapshotV1 = Readonly<{
  schema: typeof IDENTITY_LOCAL_CONTRACT_V1;
  kind: "agent";
  id: string;
  ownerId: string;
  status: AgentIdentity["status"];
}>;

export type IdentitySnapshotV1 = HumanIdentitySnapshotV1 | AgentIdentitySnapshotV1;
export type Identity = HumanIdentity | AgentIdentity;

export const serializeHumanIdentityV1 = (
  identity: unknown,
): Result<HumanIdentitySnapshotV1, IdentityContractError> => {
  try {
    if (
      !isPlainRecord(identity) ||
      !hasExactKeys(identity, ["kind", "id"]) ||
      identity.kind !== "human"
    ) {
      return malformed();
    }
    const validated = createHumanIdentity(identity.id);
    return validated.ok
      ? success(
          Object.freeze({
            schema: IDENTITY_LOCAL_CONTRACT_V1,
            kind: "human" as const,
            id: validated.value.id,
          }),
        )
      : validated;
  } catch {
    return malformed();
  }
};

export const serializeAgentIdentityV1 = (
  identity: unknown,
): Result<AgentIdentitySnapshotV1, IdentityContractError> => {
  try {
    if (
      !isPlainRecord(identity) ||
      !hasExactKeys(identity, ["kind", "id", "ownerId", "status"]) ||
      identity.kind !== "agent"
    ) {
      return malformed();
    }
    const validated = createAgentIdentity(identity.id, identity.ownerId, identity.status);
    return validated.ok
      ? success(
          Object.freeze({
            schema: IDENTITY_LOCAL_CONTRACT_V1,
            kind: "agent" as const,
            id: validated.value.id,
            ownerId: validated.value.ownerId,
            status: validated.value.status,
          }),
        )
      : validated;
  } catch {
    return malformed();
  }
};

export const parseIdentitySnapshotV1 = (
  input: unknown,
): Result<Identity, IdentityContractError> => {
  try {
    return parseIdentitySnapshotV1Unsafe(input);
  } catch {
    return malformed();
  }
};

const parseIdentitySnapshotV1Unsafe = (input: unknown): Result<Identity, IdentityContractError> => {
  if (!isPlainRecord(input)) {
    return malformed();
  }

  if (input.schema !== IDENTITY_LOCAL_CONTRACT_V1) {
    return input.schema === undefined
      ? malformed()
      : failure({ code: "IDENTITY_CONTRACT_UNSUPPORTED" });
  }

  if (input.kind === "human") {
    if (!hasExactKeys(input, ["schema", "kind", "id"])) {
      return malformed();
    }

    return createHumanIdentity(input.id);
  }

  if (input.kind === "agent") {
    if (!hasExactKeys(input, ["schema", "kind", "id", "ownerId", "status"])) {
      return malformed();
    }

    return createAgentIdentity(input.id, input.ownerId, input.status);
  }

  return malformed();
};

const malformed = (): Result<never, IdentityContractError> =>
  failure({ code: "IDENTITY_CONTRACT_MALFORMED" });

const isPlainRecord = (input: unknown): input is Record<string, unknown> => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(input) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }

  return Object.values(Object.getOwnPropertyDescriptors(input)).every(
    (descriptor) => "value" in descriptor,
  );
};

const hasExactKeys = (input: Record<string, unknown>, expectedKeys: readonly string[]): boolean => {
  const actualKeys = Reflect.ownKeys(input);
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key) => typeof key === "string") &&
    expectedKeys.every((key) => Object.hasOwn(input, key))
  );
};
