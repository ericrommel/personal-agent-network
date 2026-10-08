import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer as createHttpsServer, type Server } from "node:https";
import { type AvailabilityResponse, unavailable } from "../modules/messaging/contracts.js";
import {
  type AcceptedEnvelope,
  acceptRemoteEnvelope,
} from "../modules/messaging/remote-envelope.js";
import type { ReplayStore } from "../modules/messaging/replay-store.js";

export const REMOTE_AVAILABILITY_PATH = "/pan/availability/v1";
export const MAX_REMOTE_BODY_BYTES = 16 * 1024;

/**
 * Minimal mutual-TLS ingress for one availability envelope.
 * The sender is the peer certificate URI SAN. Denial is the same public object
 * for every failure. This module does not listen from main or the CLI, and it
 * does not open a database pool or grant any local authority.
 */
export type RemoteAvailabilityHandler = (
  principal: AcceptedEnvelope["principal"],
  body: AcceptedEnvelope["body"],
) => Promise<AvailabilityResponse>;

export type RemoteHttpsDependencies = Readonly<{
  localAgentId: string;
  nowMs: () => number;
  store: ReplayStore;
  handle: RemoteAvailabilityHandler;
}>;

export type TlsMaterial = Readonly<{
  key: string | Buffer;
  cert: string | Buffer;
  ca: string | Buffer;
}>;

type HttpsServerFactory = (
  options: ReturnType<typeof remoteHttpsOptions>,
  listener: (request: IncomingMessage, response: ServerResponse) => void,
) => Server;

export const remoteHttpsOptions = (material: TlsMaterial) =>
  Object.freeze({
    key: material.key,
    cert: material.cert,
    ca: material.ca,
    requestCert: true as const,
    rejectUnauthorized: true as const,
    minVersion: "TLSv1.2" as const,
  });

export const createRemoteHttpsServer = (
  material: TlsMaterial,
  dependencies: RemoteHttpsDependencies,
  listenWith: HttpsServerFactory = createHttpsServer,
): Server =>
  listenWith(remoteHttpsOptions(material), (request, response) => {
    void receiveRemoteAvailability(request, response, dependencies);
  });

export const receiveRemoteAvailability = async (
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: RemoteHttpsDependencies,
): Promise<void> => {
  const result = await readRemoteResult(request, dependencies);
  try {
    writePublicJson(response, result);
  } catch {
    if (response.headersSent || response.writableEnded) {
      response.destroy();
      return;
    }
    try {
      writePublicJson(response, unavailable());
    } catch {
      response.destroy();
    }
  }
};

const readRemoteResult = async (
  request: IncomingMessage,
  dependencies: RemoteHttpsDependencies,
): Promise<AvailabilityResponse> => {
  try {
    if (request.method !== "POST" || request.url !== REMOTE_AVAILABILITY_PATH) {
      return unavailable();
    }
    if (!jsonContentType(request.headers["content-type"])) {
      return unavailable();
    }
    if (contentLengthTooLarge(request.headers["content-length"])) {
      request.destroy();
      return unavailable();
    }
    const sender = peerUriSan(request.socket);
    const raw = await readLimited(request, MAX_REMOTE_BODY_BYTES);
    if (sender === null || raw === null) {
      return unavailable();
    }
    const accepted = await acceptRemoteEnvelope(
      parseJson(raw),
      sender,
      dependencies.localAgentId,
      dependencies.nowMs(),
      dependencies.store,
    );
    if (accepted === null) {
      return unavailable();
    }
    const handled = await dependencies.handle(accepted.principal, accepted.body);
    return publicResponse(handled) ?? unavailable();
  } catch {
    return unavailable();
  }
};

export const peerUriSan = (socket: unknown): string | null => {
  if (typeof socket !== "object" || socket === null) {
    return null;
  }
  const record = socket as {
    authorized?: unknown;
    getPeerCertificate?: (detailed?: boolean) => unknown;
  };
  if (record.authorized !== true || typeof record.getPeerCertificate !== "function") {
    return null;
  }
  try {
    return uriSanFromPeerCertificate(record.getPeerCertificate(false));
  } catch {
    return null;
  }
};

export const uriSanFromPeerCertificate = (certificate: unknown): string | null => {
  if (typeof certificate !== "object" || certificate === null || Array.isArray(certificate)) {
    return null;
  }
  const name = (certificate as { subjectaltname?: unknown }).subjectaltname;
  if (typeof name !== "string" || name.length === 0) {
    return null;
  }
  let uri: string | null = null;
  let count = 0;
  for (const part of name.split(", ")) {
    if (!part.startsWith("URI:")) {
      continue;
    }
    const value = part.slice("URI:".length);
    if (value.length === 0) {
      return null;
    }
    count += 1;
    uri = value;
  }
  if (count !== 1) {
    return null;
  }
  return uri;
};

const jsonContentType = (value: unknown): boolean =>
  typeof value === "string" && /^application\/json(?:\s*;.*)?$/i.test(value);

const contentLengthTooLarge = (value: unknown): boolean => {
  if (value === undefined) {
    return false;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return true;
  }
  const length = Number(value);
  return !Number.isSafeInteger(length) || length > MAX_REMOTE_BODY_BYTES;
};

const readLimited = async (request: IncomingMessage, max: number): Promise<string | null> => {
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of request) {
      const buffer = asBuffer(chunk);
      if (buffer === null) {
        return null;
      }
      total += buffer.length;
      if (total > max) {
        request.destroy();
        return null;
      }
      chunks.push(buffer);
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks).toString("utf8");
};

const asBuffer = (chunk: unknown): Buffer | null => {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (typeof chunk === "string") {
    return Buffer.from(chunk);
  }
  return null;
};

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const publicResponse = (value: unknown): AvailabilityResponse | null => {
  if (exact(value, "result", (item) => typeof item === "boolean")) {
    return Object.freeze({ result: (value as { result: boolean }).result });
  }
  if (exact(value, "outcome", (item) => item === "unavailable")) {
    return unavailable();
  }
  return null;
};

const exact = (
  input: unknown,
  key: string,
  check: (value: unknown) => boolean,
): input is Record<string, unknown> => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(input) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  const descriptors = Object.values(Object.getOwnPropertyDescriptors(input));
  const keys = Reflect.ownKeys(input);
  return (
    descriptors.every((item) => "value" in item) &&
    keys.length === 1 &&
    keys[0] === key &&
    check((input as Record<string, unknown>)[key])
  );
};

const writePublicJson = (response: ServerResponse, body: AvailabilityResponse): void => {
  const payload = JSON.stringify(body);
  response.statusCode = 200;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-length", String(Buffer.byteLength(payload)));
  response.end(payload);
};
