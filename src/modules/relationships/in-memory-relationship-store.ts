import type { RelationshipError, RelationshipEvent } from "./contracts.js";
import {
  directedPairKey,
  isRelationship,
  isRelationshipId,
  type Relationship,
  revokeStoredRelationship,
} from "./domain/relationship.js";
import type { RelationshipEventSink, RelationshipStorePort } from "./ports.js";

const dependencyFailure = (): RelationshipError =>
  Object.freeze({ code: "RELATIONSHIP_DEPENDENCY_FAILED" });

const notFound = (): RelationshipError => Object.freeze({ code: "RELATIONSHIP_NOT_FOUND" });

/**
 * Authority only inside one JavaScript process. Restart clears every relationship and revocation.
 * Instances do not coordinate. This adapter is not durable protection and is not two-node evidence.
 */
export class InMemoryRelationshipStore implements RelationshipStorePort {
  readonly #events: RelationshipEventSink;
  readonly #records = new Map<string, unknown>();

  constructor(events: RelationshipEventSink, seed?: ReadonlyArray<readonly [string, unknown]>) {
    this.#events = events;
    if (seed === undefined) {
      return;
    }
    for (const entry of seed) {
      this.#records.set(entry[0], entry[1]);
    }
  }

  insertActive(record: Relationship, event: RelationshipEvent): unknown {
    if (!isRelationship(record) || record.status !== "active") {
      return dependencyFailure();
    }
    const key = `${record.fromAgentId}>${record.toAgentId}`;
    const current = this.#records.get(key);
    if (isRelationship(current) && current.status === "active") {
      return Object.freeze({ code: "RELATIONSHIP_CONFLICT" });
    }

    this.#records.set(key, record);
    try {
      this.#events.record(event);
    } catch {
      this.#records.delete(key);
      return dependencyFailure();
    }
    return record;
  }

  revokeMatching(
    fromAgentId: unknown,
    toAgentId: unknown,
    relationshipId: unknown,
    event: RelationshipEvent,
  ): unknown {
    const key = directedPairKey(fromAgentId, toAgentId);
    const current = key === null ? undefined : this.#records.get(key);
    if (
      key === null ||
      !isRelationshipId(relationshipId) ||
      !isRelationship(current) ||
      current.id !== relationshipId
    ) {
      return notFound();
    }

    const revoked = revokeStoredRelationship(current);
    this.#records.set(key, revoked);
    try {
      this.#events.record(event);
    } catch {
      return revoked;
    }
    return revoked;
  }

  findByDirectedPair(fromAgentId: unknown, toAgentId: unknown): unknown {
    const key = directedPairKey(fromAgentId, toAgentId);
    if (key === null) {
      return null;
    }
    const current = this.#records.get(key);
    return isRelationship(current) ? current : null;
  }
}
