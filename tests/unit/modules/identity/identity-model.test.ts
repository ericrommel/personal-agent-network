import { describe, expect, it } from "vitest";

import {
  AUTHENTICATED_AGENT_PRINCIPAL_CONTRACT_V1,
  createAgentIdentity,
  createHumanIdentity,
  generateAgentIdentityId,
  generateHumanIdentityId,
  IDENTITY_LOCAL_CONTRACT_V1,
  isAgentIdentityEligibleForPrincipal,
  parseAgentIdentityId,
  parseHumanIdentityId,
  parseIdentitySnapshotV1,
  serializeAgentIdentityV1,
  serializeHumanIdentityV1,
  setAgentIdentityStatus,
} from "../../../../src/modules/identity/index.js";

const unwrap = <T>(result: Readonly<{ ok: true; value: T }> | Readonly<{ ok: false }>): T => {
  if (!result.ok) {
    throw new Error("Expected a successful test fixture result");
  }
  return result.value;
};

describe("AC-ID-001 identity separation and ownership", () => {
  it("allows one Human Identity to own multiple distinct Agent Identities", () => {
    const owner = unwrap(createHumanIdentity(generateHumanIdentityId()));
    const firstAgent = unwrap(createAgentIdentity(generateAgentIdentityId(), owner.id));
    const secondAgent = unwrap(createAgentIdentity(generateAgentIdentityId(), owner.id));

    expect(owner.kind).toBe("human");
    expect(firstAgent.kind).toBe("agent");
    expect(firstAgent.id).not.toBe(secondAgent.id);
    expect(firstAgent.ownerId).toBe(owner.id);
    expect(secondAgent.ownerId).toBe(owner.id);
    expect(Object.isFrozen(owner)).toBe(true);
    expect(Object.isFrozen(firstAgent)).toBe(true);
  });

  it("uses runtime-distinct opaque identifiers and rejects malformed values", () => {
    const humanId = generateHumanIdentityId();
    const agentId = generateAgentIdentityId();

    expect(parseHumanIdentityId(humanId)).toEqual({ ok: true, value: humanId });
    expect(parseAgentIdentityId(agentId)).toEqual({ ok: true, value: agentId });
    expect(parseHumanIdentityId(agentId)).toEqual({
      ok: false,
      error: { code: "IDENTITY_ID_INVALID", field: "humanIdentityId" },
    });
    expect(parseAgentIdentityId(humanId)).toEqual({
      ok: false,
      error: { code: "IDENTITY_ID_INVALID", field: "agentIdentityId" },
    });

    for (const invalid of [
      undefined,
      null,
      "",
      " ",
      "pan_human_not-a-uuid",
      humanId.toUpperCase(),
    ]) {
      expect(parseHumanIdentityId(invalid).ok).toBe(false);
    }
  });

  it("makes only active Agents eligible for a future authenticated principal", () => {
    const active = unwrap(
      createAgentIdentity(generateAgentIdentityId(), generateHumanIdentityId()),
    );
    const disabled = unwrap(setAgentIdentityStatus(active, "disabled"));

    expect(isAgentIdentityEligibleForPrincipal(active)).toBe(true);
    expect(isAgentIdentityEligibleForPrincipal(disabled)).toBe(false);
    expect(disabled.ownerId).toBe(active.ownerId);
    expect(unwrap(setAgentIdentityStatus(disabled, "disabled"))).toEqual(disabled);
  });

  it("rejects forged runtime values at factories, transitions, and eligibility checks", () => {
    const humanId = generateHumanIdentityId();
    const agentId = generateAgentIdentityId();
    const forgedAgent = {
      kind: "agent",
      id: "secret@example.com",
      ownerId: humanId,
      status: "active",
    };

    expect(createHumanIdentity(agentId)).toEqual({
      ok: false,
      error: { code: "IDENTITY_ID_INVALID", field: "humanIdentityId" },
    });
    expect(createAgentIdentity(humanId, humanId)).toEqual({
      ok: false,
      error: { code: "IDENTITY_ID_INVALID", field: "agentIdentityId" },
    });
    expect(createAgentIdentity(agentId, agentId)).toEqual({
      ok: false,
      error: { code: "IDENTITY_ID_INVALID", field: "ownerId" },
    });
    expect(createAgentIdentity(agentId, humanId, "revoked")).toEqual({
      ok: false,
      error: { code: "IDENTITY_STATUS_INVALID", field: "status" },
    });
    expect(setAgentIdentityStatus(forgedAgent, "disabled").ok).toBe(false);
    const wrongKindAgent = {
      kind: "human",
      id: agentId,
      ownerId: humanId,
      status: "active",
    };
    expect(setAgentIdentityStatus(wrongKindAgent, "disabled").ok).toBe(false);
    expect(
      setAgentIdentityStatus(
        { ...unwrap(createAgentIdentity(agentId, humanId)), permission: "allow" },
        "disabled",
      ).ok,
    ).toBe(false);
    expect(setAgentIdentityStatus({}, "active").ok).toBe(false);
    expect(setAgentIdentityStatus(null, "active").ok).toBe(false);
    expect(setAgentIdentityStatus("agent", "active").ok).toBe(false);
    expect(
      setAgentIdentityStatus(unwrap(createAgentIdentity(agentId, humanId)), "revoked"),
    ).toEqual({
      ok: false,
      error: { code: "IDENTITY_STATUS_INVALID", field: "status" },
    });
    expect(isAgentIdentityEligibleForPrincipal(forgedAgent)).toBe(false);
    expect(isAgentIdentityEligibleForPrincipal(wrongKindAgent)).toBe(false);
    expect(
      isAgentIdentityEligibleForPrincipal({
        ...unwrap(createAgentIdentity(agentId, humanId)),
        permission: "allow",
      }),
    ).toBe(false);
    expect(isAgentIdentityEligibleForPrincipal(null)).toBe(false);
    expect(isAgentIdentityEligibleForPrincipal([])).toBe(false);

    class AgentLike {
      kind = "agent";
      id = agentId;
      ownerId = humanId;
      status = "active";
    }
    expect(isAgentIdentityEligibleForPrincipal(new AgentLike())).toBe(false);

    const accessorAgent = Object.defineProperties(
      {},
      {
        kind: { enumerable: true, value: "agent" },
        id: { enumerable: true, value: agentId },
        ownerId: { enumerable: true, value: humanId },
        status: { enumerable: true, get: () => "active" },
      },
    );
    expect(isAgentIdentityEligibleForPrincipal(accessorAgent)).toBe(false);

    const symbolId = Symbol("id");
    expect(
      isAgentIdentityEligibleForPrincipal({
        kind: "agent",
        [symbolId]: agentId,
        ownerId: humanId,
        status: "active",
      }),
    ).toBe(false);
    expect(
      isAgentIdentityEligibleForPrincipal({
        kind: "agent",
        identityId: agentId,
        ownerId: humanId,
        status: "active",
      }),
    ).toBe(false);

    const nullPrototypeAgent = Object.assign(Object.create(null) as object, {
      kind: "agent",
      id: agentId,
      ownerId: humanId,
      status: "active",
    });
    expect(isAgentIdentityEligibleForPrincipal(nullPrototypeAgent)).toBe(true);

    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(setAgentIdentityStatus(revoked.proxy, "active").ok).toBe(false);
    expect(isAgentIdentityEligibleForPrincipal(revoked.proxy)).toBe(false);
  });
});

