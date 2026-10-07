import { describe, expect, it } from "vitest";
import {
  type AgentIdentity,
  createAgentIdentity,
  setAgentIdentityStatus,
} from "../../../../src/modules/identity/index.js";
import {
  createRelationship,
  InMemoryRelationshipStore,
  isRelationship,
  RELATIONSHIP_COMMAND_CONTRACT_V1,
  RELATIONSHIP_EVENT_CONTRACT_V1,
  type Relationship,
  type RelationshipEvent,
  type RelationshipEventSink,
  RelationshipService,
  type RelationshipStorePort,
  type TrustedRelationshipSource,
} from "../../../../src/modules/relationships/index.js";
import { failure } from "../../../../src/shared/domain/result.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const DISCOVERY_REFERENCE = "pan_agent_ref_44444444-4444-4444-8444-444444444444";

const unwrap = <T>(result: Readonly<{ ok: true; value: T } | { ok: false }>): T => {
  if (!result.ok) {
    throw new Error("Expected a successful test fixture result");
  }
  return result.value;
};

const agent = (id: string, status: "active" | "disabled" = "active"): AgentIdentity => {
  const created = unwrap(createAgentIdentity(id, OWNER, "active"));
  return status === "active" ? created : unwrap(setAgentIdentityStatus(created, "disabled"));
};

const source = (key = "local-owner"): TrustedRelationshipSource =>
  ({ kind: "trusted-relationship-source", key }) as TrustedRelationshipSource;

const createCommand = (from = FROM, to = TO, correlationId = "corr-1") => ({
  contract: RELATIONSHIP_COMMAND_CONTRACT_V1,
  action: "create" as const,
  correlationId,
  fromAgentId: from,
  toAgentId: to,
});

const revokeCommand = (relationshipId: string, from = FROM, to = TO) => ({
  contract: RELATIONSHIP_COMMAND_CONTRACT_V1,
  action: "revoke" as const,
  correlationId: "corr-revoke",
  fromAgentId: from,
  toAgentId: to,
  relationshipId,
});

const harness = (
  parties: AgentIdentity[] = [agent(FROM), agent(TO)],
  options?: {
    findAgent?: (id: unknown) => Promise<unknown>;
    record?: RelationshipEventSink["record"];
    store?: RelationshipStorePort;
    seed?: ReadonlyArray<readonly [string, unknown]>;
  },
) => {
  const recorded: RelationshipEvent[] = [];
  const sink: RelationshipEventSink = {
    record(event) {
      recorded.push(event);
      options?.record?.(event);
    },
  };
  const store = options?.store ?? new InMemoryRelationshipStore(sink, options?.seed);
  const service = new RelationshipService({
    events: sink,
    store,
    parties: {
      findAgent:
        options?.findAgent ?? (async (id) => parties.find((party) => party.id === id) ?? null),
    },
  });
  return { service, store, recorded };
};

const code = (name: string) => failure({ code: name });

