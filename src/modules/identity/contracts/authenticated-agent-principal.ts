import type { AgentIdentityId } from "../../../shared/domain/identity-ids.js";

declare const authenticatedAgentPrincipalBrand: unique symbol;

export const AUTHENTICATED_AGENT_PRINCIPAL_CONTRACT_V1 =
  "pan.authenticated-agent-principal/v1" as const;

/**
 * Evidence that a trusted authentication boundary established the remote agent.
 * There is intentionally no JSON parser or public constructor for this type.
 */
export type AuthenticatedAgentPrincipal = Readonly<{
  schema: typeof AUTHENTICATED_AGENT_PRINCIPAL_CONTRACT_V1;
  kind: "authenticated-agent";
  agentId: AgentIdentityId;
  authenticatedAt: string;
  readonly [authenticatedAgentPrincipalBrand]: true;
}>;