describe("AC-DEV-003 versioned local identity snapshots", () => {
  it("exports stable explicit versions for identity and principal contracts", () => {
    expect(IDENTITY_LOCAL_CONTRACT_V1).toBe("pan.identity.local/v1");
    expect(AUTHENTICATED_AGENT_PRINCIPAL_CONTRACT_V1).toBe("pan.authenticated-agent-principal/v1");
  });

  it("round-trips allowlisted Human and Agent snapshots", () => {
    const human = unwrap(createHumanIdentity(generateHumanIdentityId()));
    const agent = unwrap(createAgentIdentity(generateAgentIdentityId(), human.id, "disabled"));

    const humanSnapshot = unwrap(serializeHumanIdentityV1(human));
    const agentSnapshot = unwrap(serializeAgentIdentityV1(agent));

    expect(humanSnapshot).toEqual({
      schema: IDENTITY_LOCAL_CONTRACT_V1,
      kind: "human",
      id: human.id,
    });
    expect(agentSnapshot).toEqual({
      schema: IDENTITY_LOCAL_CONTRACT_V1,
      kind: "agent",
      id: agent.id,
      ownerId: human.id,
      status: "disabled",
    });
    expect(parseIdentitySnapshotV1(humanSnapshot)).toEqual({ ok: true, value: human });
    expect(parseIdentitySnapshotV1(agentSnapshot)).toEqual({ ok: true, value: agent });
  });

  it("rejects forged entities instead of serializing invalid or sensitive values", () => {
    const humanId = generateHumanIdentityId();

    const invalidHuman = { kind: "human", id: "secret@example.com" };
    const invalidAgent = {
      kind: "agent",
      id: "secret@example.com",
      ownerId: humanId,
      status: "active",
    };

    const humanResult = serializeHumanIdentityV1(invalidHuman);
    const agentResult = serializeAgentIdentityV1(invalidAgent);

    expect(humanResult.ok).toBe(false);
    expect(agentResult.ok).toBe(false);
    expect(JSON.stringify([humanResult, agentResult])).not.toContain("secret@example.com");
    expect(serializeHumanIdentityV1({ kind: "human", id: humanId, profile: "private" }).ok).toBe(
      false,
    );
    expect(serializeHumanIdentityV1({ kind: "agent", id: humanId }).ok).toBe(false);
    expect(
      serializeAgentIdentityV1({
        kind: "human",
        id: generateAgentIdentityId(),
        ownerId: humanId,
        status: "active",
      }).ok,
    ).toBe(false);
    expect(serializeAgentIdentityV1(null).ok).toBe(false);

    const hostile = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("serializer trap detail");
        },
      },
    );
    const hostileHumanResult = serializeHumanIdentityV1(hostile);
    const hostileAgentResult = serializeAgentIdentityV1(hostile);
    expect(hostileHumanResult).toEqual({
      ok: false,
      error: { code: "IDENTITY_CONTRACT_MALFORMED" },
    });
    expect(hostileAgentResult).toEqual({
      ok: false,
      error: { code: "IDENTITY_CONTRACT_MALFORMED" },
    });
    expect(JSON.stringify([hostileHumanResult, hostileAgentResult])).not.toContain(
      "serializer trap",
    );
  });

  it("rejects unknown versions, extra fields, wrong ownership kinds, and statuses", () => {
    const humanId = generateHumanIdentityId();
    const agentId = generateAgentIdentityId();

    expect(
      parseIdentitySnapshotV1({
        schema: "pan.identity.local/v2",
        kind: "human",
        id: humanId,
      }),
    ).toEqual({ ok: false, error: { code: "IDENTITY_CONTRACT_UNSUPPORTED" } });

    expect(
      parseIdentitySnapshotV1({
        schema: IDENTITY_LOCAL_CONTRACT_V1,
        kind: "human",
        id: humanId,
        profile: "must not be accepted",
      }),
    ).toEqual({ ok: false, error: { code: "IDENTITY_CONTRACT_MALFORMED" } });

    expect(
      parseIdentitySnapshotV1({
        schema: IDENTITY_LOCAL_CONTRACT_V1,
        kind: "agent",
        id: agentId,
        ownerId: agentId,
        status: "active",
      }),
    ).toEqual({
      ok: false,
      error: { code: "IDENTITY_ID_INVALID", field: "ownerId" },
    });

    expect(
      parseIdentitySnapshotV1({
        schema: IDENTITY_LOCAL_CONTRACT_V1,
        kind: "agent",
        id: agentId,
        ownerId: humanId,
        status: "revoked",
      }),
    ).toEqual({
      ok: false,
      error: { code: "IDENTITY_STATUS_INVALID", field: "status" },
    });

    expect(
      parseIdentitySnapshotV1({
        schema: IDENTITY_LOCAL_CONTRACT_V1,
        kind: "agent",
        id: humanId,
        ownerId: humanId,
        status: "active",
      }),
    ).toEqual({
      ok: false,
      error: { code: "IDENTITY_ID_INVALID", field: "agentIdentityId" },
    });

    expect(
      parseIdentitySnapshotV1({
        schema: IDENTITY_LOCAL_CONTRACT_V1,
        kind: "agent",
        id: agentId,
        ownerId: humanId,
        status: "active",
        permission: "allow",
      }),
    ).toEqual({ ok: false, error: { code: "IDENTITY_CONTRACT_MALFORMED" } });

    expect(
      parseIdentitySnapshotV1({
        schema: IDENTITY_LOCAL_CONTRACT_V1,
        kind: "provider-account",
        id: agentId,
      }),
    ).toEqual({ ok: false, error: { code: "IDENTITY_CONTRACT_MALFORMED" } });
  });

  it("rejects objects with unsafe prototypes or accessors without invoking them", () => {
    class SnapshotLike {
      schema = IDENTITY_LOCAL_CONTRACT_V1;
      kind = "human";
      id = generateHumanIdentityId();
    }

    let getterInvoked = false;
    const accessorInput = Object.defineProperty({}, "schema", {
      enumerable: true,
      get: () => {
        getterInvoked = true;
        return IDENTITY_LOCAL_CONTRACT_V1;
      },
    });

    expect(parseIdentitySnapshotV1(new SnapshotLike())).toEqual({
      ok: false,
      error: { code: "IDENTITY_CONTRACT_MALFORMED" },
    });
    expect(parseIdentitySnapshotV1(accessorInput)).toEqual({
      ok: false,
      error: { code: "IDENTITY_CONTRACT_MALFORMED" },
    });
    expect(getterInvoked).toBe(false);
  });

  it("fails closed when hostile Proxy traps throw during inspection", () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("attacker-controlled trap detail");
        },
      },
    );

    const result = parseIdentitySnapshotV1(hostile);

    expect(result).toEqual({
      ok: false,
      error: { code: "IDENTITY_CONTRACT_MALFORMED" },
    });
    expect(JSON.stringify(result)).not.toContain("attacker-controlled");
  });

  it("fails closed across non-record and adversarial key shapes", () => {
    for (const input of [undefined, null, "snapshot", [], 42]) {
      expect(parseIdentitySnapshotV1(input)).toEqual({
        ok: false,
        error: { code: "IDENTITY_CONTRACT_MALFORMED" },
      });
    }

    expect(parseIdentitySnapshotV1({ kind: "human", id: generateHumanIdentityId() })).toEqual({
      ok: false,
      error: { code: "IDENTITY_CONTRACT_MALFORMED" },
    });

    expect(
      parseIdentitySnapshotV1({
        schema: IDENTITY_LOCAL_CONTRACT_V1,
        kind: "human",
        id: "not-a-human-id",
      }),
    ).toEqual({
      ok: false,
      error: { code: "IDENTITY_ID_INVALID", field: "humanIdentityId" },
    });

    const symbolKey = Symbol("id");
    expect(
      parseIdentitySnapshotV1({
        schema: IDENTITY_LOCAL_CONTRACT_V1,
        kind: "human",
        [symbolKey]: generateHumanIdentityId(),
      }),
    ).toEqual({ ok: false, error: { code: "IDENTITY_CONTRACT_MALFORMED" } });

    expect(
      parseIdentitySnapshotV1({
        schema: IDENTITY_LOCAL_CONTRACT_V1,
        kind: "human",
        identityId: generateHumanIdentityId(),
      }),
    ).toEqual({ ok: false, error: { code: "IDENTITY_CONTRACT_MALFORMED" } });

    const nullPrototypeSnapshot = Object.assign(Object.create(null) as object, {
      schema: IDENTITY_LOCAL_CONTRACT_V1,
      kind: "human",
      id: generateHumanIdentityId(),
    });
    expect(parseIdentitySnapshotV1(nullPrototypeSnapshot).ok).toBe(true);
  });

  it("returns stable errors without echoing rejected input", () => {
    const rejected = "pan_human_secret@example.com";
    const result = parseHumanIdentityId(rejected);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(rejected);
  });
});

describe("AC-DOM-001 identity boundary separation", () => {
  it("contains only identity state and cannot carry relationship, skill, or permission fields", () => {
    const human = unwrap(createHumanIdentity(generateHumanIdentityId()));
    const agent = unwrap(createAgentIdentity(generateAgentIdentityId(), human.id));
    const disabled = unwrap(setAgentIdentityStatus(agent, "disabled"));

    expect(Object.keys(human)).toEqual(["kind", "id"]);
    expect(Object.keys(agent)).toEqual(["kind", "id", "ownerId", "status"]);
    expect(Object.keys(disabled)).toEqual(["kind", "id", "ownerId", "status"]);
    expect("relationship" in agent).toBe(false);
    expect("skill" in agent).toBe(false);
    expect("permission" in agent).toBe(false);
  });
});
