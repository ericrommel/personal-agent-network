export {
  RELATIONSHIP_COMMAND_CONTRACT_V1,
  RELATIONSHIP_EVENT_CONTRACT_V1,
  type RelationshipError,
  type RelationshipErrorCode,
  type RelationshipEvent,
} from "./contracts.js";
export {
  createRelationship,
  directedPairKey,
  isRelationship,
  isRelationshipId,
  type Relationship,
  type RelationshipCommandError,
  type RelationshipId,
  type RelationshipStatus,
  revokeRelationship,
} from "./domain/relationship.js";
export { InMemoryRelationshipStore } from "./in-memory-relationship-store.js";
export type {
  RelationshipEventSink,
  RelationshipPartyPort,
  RelationshipStorePort,
  TrustedRelationshipSource,
} from "./ports.js";
export {
  RelationshipService,
  type RelationshipServiceDependencies,
} from "./relationship-service.js";
