import { randomUUID } from "node:crypto";
import { request as httpsRequest } from "node:https";

import { availabilityIntervalAccepted } from "../modules/context/index.js";
import { parseAgentIdentityId } from "../modules/identity/index.js";
import {
  AVAILABILITY_ENVELOPE_CONTRACT_V1,
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_REQUEST_CONTRACT_V1,
  AVAILABILITY_SCOPE_V1,
  REPLAY_MAX_WINDOW_MS,
  type AvailabilityResponse,
  unavailable,
} from "../modules/messaging/index.js";
import {
  MAX_REMOTE_BODY_BYTES,
  REMOTE_AVAILABILITY_PATH,
  readPublicAvailabilityResponse,
} from "./remote-https-server.js";

export type RemoteAvailabilityClient = Readonly<{
  origin: string;
  servername: string;
  ca: string | Buffer;
  cert: string | Buffer;
  key: string | Buffer;
  recipientAgentId: string;
  nowMs: () => number;
  timeoutMs: number;
}>;

/**
 * Posts one availability envelope over mutual TLS.
 * The sender is the client certificate. The model does not choose it.
 */
export const requestRemoteAvailability = async (
  client: RemoteAvailabilityClient,
  request: Readonly<{ targetAgentId: string; start: string; end: string }>,
): Promise<AvailabilityResponse> => {
  try {
    const target = canonical(request.targetAgentId);
    const recipient = canonical(client.recipientAgentId);
    const nowMs = client.nowMs();
    const endpoint = readEndpoint(client.origin);
    if (
      target === null ||
      recipient === null ||
      target !== recipient ||
      !safeNow(nowMs) ||
      !usableTimeout(client.timeoutMs) ||
      !usableServername(client.servername) ||
      endpoint === null ||
      !availabilityIntervalAccepted({ start: request.start, end: request.end }, nowMs)
    ) {
      return unavailable();
    }
    const payload = JSON.stringify(envelope(recipient, request.start, request.end, nowMs));
    const raw = await postMutualTls(client, endpoint, payload);
    if (raw === null) {
      return unavailable();
    }
    return readPublicAvailabilityResponse(parseJson(raw)) ?? unavailable();
  } catch {
    return unavailable();
  }
};

const envelope = (recipient: string, start: string, end: string, nowMs: number) =>
  Object.freeze({
    contract: AVAILABILITY_ENVELOPE_CONTRACT_V1,
    messageId: `m${randomUUID()}`,
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + REPLAY_MAX_WINDOW_MS).toISOString(),
    recipientAgentId: recipient,
    body: Object.freeze({
      contract: AVAILABILITY_REQUEST_CONTRACT_V1,
      requestId: `r${randomUUID()}`,
      targetAgentId: recipient,
      purpose: AVAILABILITY_PURPOSE_V1,
      scope: AVAILABILITY_SCOPE_V1,
      start,
      end,
    }),
  });

const postMutualTls = (
  client: RemoteAvailabilityClient,
  endpoint: Readonly<{ hostname: string; port: number }>,
  payload: string,
): Promise<string | null> =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    const fail = () => finish(null);
    const outbound = httpsRequest(
      {
        host: endpoint.hostname,
        port: endpoint.port,
        servername: client.servername,
        path: REMOTE_AVAILABILITY_PATH,
        method: "POST",
        ca: client.ca,
        cert: client.cert,
        key: client.key,
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        agent: false,
        headers: {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(payload)),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_REMOTE_BODY_BYTES) {
            response.destroy();
            fail();
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const type = response.headers["content-type"];
          if (response.statusCode !== 200 || typeof type !== "string" || !jsonType(type)) {
            fail();
            return;
          }
          finish(Buffer.concat(chunks).toString("utf8"));
        });
        response.on("error", fail);
      },
    );
    outbound.setTimeout(client.timeoutMs, () => {
      outbound.destroy();
      fail();
    });
    outbound.on("error", fail);
    outbound.end(payload);
  });

const canonical = (value: string): string | null => {
  const parsed = parseAgentIdentityId(value);
  return parsed.ok ? parsed.value : null;
};

const safeNow = (nowMs: number): boolean =>
  typeof nowMs === "number" &&
  Number.isSafeInteger(nowMs) &&
  Number.isSafeInteger(nowMs + REPLAY_MAX_WINDOW_MS);

const usableTimeout = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 1 && value <= 30_000;

const usableServername = (value: string): boolean =>
  typeof value === "string" && /^[A-Za-z0-9.-]{1,253}$/.test(value) && !value.includes("..");

const readEndpoint = (origin: string): { hostname: string; port: number } | null => {
  try {
    const url = new URL(origin);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.pathname !== "" && url.pathname !== "/")
    ) {
      return null;
    }
    const port = url.port === "" ? 443 : Number(url.port);
    if (port < 1) {
      return null;
    }
    return { hostname: url.hostname, port };
  } catch {
    return null;
  }
};

const jsonType = (value: string): boolean => /^application\/json(?:\s*;.*)?$/i.test(value);

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};
