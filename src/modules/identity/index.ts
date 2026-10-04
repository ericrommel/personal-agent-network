export {
  type AgentIdentityId,
  generateAgentIdentityId,
  generateHumanIdentityId,
  type HumanIdentityId,
  type IdentityIdParseError,
  parseAgentIdentityId,
  parseHumanIdentityId,
} from "../../shared/domain/identity-ids.js";
export {
  AUTHENTICATED_AGENT_PRINCIPAL_CONTRACT_V1,
  type AuthenticatedAgentPrincipal,
} from "./contracts/authenticated-agent-principal.js";
export {
  type AgentIdentitySnapshotV1,
  type HumanIdentitySnapshotV1,
  IDENTITY_LOCAL_CONTRACT_V1,
  type IdentitySnapshotV1,
  parseIdentitySnapshotV1,
  serializeAgentIdentityV1,
  serializeHumanIdentityV1,
} from "./contracts/identity-contract-v1.js";
export {
  AGENT_IDENTITY_STATUSES,
  type AgentIdentity,
  type AgentIdentityStatus,
  createAgentIdentity,
  isAgentIdentityEligibleForPrincipal,
  isAgentIdentityStatus,
  setAgentIdentityStatus,
} from "./domain/agent-identity.js";
export { createHumanIdentity, type HumanIdentity } from "./domain/human-identity.js";
export type {
  IdentityContractError,
  IdentityDomainError,
} from "./domain/identity-errors.js";
