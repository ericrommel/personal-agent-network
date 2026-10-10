import { availabilityIntervalAccepted } from "../context/index.js";
import { parseAgentIdentityId } from "../identity/index.js";
import { type AvailabilityResponse, unavailable } from "../messaging/index.js";
import {
  AVAILABILITY_TOOL,
  MAX_LABEL_CHARS,
  MAX_MODEL_TEXT_CHARS,
  MAX_USER_TEXT_CHARS,
} from "./contracts.js";
import type {
  ExternalAiProvider,
  ProviderCompletion,
  UntrustedToolCall,
  UntrustedTurn,
} from "./provider.js";

const CALL_KEYS = ["who", "start", "end"] as const;

export type AvailabilityExchange = (input: {
  targetAgentId: string;
  start: string;
  end: string;
}) => Promise<AvailabilityResponse>;

export type AvailabilityQuestion = Readonly<{
  userText: string;
  labels: Readonly<Record<string, string>>;
  nowMs: number;
}>;

/** `result` is PAN's authorized public object. `answer` is untrusted model text. */
export type AvailabilityAnswer = Readonly<{
  result: AvailabilityResponse;
  answer: string | null;
}>;

/**
 * Asks one replaceable model to call PAN. The local caller receives the same
 * public object the provider received. A later model sentence cannot replace it.
 */
export const answerAvailabilityQuestion = async (
  question: AvailabilityQuestion,
  provider: ExternalAiProvider,
  exchange: AvailabilityExchange,
): Promise<AvailabilityAnswer> => {
  let revealed: AvailabilityResponse | null = null;
  try {
    if (!usableUserText(question.userText)) {
      return quiet();
    }
    const first = await provider.complete({
      userText: question.userText,
      tool: AVAILABILITY_TOOL,
      prior: null,
    });
    const call = singleCall(first?.turn);
    if (first === null || call === null) {
      return quiet();
    }
    revealed = await revealedResult(question, call, exchange);
    const second = await provider.complete({
      tool: null,
      prior: {
        responseId: first.responseId,
        callId: call.id,
        output: JSON.stringify(revealed),
      },
    });
    return Object.freeze({ result: revealed, answer: phrase(second) });
  } catch {
    return quiet(revealed);
  }
};

const quiet = (result: AvailabilityResponse | null = null): AvailabilityAnswer =>
  Object.freeze({ result: result ?? unavailable(), answer: null });

const phrase = (completion: ProviderCompletion | null): string | null => {
  if (completion === null || completion.turn.calls.length !== 0) {
    return null;
  }
  const answer = completion.turn.text.trim();
  if (answer.length === 0 || answer.length > MAX_MODEL_TEXT_CHARS) {
    return null;
  }
  return answer;
};

const revealedResult = async (
  question: AvailabilityQuestion,
  call: UntrustedToolCall,
  exchange: AvailabilityExchange,
): Promise<AvailabilityResponse> => {
  const request = acceptedRequest(question, call);
  if (request === null) {
    return unavailable();
  }
  try {
    const result = await exchange(request);
    if ("result" in result && (result.result === true || result.result === false)) {
      return Object.freeze({ result: result.result });
    }
  } catch {
    return unavailable();
  }
  return unavailable();
};

const acceptedRequest = (
  question: AvailabilityQuestion,
  call: UntrustedToolCall,
): { targetAgentId: string; start: string; end: string } | null => {
  if (call.name !== AVAILABILITY_TOOL.name || !isExactData(call.arguments, CALL_KEYS)) {
    return null;
  }
  const record = call.arguments as Record<string, unknown>;
  const who = record.who;
  if (!usableLabel(who) || !Object.hasOwn(question.labels, who)) {
    return null;
  }
  const target = parseAgentIdentityId(question.labels[who]);
  if (
    !target.ok ||
    typeof record.start !== "string" ||
    typeof record.end !== "string" ||
    !availabilityIntervalAccepted({ start: record.start, end: record.end }, question.nowMs)
  ) {
    return null;
  }
  return Object.freeze({
    targetAgentId: target.value,
    start: record.start,
    end: record.end,
  });
};

const singleCall = (turn: UntrustedTurn | undefined): UntrustedToolCall | null => {
  if (turn === undefined || turn.calls.length !== 1) {
    return null;
  }
  return turn.calls[0] ?? null;
};

const hasDisallowedControl = (value: string): boolean => {
  for (const character of value) {
    if (character.charCodeAt(0) <= 31) {
      return true;
    }
  }
  return false;
};

const usableUserText = (value: string): boolean =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= MAX_USER_TEXT_CHARS &&
  !hasDisallowedControl(value);

const usableLabel = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length >= 1 &&
  value.length <= MAX_LABEL_CHARS &&
  !hasDisallowedControl(value);

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
