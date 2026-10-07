import type { RelationshipEvent } from "./contracts.js";
import type { Relationship } from "./domain/relationship.js";

declare const trustedRelationshipSourceBrand: unique symbol;

/** Established by the local control path. There is intentionally no public parser. */
export type TrustedRelationshipSource = Readonly<{
  kind: "trusted-relationship-source";
  key: string;
  readonly [trustedRelationshipSourceBrand]: true;
}>;

export interface RelationshipPartyPort {
  findAgent(id: unknown): Promise<unknown>;
}

export interface RelationshipEventSink {
  record(event: RelationshipEvent): void;
}

export interface RelationshipStorePort {
  insertActive(record: Relationship, event: RelationshipEvent): unknown;
  revokeMatching(
    fromAgentId: unknown,
    toAgentId: unknown,
    relationshipId: unknown,
    event: RelationshipEvent,
  ): unknown;
  findByDirectedPair(fromAgentId: unknown, toAgentId: unknown): unknown;
}
