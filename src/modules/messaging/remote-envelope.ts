import { parseAgentIdentityId } from "../identity/index.js";
import {
  AVAILABILITY_ENVELOPE_CONTRACT_V1,
  AVAILABILITY_REQUEST_CONTRACT_V1,
  REPLAY_MAX_WINDOW_MS,
  REPLAY_SKEW_MS,
} from "./contracts.js";
import { principalFromUriSan } from "./mtls-principal.js";
import type { ReplayStore } from "./replay-store.js";

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UTC_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const ENVELOPE_KEYS = [
  "contract",
  "messageId",
  "issuedAt",
  "expiresAt",
  "recipientAgentId",
  "body",
] as const;
const BODY_KEYS = [
  "contract",
  "requestId",
  "targetAgentId",
  "purpose",
  "scope",
  "start",
  "end",
] as const;

export type AcceptedEnvelope = Readonly<{
  principal: NonNullable<ReturnType<typeof principalFromUriSan>>;
  body: Readonly<{
    contract: typeof AVAILABILITY_REQUEST_CONTRACT_V1;
    requestId: string;
    targetAgentId: string;
    purpose: string;
    scope: string;
    start: string;
    end: string;
  }>;
}>;

/**
 * Fail-closed gate for one remote availability envelope.
 * The sender comes only from the mutual-TLS URI SAN.
 * `messageId` is single-use. The body `requestId` stays the approval binding and may
 * be repeated in a later fresh envelope so an approved ASK can still be released.
 * A null result is the only denial. This function does not call policy or context.
 */
export const acceptRemoteEnvelope = async (
  envelope: unknown,
  senderUriSan: unknown,
  localAgentId: unknown,
  nowMs: unknown,
  store: ReplayStore,
): Promise<AcceptedEnvelope | null> => {
  try {
    const receipt = receiptTimestamp(nowMs);
    const localId = canonicalAgentId(localAgentId);
    const parsed = readEnvelope(envelope);
    if (
      receipt === null ||
      localId === null ||
      parsed === null ||
      parsed.recipientAgentId !== localId ||
      !withinWindow(parsed.issuedMs, parsed.expiresMs, receipt.nowMs)
    ) {
      return null;
    }
    const principal = principalFromUriSan(senderUriSan, receipt.at);
    if (principal === null) {
      return null;
    }
    const remembered = await store.remember(parsed.messageId);
    if (remembered !== "accepted") {
      return null;
    }
    return {
      principal,
      body: Object.freeze({
        contract: AVAILABILITY_REQUEST_CONTRACT_V1,
        requestId: parsed.requestId,
        targetAgentId: parsed.targetAgentId,
        purpose: parsed.purpose,
        scope: parsed.scope,
        start: parsed.start,
        end: parsed.end,
      }),
    };
  } catch {
    return null;
  }
};

const receiptTimestamp = (nowMs: unknown): { at: string; nowMs: number } | null => {
  if (
    typeof nowMs !== "number" ||
    !Number.isSafeInteger(nowMs) ||
    !Number.isSafeInteger(nowMs + REPLAY_SKEW_MS) ||
    !Number.isSafeInteger(nowMs - REPLAY_SKEW_MS)
  ) {
    return null;
  }
  const date = new Date(nowMs);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return { at: date.toISOString(), nowMs };
};

const canonicalAgentId = (value: unknown): string | null => {
  const parsed = parseAgentIdentityId(value);
  return parsed.ok ? parsed.value : null;
};

const withinWindow = (issuedMs: number, expiresMs: number, nowMs: number): boolean =>
  expiresMs > issuedMs &&
  expiresMs - issuedMs <= REPLAY_MAX_WINDOW_MS &&
  issuedMs <= nowMs + REPLAY_SKEW_MS &&
  nowMs <= expiresMs + REPLAY_SKEW_MS;

type ParsedEnvelope = Readonly<{
  messageId: string;
  recipientAgentId: string;
  issuedMs: number;
  expiresMs: number;
  requestId: string;
  targetAgentId: string;
  purpose: string;
  scope: string;
  start: string;
  end: string;
}>;

const readEnvelope = (envelope: unknown): ParsedEnvelope | null => {
  if (!isExactData(envelope, ENVELOPE_KEYS)) {
    return null;
  }
  const record = envelope as Record<string, unknown>;
  const recipient = canonicalAgentId(record.recipientAgentId);
  const issuedMs = parseInstant(record.issuedAt);
  const expiresMs = parseInstant(record.expiresAt);
  const body = readBody(record.body);
  if (
    record.contract !== AVAILABILITY_ENVELOPE_CONTRACT_V1 ||
    !isToken(record.messageId) ||
    recipient === null ||
    issuedMs === null ||
    expiresMs === null ||
    body === null ||
    body.targetAgentId !== recipient
  ) {
    return null;
  }
  return {
    messageId: record.messageId,
    recipientAgentId: recipient,
    issuedMs,
    expiresMs,
    requestId: body.requestId,
    targetAgentId: body.targetAgentId,
    purpose: body.purpose,
    scope: body.scope,
    start: body.start,
    end: body.end,
  };
};

const readBody = (
  body: unknown,
): Pick<
  ParsedEnvelope,
  "requestId" | "targetAgentId" | "purpose" | "scope" | "start" | "end"
> | null => {
  if (!isExactData(body, BODY_KEYS)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const target = canonicalAgentId(record.targetAgentId);
  if (
    record.contract !== AVAILABILITY_REQUEST_CONTRACT_V1 ||
    !isToken(record.requestId) ||
    target === null ||
    typeof record.purpose !== "string" ||
    typeof record.scope !== "string" ||
    typeof record.start !== "string" ||
    typeof record.end !== "string"
  ) {
    return null;
  }
  return {
    requestId: record.requestId,
    targetAgentId: target,
    purpose: record.purpose,
    scope: record.scope,
    start: record.start,
    end: record.end,
  };
};

const parseInstant = (input: unknown): number | null => {
  if (typeof input !== "string") {
    return null;
  }
  const match = UTC_INSTANT.exec(input);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
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
