import { parseAgentIdentityId } from "../identity/index.js";
import {
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_REQUEST_CONTRACT_V1,
  AVAILABILITY_SCOPE_V1,
  type AvailabilityResponse,
  released,
  unavailable,
} from "./contracts.js";

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REQUEST_KEYS = [
  "contract",
  "requestId",
  "targetAgentId",
  "purpose",
  "scope",
  "start",
  "end",
] as const;

export type AvailabilityPorts = Readonly<{
  decide(input: {
    requesterId: string;
    targetId: string;
    purpose: string;
    scope: string;
  }): Promise<unknown>;
  readActive(requesterId: string, targetId: string): Promise<unknown>;
  openApproval(binding: {
    requestId: string;
    requesterId: string;
    targetId: string;
    start: string;
    end: string;
  }): Promise<unknown>;
  release(requestId: string, relationshipActive: boolean): Promise<unknown>;
  queryAvailability(input: {
    requesterId: string;
    targetId: string;
    start: string;
    end: string;
  }): Promise<unknown>;
}>;

export const handleAvailabilityRequest = async (
  principal: unknown,
  body: unknown,
  ports: AvailabilityPorts,
): Promise<AvailabilityResponse> => {
  const requesterId = readPrincipalAgentId(principal);
  const request = readRequest(body);
  if (requesterId === null || request === null) {
    return unavailable();
  }
  if (request.purpose !== AVAILABILITY_PURPOSE_V1 || request.scope !== AVAILABILITY_SCOPE_V1) {
    return unavailable();
  }
  let decision: unknown;
  try {
    decision = await ports.decide({
      requesterId,
      targetId: request.targetAgentId,
      purpose: request.purpose,
      scope: request.scope,
    });
  } catch {
    return unavailable();
  }
  if (decision === "DENY" || (decision !== "ALLOW" && decision !== "ASK")) {
    return unavailable();
  }
  if (decision === "ALLOW") {
    return disclose(ports, requesterId, request);
  }
  try {
    const approval = await ports.openApproval({
      requestId: request.requestId,
      requesterId,
      targetId: request.targetAgentId,
      start: request.start,
      end: request.end,
    });
    if (!isExactStatus(approval, "approved")) {
      return unavailable();
    }
    const relationshipActive =
      (await ports.readActive(requesterId, request.targetAgentId)) === true;
    if ((await ports.release(request.requestId, relationshipActive)) !== true) {
      return unavailable();
    }
  } catch {
    return unavailable();
  }
  return disclose(ports, requesterId, request);
};

const disclose = async (
  ports: AvailabilityPorts,
  requesterId: string,
  request: ParsedRequest,
): Promise<AvailabilityResponse> => {
  try {
    const result = await ports.queryAvailability({
      requesterId,
      targetId: request.targetAgentId,
      start: request.start,
      end: request.end,
    });
    return result === true || result === false ? released(result) : unavailable();
  } catch {
    return unavailable();
  }
};

type ParsedRequest = Readonly<{
  requestId: string;
  targetAgentId: string;
  purpose: string;
  scope: string;
  start: string;
  end: string;
}>;

const readPrincipalAgentId = (principal: unknown): string | null => {
  if (!isExactData(principal, ["schema", "kind", "agentId", "authenticatedAt"])) {
    return null;
  }
  const record = principal as Record<string, unknown>;
  const agentId = parseAgentIdentityId(record.agentId);
  if (
    record.schema !== "pan.authenticated-agent-principal/v1" ||
    record.kind !== "authenticated-agent" ||
    !agentId.ok
  ) {
    return null;
  }
  return agentId.value;
};

const readRequest = (body: unknown): ParsedRequest | null => {
  if (!isExactData(body, REQUEST_KEYS)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const target = parseAgentIdentityId(record.targetAgentId);
  if (
    record.contract !== AVAILABILITY_REQUEST_CONTRACT_V1 ||
    !isToken(record.requestId) ||
    !target.ok ||
    typeof record.purpose !== "string" ||
    typeof record.scope !== "string" ||
    typeof record.start !== "string" ||
    typeof record.end !== "string"
  ) {
    return null;
  }
  return {
    requestId: record.requestId,
    targetAgentId: target.value,
    purpose: record.purpose,
    scope: record.scope,
    start: record.start,
    end: record.end,
  };
};

const isExactStatus = (value: unknown, status: string): boolean => {
  if (!isExactData(value, ["status"])) {
    return false;
  }
  return (value as { status?: unknown }).status === status;
};

const isToken = (value: unknown): value is string => typeof value === "string" && TOKEN.test(value);

const isExactData = (input: unknown, expected: readonly string[]): boolean => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(input) as unknown;
  const keys = Reflect.ownKeys(input);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.values(Object.getOwnPropertyDescriptors(input)).every((item) => "value" in item) &&
    keys.length === expected.length &&
    keys.every((key) => typeof key === "string") &&
    expected.every((key) => Object.hasOwn(input, key))
  );
};
