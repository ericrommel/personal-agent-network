import { randomUUID } from "node:crypto";
import { failure, type Result, success } from "../../../shared/domain/result.js";
import { type AgentIdentityId, parseAgentIdentityId } from "../../identity/index.js";
import { type CanonicalEmail, canonicalizeDiscoveryEmail } from "./email-identifier.js";

declare const discoveryGrantIdBrand: unique symbol;
declare const agentReferenceBrand: unique symbol;

export type DiscoveryGrantId = string & { readonly [discoveryGrantIdBrand]: true };
export type AgentReference = string & { readonly [agentReferenceBrand]: true };
export type DiscoverabilityGrantStatus = "active" | "revoked";

export type DiscoverabilityGrant = Readonly<{
  kind: "discoverability-grant";
  id: DiscoveryGrantId;
  callerId: AgentIdentityId;
  targetId: AgentIdentityId;
  email: CanonicalEmail;
  agentReference: AgentReference;
  status: DiscoverabilityGrantStatus;
}>;

export type DiscoveryGrantError = Readonly<{
  code: "DISCOVERY_GRANT_INVALID";
}>;

const GRANT_ID =
  /^pan_discovery_grant_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AGENT_REFERENCE =
  /^pan_agent_ref_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const createDiscoverabilityGrant = (
  callerId: unknown,
  targetId: unknown,
  email: unknown,
): Result<DiscoverabilityGrant, DiscoveryGrantError> => {
  const parsedCaller = parseAgentIdentityId(callerId);
  const parsedTarget = parseAgentIdentityId(targetId);
  const parsedEmail = canonicalizeDiscoveryEmail(email);
  if (!parsedCaller.ok || !parsedTarget.ok || !parsedEmail.ok) {
    return invalidGrant();
  }

  return success(
    Object.freeze({
      kind: "discoverability-grant" as const,
      id: `pan_discovery_grant_${randomUUID()}` as DiscoveryGrantId,
      callerId: parsedCaller.value,
      targetId: parsedTarget.value,
      email: parsedEmail.value,
      agentReference: `pan_agent_ref_${randomUUID()}` as AgentReference,
      status: "active" as const,
    }),
  );
};

export const revokeDiscoverabilityGrant = (
  grant: unknown,
): Result<DiscoverabilityGrant, DiscoveryGrantError> => {
  if (!isDiscoverabilityGrant(grant)) {
    return invalidGrant();
  }

  return success(
    grant.status === "revoked" ? grant : Object.freeze({ ...grant, status: "revoked" as const }),
  );
};

export const isDiscoverabilityGrant = (input: unknown): input is DiscoverabilityGrant => {
  try {
    if (!isExactRecord(input)) {
      return false;
    }
    const canonicalEmail = canonicalizeDiscoveryEmail(input.email);
    return (
      input.kind === "discoverability-grant" &&
      typeof input.id === "string" &&
      GRANT_ID.test(input.id) &&
      parseAgentIdentityId(input.callerId).ok &&
      parseAgentIdentityId(input.targetId).ok &&
      canonicalEmail.ok &&
      canonicalEmail.value === input.email &&
      typeof input.agentReference === "string" &&
      AGENT_REFERENCE.test(input.agentReference) &&
      (input.status === "active" || input.status === "revoked")
    );
  } catch {
    return false;
  }
};

const isExactRecord = (input: unknown): input is Record<string, unknown> => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(input) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  const expected = ["kind", "id", "callerId", "targetId", "email", "agentReference", "status"];
  const keys = Reflect.ownKeys(input);
  return (
    Object.values(Object.getOwnPropertyDescriptors(input)).every((item) => "value" in item) &&
    keys.length === expected.length &&
    keys.every((key) => typeof key === "string") &&
    expected.every((key) => Object.hasOwn(input, key))
  );
};

const invalidGrant = (): Result<never, DiscoveryGrantError> =>
  failure({ code: "DISCOVERY_GRANT_INVALID" });
