import { randomUUID } from "node:crypto";

import { failure, type Result, success } from "./result.js";

declare const humanIdentityIdBrand: unique symbol;
declare const agentIdentityIdBrand: unique symbol;

export type HumanIdentityId = string & {
  readonly [humanIdentityIdBrand]: "HumanIdentityId";
};

export type AgentIdentityId = string & {
  readonly [agentIdentityIdBrand]: "AgentIdentityId";
};

export type IdentityIdParseError = Readonly<{
  code: "IDENTITY_ID_INVALID";
  field: "humanIdentityId" | "agentIdentityId" | "ownerId";
}>;

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HUMAN_ID_PATTERN = new RegExp(`^pan_human_(${UUID_V4_PATTERN.source.slice(1, -1)})$`);
const AGENT_ID_PATTERN = new RegExp(`^pan_agent_(${UUID_V4_PATTERN.source.slice(1, -1)})$`);

export const parseHumanIdentityId = (
  input: unknown,
): Result<HumanIdentityId, IdentityIdParseError> => {
  if (typeof input !== "string" || !HUMAN_ID_PATTERN.test(input)) {
    return failure({ code: "IDENTITY_ID_INVALID", field: "humanIdentityId" });
  }

  return success(input as HumanIdentityId);
};

export const parseAgentIdentityId = (
  input: unknown,
): Result<AgentIdentityId, IdentityIdParseError> => {
  if (typeof input !== "string" || !AGENT_ID_PATTERN.test(input)) {
    return failure({ code: "IDENTITY_ID_INVALID", field: "agentIdentityId" });
  }

  return success(input as AgentIdentityId);
};

export const generateHumanIdentityId = (): HumanIdentityId =>
  `pan_human_${randomUUID()}` as HumanIdentityId;

export const generateAgentIdentityId = (): AgentIdentityId =>
  `pan_agent_${randomUUID()}` as AgentIdentityId;
