import { describe, expect, it } from "vitest";

import {
  createRelationship,
  directedPairKey,
  isRelationship,
  revokeRelationship,
} from "../../../../src/modules/relationships/domain/relationship.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const RELATIONSHIP_ID = "pan_relationship_33333333-3333-4333-b333-333333333333";
const INVALID_COMMAND = { ok: false, error: { code: "RELATIONSHIP_COMMAND_INVALID" } } as const;

const unwrap = <T>(result: Readonly<{ ok: true; value: T }> | Readonly<{ ok: false }>): T => {
  if (!result.ok) {
    throw new Error("Expected a successful test fixture result");
  }
  return result.value;
};

const relationshipIdPattern =
  /^pan_relationship_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("relationship domain record", () => {
  it("rejects a record whose properties throw when read", () => {
    const record = unwrap(createRelationship(FROM, TO));
    const explosive = new Proxy(record, {
      get() {
        throw new Error("unreadable");
      },
    });

    expect(isRelationship(explosive)).toBe(false);
  });

  it("AC-DOM-001 records no skill, permission, discovery, or context fields", () => {
    const record = unwrap(createRelationship(FROM, TO));

    expect(Object.keys(record)).toEqual(["kind", "id", "fromAgentId", "toAgentId", "status"]);
    expect(record).not.toHaveProperty("skill");
    expect(record).not.toHaveProperty("permission");
    expect(record).not.toHaveProperty("discovery");
    expect(record).not.toHaveProperty("context");
    expect(record).not.toHaveProperty("createdAt");
    expect(isRelationship({ ...record, skill: "availability" })).toBe(false);
    expect(isRelationship({ ...record, permission: "allow" })).toBe(false);
    expect(isRelationship({ ...record, discovery: true })).toBe(false);
    expect(isRelationship({ ...record, context: {} })).toBe(false);
  });

  it("rejects invalid agent ids and a self-pair", () => {
    const rejected = "pan_agent_not-a-uuid";

    expect(createRelationship(rejected, TO)).toEqual(INVALID_COMMAND);
    expect(createRelationship(FROM, "")).toEqual(INVALID_COMMAND);
    expect(createRelationship(FROM.toUpperCase(), TO)).toEqual(INVALID_COMMAND);
    expect(createRelationship(`pan_human_${FROM.slice("pan_agent_".length)}`, TO)).toEqual(
      INVALID_COMMAND,
    );
    expect(createRelationship(null, TO)).toEqual(INVALID_COMMAND);
    expect(createRelationship(FROM, FROM)).toEqual(INVALID_COMMAND);
    expect(JSON.stringify(createRelationship(rejected, TO))).not.toContain(rejected);
  });

  it("allocates a new frozen active id on each create", () => {
    const first = unwrap(createRelationship(FROM, TO));
    const second = unwrap(createRelationship(FROM, TO));

    expect(first.kind).toBe("relationship");
    expect(first.status).toBe("active");
    expect(first.fromAgentId).toBe(FROM);
    expect(first.toAgentId).toBe(TO);
    expect(first.id).toMatch(relationshipIdPattern);
    expect(second.id).toMatch(relationshipIdPattern);
    expect(first.id).not.toBe(second.id);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(second)).toBe(true);
  });

  it("revokes an active record once and leaves an already revoked record unchanged", () => {
    const active = unwrap(createRelationship(FROM, TO));
    const revoked = unwrap(revokeRelationship(active));
    const repeated = unwrap(revokeRelationship(revoked));

    expect(revoked).not.toBe(active);
    expect(revoked.id).toBe(active.id);
    expect(revoked.fromAgentId).toBe(FROM);
    expect(revoked.toAgentId).toBe(TO);
    expect(revoked.status).toBe("revoked");
    expect(active.status).toBe("active");
    expect(Object.isFrozen(revoked)).toBe(true);
    expect(repeated).toBe(revoked);

    const handBuilt = {
      kind: "relationship" as const,
      id: RELATIONSHIP_ID,
      fromAgentId: FROM,
      toAgentId: TO,
      status: "revoked" as const,
    };
    expect(unwrap(revokeRelationship(handBuilt))).toBe(handBuilt);
  });

  it("rejects revoke input that is not an exact relationship record", () => {
    const record = unwrap(createRelationship(FROM, TO));

    expect(revokeRelationship(null)).toEqual(INVALID_COMMAND);
    expect(revokeRelationship([record])).toEqual(INVALID_COMMAND);
    expect(revokeRelationship({ ...record, fromAgentId: TO, toAgentId: TO })).toEqual(
      INVALID_COMMAND,
    );
    expect(revokeRelationship({ ...record, status: "pending" })).toEqual(INVALID_COMMAND);
  });

  it("enforces the exact key guard and accepts only a plain or null prototype", () => {
    const record = unwrap(createRelationship(FROM, TO));
    const { status: _status, ...missingStatus } = record;
    const nullPrototype = Object.assign(Object.create(null) as object, {
      kind: record.kind,
      id: record.id,
      fromAgentId: record.fromAgentId,
      toAgentId: record.toAgentId,
      status: record.status,
    });
    const accessor = Object.defineProperty(
      {
        kind: record.kind,
        id: record.id,
        fromAgentId: record.fromAgentId,
        toAgentId: record.toAgentId,
      },
      "status",
      { enumerable: true, configurable: true, get: () => "active" },
    );
    const throwingGetter = Object.defineProperty(
      {
        kind: record.kind,
        id: record.id,
        fromAgentId: record.fromAgentId,
        toAgentId: record.toAgentId,
      },
      "status",
      {
        enumerable: true,
        configurable: true,
        get() {
          throw new Error("status getter");
        },
      },
    );
    class RelationshipLike {
      kind = record.kind;
      id = record.id;
      fromAgentId = record.fromAgentId;
      toAgentId = record.toAgentId;
      status = record.status;
    }

    expect(isRelationship(record)).toBe(true);
    expect(isRelationship(nullPrototype)).toBe(true);
    expect(isRelationship(missingStatus)).toBe(false);
    expect(isRelationship({ ...record, label: "friend" })).toBe(false);
    expect(isRelationship({ ...record, [Symbol("extra")]: true })).toBe(false);
    expect(isRelationship([record])).toBe(false);
    expect(isRelationship([])).toBe(false);
    expect(isRelationship(new RelationshipLike())).toBe(false);
    expect(isRelationship(accessor)).toBe(false);
    expect(isRelationship(throwingGetter)).toBe(false);
    expect(revokeRelationship(throwingGetter)).toEqual(INVALID_COMMAND);
    expect(isRelationship({ ...record, id: "pan_relationship_not-a-uuid" })).toBe(false);
    expect(isRelationship({ ...record, kind: "discoverability-grant" })).toBe(false);
    expect(isRelationship({ ...record, fromAgentId: TO, toAgentId: TO })).toBe(false);
    expect(isRelationship({ ...record, status: "pending" })).toBe(false);
  });

  it("returns a directed pair key only for two different parsed agent ids", () => {
    expect(directedPairKey(FROM, TO)).toBe(`${FROM}>${TO}`);
    expect(directedPairKey(TO, FROM)).toBe(`${TO}>${FROM}`);
    expect(directedPairKey(FROM, TO)).not.toBe(directedPairKey(TO, FROM));
    expect(directedPairKey(FROM, FROM)).toBeNull();
    expect(directedPairKey("pan_agent_not-a-uuid", TO)).toBeNull();
    expect(directedPairKey(FROM, TO.toUpperCase())).toBeNull();
    expect(directedPairKey(null, TO)).toBeNull();
  });
});
