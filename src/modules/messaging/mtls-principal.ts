import { parseAgentIdentityId } from "../identity/index.js";
import { AGENT_URI_SAN_PREFIX } from "./contracts.js";

/**
 * Provisional engineering profile under the approved mutual-TLS decision.
 * A peer certificate URI SAN must be exactly `urn:pan:agent:` plus the canonical agent id.
 * This is not a parser for message bodies.
 */
export const principalFromUriSan = (value: unknown, authenticatedAt: string) => {
  if (typeof value !== "string" || !value.startsWith(AGENT_URI_SAN_PREFIX)) {
    return null;
  }
  const parsed = parseAgentIdentityId(value.slice(AGENT_URI_SAN_PREFIX.length));
  if (!parsed.ok || !Number.isFinite(Date.parse(authenticatedAt))) {
    return null;
  }
  return Object.freeze({
    schema: "pan.authenticated-agent-principal/v1" as const,
    kind: "authenticated-agent" as const,
    agentId: parsed.value,
    authenticatedAt,
  });
};
