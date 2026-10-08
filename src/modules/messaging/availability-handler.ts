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

const APPROVAL_KEYS = ["status", "requestId", "fromAgentId", "toAgentId", "start", "end"] as const;

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
  const decision = await readDecision(ports, requesterId, request);
  if (decision !== "ALLOW" && decision !== "ASK") {
    return unavailable();
  }
  if (decision === "ASK" && !(await approvedForRequest(ports, requesterId, request))) {
    return unavailable();
  }
  const result = await readBoolean(ports, requesterId, request);
  if (result === null) {
    return unavailable();
  }
  const stillAuthorized = (await readDecision(ports, requesterId, request)) === decision;
  if (!stillAuthorized) {
    if (decision === "ASK") {
      await invalidateUndelivered(ports, request.requestId);
    }
    return unavailable();
  }
  if (decision === "ALLOW") {
    return released(result);
  }
  if (!(await approvedForRequest(ports, requesterId, request))) {
    await invalidateUndelivered(ports, request.requestId);
    return unavailable();
  }
  let relationshipActive = false;
  try {
    relationshipActive = (await ports.readActive(requesterId, request.targetAgentId)) === true;
  } catch {
    return unavailable();
  }
  if (!relationshipActive) {
    await invalidateUndelivered(ports, request.requestId);
    return unavailable();
  }
  try {
    if ((await ports.release(request.requestId, true)) !== true) {
      return unavailable();
    }
  } catch {
    return unavailable();
  }
  if ((await readDecision(ports, requesterId, request)) !== "ASK") {
    return unavailable();
  }
  return released(result);
};

const readDecision = async (
  ports: AvailabilityPorts,
  requesterId: string,
  request: ParsedRequest,
): Promise<unknown> => {
  try {
    return await ports.decide({
      requesterId,
      targetId: request.targetAgentId,
      purpose: request.purpose,
      scope: request.scope,
    });
  } catch {
    return "DENY";
  }
};

const readBoolean = async (
  ports: AvailabilityPorts,
  requesterId: string,
  request: ParsedRequest,
): Promise<boolean | null> => {
  try {
    const result = await ports.queryAvailability({
      requesterId,
      targetId: request.targetAgentId,
      start: request.start,
      end: request.end,
    });
    return result === true || result === false ? result : null;
  } catch {
    return null;
  }
};

const approvedForRequest = async (
  ports: AvailabilityPorts,
  requesterId: string,
  request: ParsedRequest,
): Promise<boolean> => {
  try {
    const approval = await ports.openApproval({
      requestId: request.requestId,
      requesterId,
      targetId: request.targetAgentId,
      start: request.start,
      end: request.end,
    });
    return approvalMatches(approval, requesterId, request);
  } catch {
    return false;
  }
};

const invalidateUndelivered = async (
  ports: AvailabilityPorts,
  requestId: string,
): Promise<void> => {
  try {
    await ports.release(requestId, false);
  } catch {
    return;
  }
};

const approvalMatches = (
  approval: unknown,
  requesterId: string,
  request: ParsedRequest,
): boolean => {
  if (!isExactData(approval, APPROVAL_KEYS)) {
    return false;
  }
  const record = approval as Record<string, unknown>;
  return (
    record.status === "approved" &&
    record.requestId === request.requestId &&
    record.fromAgentId === requesterId &&
    record.toAgentId === request.targetAgentId &&
    record.start === request.start &&
    record.end === request.end
  );
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