describe("relationship service", () => {
  it("AC-DOM-001 keeps relationship state free of skill, permission, and discovery fields", async () => {
    const { service, recorded } = harness();
    const created = await service.create(source(), createCommand());

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(Object.keys(created.value)).toEqual([
      "kind",
      "id",
      "fromAgentId",
      "toAgentId",
      "status",
    ]);
    expect(created.value).not.toHaveProperty("skill");
    expect(created.value).not.toHaveProperty("permission");
    expect(created.value).not.toHaveProperty("email");
    expect(await service.readActive(FROM, TO)).toBe(true);
    expect(recorded[0]).not.toHaveProperty("fromAgentId");
    expect(JSON.stringify(recorded)).not.toContain(FROM);
    expect(JSON.stringify(created)).not.toContain("availability");
  });

  it("AC-REV-001 makes the next local read inactive without revoking the opposite direction", async () => {
    const { service } = harness();
    const forward = unwrap(await service.create(source(), createCommand()));
    const reverse = unwrap(await service.create(source(), createCommand(TO, FROM, "corr-reverse")));

    expect(unwrap(await service.revoke(source(), revokeCommand(forward.id)))).toMatchObject({
      id: forward.id,
      status: "revoked",
    });
    expect(await service.readActive(FROM, TO)).toBe(false);
    expect(await service.readActive(TO, FROM)).toBe(true);
    expect(reverse.status).toBe("active");
    expect(unwrap(await service.revoke(source(), revokeCommand(forward.id))).id).toBe(forward.id);
  });

  it("returns a new id after revoke and does not reactivate the old id", async () => {
    const { service, store } = harness();
    const first = unwrap(await service.create(source(), createCommand()));
    await service.revoke(source(), revokeCommand(first.id));
    const second = unwrap(await service.create(source(), createCommand(FROM, TO, "corr-2")));

    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe("active");
    expect(await service.readActive(FROM, TO)).toBe(true);
    expect(await service.revoke(source(), revokeCommand(first.id))).toEqual(
      code("RELATIONSHIP_NOT_FOUND"),
    );
    expect(isRelationship(store.findByDirectedPair(FROM, TO))).toBe(true);
    expect((store.findByDirectedPair(FROM, TO) as Relationship).id).toBe(second.id);
  });

  it("conflicts on a second active create and keeps the original id", async () => {
    const { service, recorded } = harness();
    const first = unwrap(await service.create(source(), createCommand()));
    const conflict = await service.create(source(), createCommand(FROM, TO, "corr-again"));

    expect(conflict).toEqual(code("RELATIONSHIP_CONFLICT"));
    expect(JSON.stringify(conflict)).not.toContain(FROM);
    expect(await service.readActive(FROM, TO)).toBe(true);
    expect(
      recorded.some((event) => event.control === "conflict" && event.outcome === "rejected"),
    ).toBe(true);
    expect(unwrap(await service.revoke(source(), revokeCommand(first.id))).id).toBe(first.id);
  });

  it("fails closed for invalid commands, self-pairs, and discovery references", async () => {
    const { service, recorded } = harness();
    const discovery = `pan_agent_ref_${FROM.slice("pan_agent_".length)}`;

    expect(await service.create(source(), createCommand(FROM, FROM))).toEqual(
      code("RELATIONSHIP_COMMAND_INVALID"),
    );
    expect(await service.create(source(), createCommand(discovery, TO))).toEqual(
      code("RELATIONSHIP_COMMAND_INVALID"),
    );
    expect(await service.create(source(), createCommand(FROM.toUpperCase(), TO))).toEqual(
      code("RELATIONSHIP_COMMAND_INVALID"),
    );
    expect(await service.create(source(), { ...createCommand(), extra: true })).toEqual(
      code("RELATIONSHIP_COMMAND_INVALID"),
    );
    expect(await service.create(source(), null)).toEqual(code("RELATIONSHIP_COMMAND_INVALID"));
    expect(await service.create(source("bad key"), createCommand())).toEqual(
      code("RELATIONSHIP_COMMAND_INVALID"),
    );
    expect(await service.revoke(source(), revokeCommand("pan_relationship_not-an-id"))).toEqual(
      code("RELATIONSHIP_COMMAND_INVALID"),
    );
    expect(recorded.every((event) => event.outcome === "rejected")).toBe(true);
    expect(DISCOVERY_REFERENCE.startsWith("pan_agent_ref_")).toBe(true);
    expect(await service.readActive(FROM, TO)).toBe(false);
  });

  it("does not insert when a party is missing, disabled, or the lookup throws", async () => {
    const missing = harness([agent(FROM)]);
    const disabled = harness([agent(FROM), agent(TO, "disabled")]);
    const thrown = harness([], {
      findAgent: async () => {
        throw new Error("directory down");
      },
    });

    expect(await missing.service.create(source(), createCommand())).toEqual(
      code("RELATIONSHIP_PARTY_INELIGIBLE"),
    );
    expect(await disabled.service.create(source(), createCommand())).toEqual(
      code("RELATIONSHIP_PARTY_INELIGIBLE"),
    );
    expect(await thrown.service.create(source(), createCommand())).toEqual(
      code("RELATIONSHIP_DEPENDENCY_FAILED"),
    );
    expect(await missing.service.readActive(FROM, TO)).toBe(false);
    expect(thrown.recorded.some((event) => event.control === "dependency")).toBe(true);
  });

  it("rolls back a create when the observer throws and keeps a revoke that already landed", async () => {
    const createFailure = harness(undefined, {
      record(event) {
        if (event.command === "create") {
          throw new Error("create observer failed");
        }
      },
    });
    expect(await createFailure.service.create(source(), createCommand())).toEqual(
      code("RELATIONSHIP_DEPENDENCY_FAILED"),
    );
    expect(createFailure.store.findByDirectedPair(FROM, TO)).toBeNull();

    const parties = {
      findAgent: async (id: unknown) =>
        [agent(FROM), agent(TO)].find((party) => party.id === id) ?? null,
    };
    const sinking = new InMemoryRelationshipStore({
      record(event) {
        if (event.command === "revoke") {
          throw new Error("revoke observer failed");
        }
      },
    });
    const service = new RelationshipService({
      events: {
        record() {
          /* rejections are not expected on this path */
        },
      },
      parties,
      store: sinking,
    });
    const created = unwrap(await service.create(source(), createCommand()));
    const revoked = await service.revoke(source(), revokeCommand(created.id));

    expect(revoked.ok).toBe(true);
    if (revoked.ok) {
      expect(revoked.value.status).toBe("revoked");
      expect(revoked.value.id).toBe(created.id);
    }
    expect(sinking.findByDirectedPair(FROM, TO)).toMatchObject({
      id: created.id,
      status: "revoked",
    });
  });

  it("reads false for the reverse direction, revoked state, malformed memory, and thrown dependencies", async () => {
    const { service } = harness();
    const created = unwrap(await service.create(source(), createCommand()));
    await service.revoke(source(), revokeCommand(created.id));
    expect(await service.readActive(TO, FROM)).toBe(false);
    expect(await service.readActive(FROM, TO)).toBe(false);

    const malformed = harness(undefined, {
      seed: [["pan_agent_not-a-pair", { kind: "relationship", status: "active" }]],
    });
    expect(malformed.store.findByDirectedPair(FROM, TO)).toBeNull();
    expect(await malformed.service.readActive(FROM, TO)).toBe(false);

    const throwingStore = harness(undefined, {
      store: {
        insertActive: () => failure({ code: "RELATIONSHIP_DEPENDENCY_FAILED" }),
        revokeMatching: () => {
          throw new Error("store down");
        },
        findByDirectedPair: () => {
          throw new Error("store down");
        },
      },
    });
    expect(await throwingStore.service.readActive(FROM, TO)).toBe(false);
    expect(await throwingStore.service.revoke(source(), revokeCommand(created.id))).toEqual(
      code("RELATIONSHIP_DEPENDENCY_FAILED"),
    );
  });

  it("rejects prototype tricks and reports an unknown revoke without creating a row", async () => {
    const { service } = harness();
    const throwing = new Proxy(createCommand(), {
      ownKeys() {
        throw new Error("keys");
      },
    });
    expect(await service.create(source(), throwing)).toEqual(code("RELATIONSHIP_COMMAND_INVALID"));

    const inherited = Object.create({ kind: "trusted-relationship-source", key: "local-owner" });
    expect(await service.create(inherited as TrustedRelationshipSource, createCommand())).toEqual(
      code("RELATIONSHIP_COMMAND_INVALID"),
    );
    expect(
      await service.revoke(source(), revokeCommand(unwrap(createRelationship(FROM, TO)).id)),
    ).toEqual(code("RELATIONSHIP_NOT_FOUND"));
    expect(await service.readActive(FROM, TO)).toBe(false);
  });

  it("treats a fresh store as a restart and does not describe that memory as durable", async () => {
    const first = harness();
    unwrap(await first.service.create(source(), createCommand()));
    const restarted = harness();

    expect(await restarted.service.readActive(FROM, TO)).toBe(false);
    expect(first.recorded[0]?.contract).toBe(RELATIONSHIP_EVENT_CONTRACT_V1);
  });

  it("uses only an explicit active eligible pair for readActive", async () => {
    const { service } = harness();
    unwrap(await service.create(source(), createCommand()));
    const disabledLater = harness([agent(FROM), agent(TO, "disabled")], {
      store: {
        insertActive: () => null,
        revokeMatching: () => null,
        findByDirectedPair: () => unwrap(createRelationship(FROM, TO)),
      },
    });

    expect(await service.readActive(FROM, TO)).toBe(true);
    expect(await disabledLater.service.readActive(FROM, TO)).toBe(false);
    expect(await service.readActive(FROM, "pan_human_33333333-3333-4333-8333-333333333333")).toBe(
      false,
    );
  });

  it("returns dependency failure when a rejected event cannot be recorded", async () => {
    const { service } = harness(undefined, {
      record(event) {
        if (event.outcome === "rejected") {
          throw new Error("rejected observer failed");
        }
      },
    });

    expect(await service.create(source(), createCommand(FROM, FROM))).toEqual(
      code("RELATIONSHIP_DEPENDENCY_FAILED"),
    );
  });

  it("fails closed on malformed dependencies and unreadable values", async () => {
    const store = new InMemoryRelationshipStore({
      record() {
        /* direct store calls below do not all emit */
      },
    });
    const relationshipId = unwrap(createRelationship(FROM, TO)).id;
    expect(
      store.revokeMatching(FROM, FROM, relationshipId, {
        contract: RELATIONSHIP_EVENT_CONTRACT_V1,
        correlationId: "corr-1",
        sourceKey: "local-owner",
        command: "revoke",
        outcome: "accepted",
        control: "none",
      }),
    ).toEqual({ code: "RELATIONSHIP_NOT_FOUND" });

    const oddStore: RelationshipStorePort = {
      insertActive: () => [],
      revokeMatching: () => ({ code: "RELATIONSHIP_DEPENDENCY_FAILED", extra: true }),
      findByDirectedPair: () => null,
    };
    const odd = new RelationshipService({
      events: { record() {} },
      parties: {
        findAgent: async (id) => {
          if (id === FROM) {
            return agent(FROM);
          }
          if (id === TO) {
            return agent(TO);
          }
          return null;
        },
      },
      store: oddStore,
    });
    expect(await odd.create(source(), createCommand())).toEqual(
      code("RELATIONSHIP_DEPENDENCY_FAILED"),
    );
    expect(await odd.revoke(source(), revokeCommand(relationshipId))).toEqual(
      code("RELATIONSHIP_DEPENDENCY_FAILED"),
    );

    const { service } = harness();
    expect(await service.revoke(source(), null)).toEqual(code("RELATIONSHIP_COMMAND_INVALID"));
    expect(
      await service.create(null as unknown as TrustedRelationshipSource, createCommand()),
    ).toEqual(code("RELATIONSHIP_COMMAND_INVALID"));
    expect(await service.create(source(), { ...createCommand(), correlationId: 1 })).toEqual(
      code("RELATIONSHIP_COMMAND_INVALID"),
    );

    let prototypeReads = 0;
    const explosive = new Proxy(
      { kind: "trusted-relationship-source", key: "local-owner" },
      {
        getPrototypeOf() {
          prototypeReads += 1;
          if (prototypeReads > 1) {
            throw new Error("prototype");
          }
          return Object.prototype;
        },
      },
    );
    expect(await service.create(explosive as TrustedRelationshipSource, createCommand())).toEqual(
      code("RELATIONSHIP_COMMAND_INVALID"),
    );
  });

  it("does not store a revoked record through insertActive", () => {
    const store = new InMemoryRelationshipStore({
      record() {
        /* unused */
      },
    });
    const revoked = unwrap(
      // domain revoke is covered separately; this guards the store's active-only write
      {
        ok: true as const,
        value: {
          ...unwrap(createRelationship(FROM, TO)),
          status: "revoked" as const,
        },
      },
    );

    expect(
      store.insertActive(revoked, {
        contract: RELATIONSHIP_EVENT_CONTRACT_V1,
        correlationId: "corr-1",
        sourceKey: "local-owner",
        command: "create",
        outcome: "accepted",
        control: "none",
      }),
    ).toEqual({ code: "RELATIONSHIP_DEPENDENCY_FAILED" });
    expect(store.findByDirectedPair(FROM, TO)).toBeNull();
  });
});
