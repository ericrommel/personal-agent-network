import { AVAILABILITY_MODEL_INSTRUCTION, MAX_MODEL_TEXT_CHARS } from "./contracts.js";
import type {
  ExternalAiProvider,
  ProviderCompletion,
  UntrustedToolCall,
  UntrustedTurn,
} from "./provider.js";

export const XAI_RESPONSES_MODEL = "grok-4.7";
export const XAI_RESPONSES_BASE_URL = "https://api.x.ai/v1";
const MAX_PROVIDER_BODY_CHARS = 65_536;
const PUBLIC_OUTPUT = new Set(['{"result":true}', '{"result":false}', '{"outcome":"unavailable"}']);

export type XaiResponsesOptions = Readonly<{
  apiKey: string;
  model: string;
  baseUrl: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}>;

/**
 * SpaceXAI Responses API adapter. The key is sent only in the Authorization
 * header. This object is not a PAN identity and stores nothing durable.
 */
export const createXaiResponsesProvider = (
  options: XaiResponsesOptions,
): ExternalAiProvider | null => {
  if (
    !usableSecret(options.apiKey) ||
    !usableToken(options.model, 64) ||
    !httpsCollection(options.baseUrl) ||
    !usableTimeout(options.timeoutMs)
  ) {
    return null;
  }
  return Object.freeze({
    complete: (input) => completeXai(options, input),
  });
};

const completeXai = async (
  options: XaiResponsesOptions,
  input: Parameters<ExternalAiProvider["complete"]>[0],
): Promise<ProviderCompletion | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const payload = requestPayload(options.model, input);
    if (payload === null || payload.includes(options.apiKey)) {
      return null;
    }
    const response = await options.fetchImpl(collectionUrl(options.baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
      },
      body: payload,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok || text.length > MAX_PROVIDER_BODY_CHARS) {
      return null;
    }
    return parseCompletion(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const requestPayload = (
  model: string,
  input: Parameters<ExternalAiProvider["complete"]>[0],
): string | null => {
  if (input.prior === null) {
    return JSON.stringify({
      model,
      input: [
        { role: "system", content: AVAILABILITY_MODEL_INSTRUCTION },
        { role: "user", content: input.userText },
      ],
      tools: [
        {
          type: "function",
          name: input.tool.name,
          description: input.tool.description,
          parameters: input.tool.parameters,
        },
      ],
      tool_choice: "auto",
      parallel_tool_calls: false,
    });
  }
  if (!PUBLIC_OUTPUT.has(input.prior.output) || !isOpaqueId(input.prior.responseId)) {
    return null;
  }
  if (!isOpaqueId(input.prior.callId)) {
    return null;
  }
  return JSON.stringify({
    model,
    previous_response_id: input.prior.responseId,
    input: [
      {
        type: "function_call_output",
        call_id: input.prior.callId,
        output: input.prior.output,
      },
    ],
    tool_choice: "none",
  });
};

const parseCompletion = (raw: string): ProviderCompletion | null => {
  const parsed = parseJson(raw);
  if (!isRecord(parsed) || !isOpaqueId(parsed.id) || !Array.isArray(parsed.output)) {
    return null;
  }
  const calls: UntrustedToolCall[] = [];
  let text = "";
  for (const item of parsed.output) {
    if (!isRecord(item)) {
      return null;
    }
    if (item.type === "reasoning") {
      continue;
    }
    if (item.type === "message") {
      const part = readMessage(item);
      if (part === null) {
        return null;
      }
      text += part;
      if (text.length > MAX_MODEL_TEXT_CHARS) {
        return null;
      }
      continue;
    }
    if (item.type === "function_call") {
      const call = readCall(item);
      if (call === null || calls.length === 4) {
        return null;
      }
      calls.push(call);
      continue;
    }
    return null;
  }
  return Object.freeze({
    responseId: parsed.id,
    turn: Object.freeze({ text, calls: Object.freeze(calls) }) satisfies UntrustedTurn,
  });
};

const readMessage = (item: Record<string, unknown>): string | null => {
  if (!Array.isArray(item.content)) {
    return null;
  }
  let text = "";
  for (const part of item.content) {
    if (!isRecord(part) || part.type !== "output_text" || typeof part.text !== "string") {
      return null;
    }
    text += part.text;
  }
  return text;
};

const readCall = (item: Record<string, unknown>): UntrustedToolCall | null => {
  if (!usableToken(item.name, 80) || !isOpaqueId(item.call_id)) {
    return null;
  }
  if (typeof item.arguments !== "string" || item.arguments.length > 2_000) {
    return null;
  }
  try {
    return Object.freeze({
      id: item.call_id,
      name: item.name,
      arguments: JSON.parse(item.arguments) as unknown,
    });
  } catch {
    return null;
  }
};

const collectionUrl = (baseUrl: string): string => `${trimSlash(baseUrl)}/responses`;

const trimSlash = (value: string): string => (value.endsWith("/") ? value.slice(0, -1) : value);

const httpsCollection = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      (url.pathname === "/v1" || url.pathname === "/v1/")
    );
  } catch {
    return false;
  }
};

const usableSecret = (value: string): boolean =>
  typeof value === "string" &&
  value.length >= 8 &&
  value.length <= 512 &&
  /^[\x21-\x7e]+$/.test(value);

const usableToken = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  value.length >= 1 &&
  value.length <= max &&
  /^[\x21-\x7e]+$/.test(value);

const usableTimeout = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 1 && value <= 30_000;

const isOpaqueId = (value: unknown): value is string => usableToken(value, 200);

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
