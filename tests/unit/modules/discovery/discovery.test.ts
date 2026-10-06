import { describe, expect, it } from "vitest";
import {
  canonicalizeDiscoveryEmail,
  createDiscoverabilityGrant,
  DEFAULT_DISCOVERY_BUDGETS,
  DISCOVERY_EMAIL_LOCAL_MAX_LENGTH,
  DISCOVERY_NEGATIVE_V1,
  DISCOVERY_REQUEST_CONTRACT_V1,
  DISCOVERY_RESULT_CONTRACT_V1,
  type DiscoverabilityPolicyPort,
  type DiscoveryBudgetPort,
  type DiscoveryDirectoryPort,
  type DiscoveryDisclosureCommitPort,
  type DiscoveryEvent,
  type DiscoveryEventPort,
  DiscoveryService,
  InMemoryDiscoveryBudget,
  isDiscoverabilityGrant,
  revokeDiscoverabilityGrant,
  type TrustedDiscoverySource,
} from "../../../../src/modules/discovery/index.js";
import {
  type AgentIdentity,
  type AuthenticatedAgentPrincipal,
  createAgentIdentity,
  generateAgentIdentityId,
  generateHumanIdentityId,
  isAgentIdentityEligibleForPrincipal,
  setAgentIdentityStatus,
} from "../../../../src/modules/identity/index.js";

const unwrap = <T>(result: { ok: true; value: T } | { ok: false }): T => {
  if (!result.ok) throw new Error("fixture creation failed");
  return result.value;
};

const principalFor = (agent: AgentIdentity): AuthenticatedAgentPrincipal =>
  ({
    schema: "pan.authenticated-agent-principal/v1",
    kind: "authenticated-agent",
    agentId: agent.id,
    authenticatedAt: "2026-10-04T00:00:00.000Z",
  }) as AuthenticatedAgentPrincipal;

type Fixture = ReturnType<typeof fixture>;

const trustedSource = (key = "source"): TrustedDiscoverySource =>
  ({ kind: "trusted-discovery-source", key }) as TrustedDiscoverySource;

const fixture = () => {
  const caller = unwrap(createAgentIdentity(generateAgentIdentityId(), generateHumanIdentityId()));
  const target = unwrap(createAgentIdentity(generateAgentIdentityId(), generateHumanIdentityId()));
  const trustedPrincipal = principalFor(caller);
  let trustedPrincipalValue: AuthenticatedAgentPrincipal | null = trustedPrincipal;
  let currentCaller: AgentIdentity | null = caller;
  let currentTarget: AgentIdentity | null = target;
  const initialGrant = unwrap(
    createDiscoverabilityGrant(caller.id, target.id, "Target@Example.test"),
  );
  let grants: readonly unknown[] = [initialGrant];
  const events: DiscoveryEvent[] = [];
  let eventResponse: unknown = true;
  let commitResponse: unknown = true;
  let commitThrows = false;
  let onFindGrants: (() => void) | undefined;
  let onFindTarget: (() => void) | undefined;

  const directory: DiscoveryDirectoryPort = {
    resolveCaller: async (principal) =>
      principal === trustedPrincipalValue ? currentCaller : null,
    findTarget: async () => {
      const result = currentTarget;
      onFindTarget?.();
      return result;
    },
  };
  const policy: DiscoverabilityPolicyPort = {
    findGrants: async () => {
      const result = grants;
      onFindGrants?.();
      return result;
    },
  };
  const eventPort: DiscoveryEventPort = {
    acknowledge: async (event) => {
      events.push(event);
      return eventResponse;
    },
  };
  const disclosureCommit: DiscoveryDisclosureCommitPort = {
    commit: async (input) => {
      if (commitThrows) {
        throw new Error("private commit failure");
      }
      const currentGrant = grants.find(
        (candidate) => isDiscoverabilityGrant(candidate) && candidate.id === input.expectedGrant.id,
      );
      const valid =
        isDiscoverabilityGrant(currentGrant) &&
        currentGrant.status === "active" &&
        currentGrant === input.expectedGrant &&
        currentGrant.callerId === input.expectedCallerId &&
        currentGrant.targetId === input.expectedTargetId &&
        currentGrant.email === input.expectedEmail &&
        currentGrant.agentReference === input.expectedAgentReference &&
        currentTarget !== null &&
        isAgentIdentityEligibleForPrincipal(currentTarget) &&
        currentTarget.id === input.expectedTargetId;
      if (valid && commitResponse === true) {
        events.push(input.event);
      }
      return valid ? commitResponse : false;
    },
  };
  const service = new DiscoveryService({
    directory,
    policy,
    budget: new InMemoryDiscoveryBudget(),
    events: eventPort,
    disclosureCommit,
    clock: { nowMs: () => 1_000 },
  });
  const request = {
    contract: DISCOVERY_REQUEST_CONTRACT_V1,
    email: "TARGET@example.TEST",
    correlationId: "corr-1",
  };

  return {
    caller,
    target,
    trustedPrincipal,
    directory,
    policy,
    eventPort,
    disclosureCommit,
    service,
    request,
    events,
    initialGrant,
    setGrants: (value: readonly unknown[]) => {
      grants = value;
    },
    getGrants: () => grants,
    setTarget: (value: AgentIdentity | null) => {
      currentTarget = value;
    },
    setCaller: (value: AgentIdentity | null) => {
      currentCaller = value;
    },
    rejectPrincipal: () => {
      trustedPrincipalValue = null;
    },
    setEventResponse: (value: unknown) => {
      eventResponse = value;
    },
    setCommitResponse: (value: unknown) => {
      commitResponse = value;
    },
    setCommitThrows: () => {
      commitThrows = true;
    },
    setOnFindGrants: (value: (() => void) | undefined) => {
      onFindGrants = value;
    },
    setOnFindTarget: (value: (() => void) | undefined) => {
      onFindTarget = value;
    },
  };
};

describe("AC-DIS-001 exact email and grant contracts", () => {
  it("canonicalizes exact ASCII email deterministically without provider transformations", () => {
    const accepted = [
      ["User.Name+tag@Example.COM", "user.name+tag@example.com"],
      ["a@localhost", "a@localhost"],
      ["x!#$%&'+/=^_`{|}~-@sub.example", "x!#$%&'+/=^_`{|}~-@sub.example"],
    ] as const;
    for (const [input, expected] of accepted) {
      const first = canonicalizeDiscoveryEmail(input);
      expect(first).toEqual({ ok: true, value: expected });
      expect(first.ok && canonicalizeDiscoveryEmail(first.value)).toEqual(first);
    }

    const invalid = [
      undefined,
      "",
      " user@example.test",
      "user@example.test ",
      "user @example.test",
      "ü@example.test",
      "user@@example.test",
      ".user@example.test",
      "user..name@example.test",
      "user@-example.test",
      "user@example-.test",
      "user@example..test",
      "prefix*@example.test",
      "prefix?@example.test",
      "User*Name@Example.TEST",
      "*@example.test",
      "user@*.test",
      "user@example.*",
      "?@example.test",
      `${"a".repeat(DISCOVERY_EMAIL_LOCAL_MAX_LENGTH + 1)}@example.test`,
      `${"a".repeat(245)}@example.test`,
    ];
    for (const input of invalid) {
      expect(canonicalizeDiscoveryEmail(input)).toEqual({
        ok: false,
        error: { code: "DISCOVERY_EMAIL_INVALID" },
      });
    }
    const maximum = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`;
    expect(maximum.length).toBe(254);
    expect(canonicalizeDiscoveryEmail(maximum).ok).toBe(true);
  });

  it("checks deterministic generated ASCII inputs without accidental collisions", () => {
    let seed = 0x5eed1234;
    const next = (): number => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed;
    };
    const canonical = new Set<string>();
    for (let index = 0; index < 256; index += 1) {
      const local = `user${next().toString(36)}.${index}`;
      const result = canonicalizeDiscoveryEmail(`${local.toUpperCase()}@EXAMPLE.TEST`);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(canonicalizeDiscoveryEmail(result.value)).toEqual(result);
        canonical.add(result.value);
      }
    }
    expect(canonical.size).toBe(256);
  });

  it("creates caller-scoped opaque references stable for a grant and rotated on recreation", () => {
    const caller = generateAgentIdentityId();
    const otherCaller = generateAgentIdentityId();
    const target = generateAgentIdentityId();
    const first = unwrap(createDiscoverabilityGrant(caller, target, "target@example.test"));
    const second = unwrap(createDiscoverabilityGrant(otherCaller, target, "target@example.test"));
    const recreated = unwrap(createDiscoverabilityGrant(caller, target, "target@example.test"));

    expect(first.agentReference).toMatch(/^pan_agent_ref_/);
    expect(first.agentReference).not.toContain(target);
    expect(first.agentReference).not.toBe(second.agentReference);
    expect(first.agentReference).not.toBe(recreated.agentReference);
    expect(first).toBe(first);
    const revoked = unwrap(revokeDiscoverabilityGrant(first));
    expect(revoked.status).toBe("revoked");
    expect(unwrap(revokeDiscoverabilityGrant(revoked))).toBe(revoked);
  });

  it("rejects malformed grants and hostile records", () => {
    const id = generateAgentIdentityId();
    expect(createDiscoverabilityGrant("bad", id, "x@example.test").ok).toBe(false);
    expect(createDiscoverabilityGrant(id, "bad", "x@example.test").ok).toBe(false);
    expect(createDiscoverabilityGrant(id, id, "bad").ok).toBe(false);
    for (const value of [null, [], {}, { kind: "discoverability-grant" }]) {
      expect(isDiscoverabilityGrant(value)).toBe(false);
      expect(revokeDiscoverabilityGrant(value).ok).toBe(false);
    }
    class GrantLike {}
    expect(isDiscoverabilityGrant(new GrantLike())).toBe(false);
    const valid = unwrap(createDiscoverabilityGrant(id, id, "x@example.test"));
    expect(isDiscoverabilityGrant({ ...valid, email: "X@EXAMPLE.TEST" })).toBe(false);
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(isDiscoverabilityGrant(revoked.proxy)).toBe(false);
  });
});

describe("AC-DIS-001 discovery application boundary", () => {
  it("returns only the version and opaque reference for the sole permitted cell", async () => {
    const f = fixture();
    const identityState = JSON.stringify([f.caller, f.target]);
    const grantState = f.getGrants();
    const result = await f.service.discover(
      f.trustedPrincipal,
      trustedSource("source-1"),
      f.request,
    );

    expect(result).toEqual({
      contract: DISCOVERY_RESULT_CONTRACT_V1,
      agentReference: f.initialGrant.agentReference,
    });
    expect(JSON.stringify([f.caller, f.target])).toBe(identityState);
    expect(f.getGrants()).toBe(grantState);
    const allowedEvent = {
      contract: "pan.discovery-event/v1" as const,
      correlationId: "corr-1",
      callerId: f.caller.id,
      outcome: "resolved" as const,
      control: "none" as const,
    };
    expect(f.events).toEqual([allowedEvent]);
    expect(JSON.stringify(f.events)).not.toContain(f.target.id);
    expect(JSON.stringify(f.events)).not.toContain("example.test");
    expect(JSON.stringify(f.events)).not.toContain("pan_agent_ref_");
    expect(
      await f.service.discover(f.trustedPrincipal, trustedSource("source-1"), f.request),
    ).toEqual(result);
    expect(f.events).toEqual([allowedEvent, allowedEvent]);
  });

  it("keeps every negative class externally identical and emits minimized evidence", async () => {
    const cases: Array<(f: Fixture) => void> = [
      (f) => f.setGrants([]),
      (f) => f.setGrants([{}, {}]),
      (f) => f.setGrants([{}]),
      (f) => f.rejectPrincipal(),
      (f) => f.setCaller(unwrap(setAgentIdentityStatus(f.caller, "disabled"))),
      (f) => f.setTarget(null),
    ];
    for (const configure of cases) {
      const f = fixture();
      configure(f);
      expect(
        await f.service.discover(f.trustedPrincipal, trustedSource("source-1"), f.request),
      ).toBe(DISCOVERY_NEGATIVE_V1);
    }

    const f = fixture();
    f.setTarget(unwrap(setAgentIdentityStatus(f.target, "disabled")));
    expect(await f.service.discover(f.trustedPrincipal, trustedSource("source-1"), f.request)).toBe(
      DISCOVERY_NEGATIVE_V1,
    );
    expect(JSON.stringify(f.events)).not.toContain("example.test");
    expect(JSON.stringify(f.events)).not.toContain("pan_agent_ref_");
    expect(JSON.stringify(f.events)).not.toContain(f.target.id);
    expect(f.events).toEqual([
      {
        contract: "pan.discovery-event/v1",
        correlationId: "corr-1",
        callerId: f.caller.id,
        outcome: "not-resolved",
        control: "none",
      },
    ]);
    expect(f.getGrants()).toEqual([f.initialGrant]);
  });

  it("requires exact true from budget and event ports", async () => {
    for (const value of [false, 0, 1, "true", {}, null, undefined]) {
      const budgetFixture = fixture();
      const budgetService = new DiscoveryService({
        directory: budgetFixture.directory,
        policy: budgetFixture.policy,
        budget: { consume: async () => value },
        events: budgetFixture.eventPort,
        disclosureCommit: budgetFixture.disclosureCommit,
        clock: { nowMs: () => 1 },
      });
      expect(
        await budgetService.discover(
          budgetFixture.trustedPrincipal,
          trustedSource(),
          budgetFixture.request,
        ),
      ).toBe(DISCOVERY_NEGATIVE_V1);

      const eventFixture = fixture();
      eventFixture.setCommitResponse(value);
      expect(
        await eventFixture.service.discover(
          eventFixture.trustedPrincipal,
          trustedSource(),
          eventFixture.request,
        ),
      ).toBe(DISCOVERY_NEGATIVE_V1);

      const negativeEventFixture = fixture();
      negativeEventFixture.setGrants([]);
      negativeEventFixture.setEventResponse(value);
      expect(
        await negativeEventFixture.service.discover(
          negativeEventFixture.trustedPrincipal,
          trustedSource(),
          negativeEventFixture.request,
        ),
      ).toBe(DISCOVERY_NEGATIVE_V1);
      expect(
        negativeEventFixture.events.filter((event) => event.outcome === "resolved"),
      ).toHaveLength(0);
    }
  });

  it("rejects two active grants and provider-style aliases without disclosure", async () => {
    const ambiguous = fixture();
    ambiguous.setGrants([
      ambiguous.initialGrant,
      unwrap(
        createDiscoverabilityGrant(ambiguous.caller.id, ambiguous.target.id, "target@example.test"),
      ),
    ]);
    expect(
      await ambiguous.service.discover(
        ambiguous.trustedPrincipal,
        trustedSource(),
        ambiguous.request,
      ),
    ).toBe(DISCOVERY_NEGATIVE_V1);
    expect(ambiguous.events).toEqual([
      {
        contract: "pan.discovery-event/v1",
        correlationId: "corr-1",
        callerId: ambiguous.caller.id,
        outcome: "not-resolved",
        control: "none",
      },
    ]);

    const aliasFixture = fixture();
    const aliasGrant = unwrap(
      createDiscoverabilityGrant(
        aliasFixture.caller.id,
        aliasFixture.target.id,
        "User.Name+tag@Example.COM",
      ),
    );
    aliasFixture.setGrants([aliasGrant]);
    const aliasRequest = {
      ...aliasFixture.request,
      email: "User.Name+tag@Example.COM",
    };
    expect(
      await aliasFixture.service.discover(
        aliasFixture.trustedPrincipal,
        trustedSource(),
        aliasRequest,
      ),
    ).toEqual({
      contract: DISCOVERY_RESULT_CONTRACT_V1,
      agentReference: aliasGrant.agentReference,
    });
    expect(JSON.stringify(aliasFixture.events)).not.toContain("example.com");
    expect(JSON.stringify(aliasFixture.events)).not.toContain("pan_agent_ref_");
    for (const email of [
      "username+tag@example.com",
      "user.name@example.com",
      "user.name+tag@example.test",
      "üser.name+tag@example.com",
    ]) {
      const negative = fixture();
      negative.setGrants([
        unwrap(
          createDiscoverabilityGrant(
            negative.caller.id,
            negative.target.id,
            "User.Name+tag@Example.COM",
          ),
        ),
      ]);
      expect(
        await negative.service.discover(negative.trustedPrincipal, trustedSource(), {
          ...negative.request,
          email,
        }),
      ).toBe(DISCOVERY_NEGATIVE_V1);
    }
  });

  it("keeps minimized events allowlisted for unknown, unlisted, malformed, and budget outcomes", async () => {
    const unknown = fixture();
    unknown.setGrants([]);
    expect(
      await unknown.service.discover(unknown.trustedPrincipal, trustedSource(), unknown.request),
    ).toBe(DISCOVERY_NEGATIVE_V1);
    expect(unknown.events).toEqual([
      {
        contract: "pan.discovery-event/v1",
        correlationId: "corr-1",
        callerId: unknown.caller.id,
        outcome: "not-resolved",
        control: "none",
      },
    ]);

    const unlisted = fixture();
    unlisted.setGrants([
      unwrap(
        createDiscoverabilityGrant(
          generateAgentIdentityId(),
          unlisted.target.id,
          "target@example.test",
        ),
      ),
    ]);
    expect(
      await unlisted.service.discover(unlisted.trustedPrincipal, trustedSource(), unlisted.request),
    ).toBe(DISCOVERY_NEGATIVE_V1);
    expect(unlisted.events).toEqual([
      {
        contract: "pan.discovery-event/v1",
        correlationId: "corr-1",
        callerId: unlisted.caller.id,
        outcome: "not-resolved",
        control: "none",
      },
    ]);
    expect(JSON.stringify(unlisted.events)).not.toContain(unlisted.target.id);

    const malformed = fixture();
    expect(
      await malformed.service.discover(malformed.trustedPrincipal, trustedSource(), {
        ...malformed.request,
        email: "bad",
      }),
    ).toBe(DISCOVERY_NEGATIVE_V1);
    expect(malformed.events).toEqual([
      {
        contract: "pan.discovery-event/v1",
        correlationId: "corr-1",
        callerId: malformed.caller.id,
        outcome: "not-resolved",
        control: "validation",
      },
    ]);

    const budgetFixture = fixture();
    const budgetService = new DiscoveryService({
      directory: budgetFixture.directory,
      policy: budgetFixture.policy,
      budget: { consume: async () => false },
      events: budgetFixture.eventPort,
      disclosureCommit: budgetFixture.disclosureCommit,
      clock: { nowMs: () => 1 },
    });
    expect(
      await budgetService.discover(
        budgetFixture.trustedPrincipal,
        trustedSource(),
        budgetFixture.request,
      ),
    ).toBe(DISCOVERY_NEGATIVE_V1);
    expect(budgetFixture.events).toEqual([
      {
        contract: "pan.discovery-event/v1",
        correlationId: "corr-1",
        callerId: budgetFixture.caller.id,
        outcome: "not-resolved",
        control: "budget",
      },
    ]);
    for (const events of [
      unknown.events,
      unlisted.events,
      malformed.events,
      budgetFixture.events,
    ]) {
      const serialized = JSON.stringify(events);
      expect(serialized).not.toContain("example.test");
      expect(serialized).not.toContain("pan_agent_ref_");
      expect(serialized).not.toContain("caller-limit");
      expect(serialized).not.toContain("source-limit");
      expect(serialized).not.toContain("global-limit");
    }
  });

  it("does not key abuse budgets by target or lookup identifier", async () => {
    const caller = unwrap(
      createAgentIdentity(generateAgentIdentityId(), generateHumanIdentityId()),
    );
    const firstTarget = unwrap(
      createAgentIdentity(generateAgentIdentityId(), generateHumanIdentityId()),
    );
    const secondTarget = unwrap(
      createAgentIdentity(generateAgentIdentityId(), generateHumanIdentityId()),
    );
    const firstGrant = unwrap(
      createDiscoverabilityGrant(caller.id, firstTarget.id, "first@example.test"),
    );
    const secondGrant = unwrap(
      createDiscoverabilityGrant(caller.id, secondTarget.id, "second@example.test"),
    );
    const inputs: Array<Readonly<Record<string, unknown>>> = [];
    let activeGrant = firstGrant;
    let activeTarget = firstTarget;
    const budget = new InMemoryDiscoveryBudget({
      windowMs: 60_000,
      callerLimit: 1,
      sourceLimit: 10,
      globalLimit: 10,
    });
    const service = new DiscoveryService({
      directory: {
        resolveCaller: async () => caller,
        findTarget: async (targetId) => (activeTarget.id === targetId ? activeTarget : null),
      },
      policy: { findGrants: async () => [activeGrant] },
      budget: {
        consume: async (input) => {
          inputs.push(input);
          return budget.consume(input);
        },
      },
      events: { acknowledge: async () => true },
      disclosureCommit: { commit: async () => true },
      clock: { nowMs: () => 5_000 },
    });
    const sharedSource = trustedSource("shared-source");
    expect(
      await service.discover(principalFor(caller), sharedSource, {
        ...fixture().request,
        email: "first@example.test",
      }),
    ).toEqual({
      contract: DISCOVERY_RESULT_CONTRACT_V1,
      agentReference: firstGrant.agentReference,
    });
    activeGrant = secondGrant;
    activeTarget = secondTarget;
    expect(
      await service.discover(principalFor(caller), sharedSource, {
        ...fixture().request,
        email: "second@example.test",
      }),
    ).toBe(DISCOVERY_NEGATIVE_V1);
    expect(inputs).toHaveLength(2);
    for (const input of inputs) {
      expect(Reflect.ownKeys(input)).toEqual(["callerId", "sourceKey", "nowMs"]);
      expect(input.sourceKey).toBe("shared-source");
      expect(input.callerId).toBe(caller.id);
      const serialized = JSON.stringify(input);
      expect(serialized).not.toContain("example.test");
      expect(serialized).not.toContain(firstTarget.id);
      expect(serialized).not.toContain(secondTarget.id);
    }
  });

  it("binds the resolved active caller to the authenticated principal", async () => {
    const f = fixture();
    f.setCaller(unwrap(createAgentIdentity(generateAgentIdentityId(), generateHumanIdentityId())));
    expect(await f.service.discover(f.trustedPrincipal, trustedSource(), f.request)).toBe(
      DISCOVERY_NEGATIVE_V1,
    );
  });

  it("revalidates grant and target after event acknowledgement before disclosure", async () => {
    const priorPolicyAwait = fixture();
    priorPolicyAwait.setOnFindGrants(() =>
      priorPolicyAwait.setGrants([
        unwrap(revokeDiscoverabilityGrant(priorPolicyAwait.initialGrant)),
      ]),
    );
    expect(
      await priorPolicyAwait.service.discover(
        priorPolicyAwait.trustedPrincipal,
        trustedSource(),
        priorPolicyAwait.request,
      ),
    ).toBe(DISCOVERY_NEGATIVE_V1);
    expect(priorPolicyAwait.events.filter((event) => event.outcome === "resolved")).toHaveLength(0);

    for (const mutate of [
      (f: Fixture) => f.setGrants([unwrap(revokeDiscoverabilityGrant(f.initialGrant))]),
      (f: Fixture) =>
        f.setGrants([
          unwrap(createDiscoverabilityGrant(f.caller.id, f.target.id, "target@example.test")),
        ]),
      (f: Fixture) => f.setTarget(unwrap(setAgentIdentityStatus(f.target, "disabled"))),
    ]) {
      const f = fixture();
      f.setOnFindTarget(() => mutate(f));
      expect(await f.service.discover(f.trustedPrincipal, trustedSource(), f.request)).toBe(
        DISCOVERY_NEGATIVE_V1,
      );
      expect(f.events.filter((event) => event.outcome === "resolved")).toHaveLength(0);
    }

    const throwing = fixture();
    throwing.setCommitThrows();
    expect(
      await throwing.service.discover(throwing.trustedPrincipal, trustedSource(), throwing.request),
    ).toBe(DISCOVERY_NEGATIVE_V1);
    expect(throwing.events.filter((event) => event.outcome === "resolved")).toHaveLength(0);
  });

  it("acknowledges only a minimized not-resolved event when disclosure commit is not exact true", async () => {
    for (const value of [false, 0, "true", {}, null]) {
      const f = fixture();
      f.setCommitResponse(value);
      expect(await f.service.discover(f.trustedPrincipal, trustedSource(), f.request)).toBe(
        DISCOVERY_NEGATIVE_V1,
      );
      expect(f.events).toEqual([
        {
          contract: "pan.discovery-event/v1",
          correlationId: "corr-1",
          callerId: f.caller.id,
          outcome: "not-resolved",
          control: "dependency",
        },
      ]);
      const serialized = JSON.stringify(f.events);
      expect(serialized).not.toContain(f.target.id);
      expect(serialized).not.toContain("example.test");
      expect(serialized).not.toContain("pan_agent_ref_");
    }

    const unacknowledged = fixture();
    unacknowledged.setCommitResponse(false);
    unacknowledged.setEventResponse(false);
    expect(
      await unacknowledged.service.discover(
        unacknowledged.trustedPrincipal,
        trustedSource(),
        unacknowledged.request,
      ),
    ).toBe(DISCOVERY_NEGATIVE_V1);
    expect(unacknowledged.events.filter((event) => event.outcome === "resolved")).toHaveLength(0);
  });

  it("rotates the public reference after revocation and grant recreation", async () => {
    const f = fixture();
    const identityState = JSON.stringify([f.caller, f.target]);
    const first = await f.service.discover(f.trustedPrincipal, trustedSource(), f.request);
    f.setGrants([unwrap(revokeDiscoverabilityGrant(f.initialGrant))]);
    expect(await f.service.discover(f.trustedPrincipal, trustedSource(), f.request)).toBe(
      DISCOVERY_NEGATIVE_V1,
    );
    const recreated = unwrap(
      createDiscoverabilityGrant(f.caller.id, f.target.id, "target@example.test"),
    );
    f.setGrants([recreated]);
    expect(await f.service.discover(f.trustedPrincipal, trustedSource(), f.request)).toEqual({
      contract: DISCOVERY_RESULT_CONTRACT_V1,
      agentReference: recreated.agentReference,
    });
    expect(recreated.agentReference).not.toBe(f.initialGrant.agentReference);
    expect(JSON.stringify([f.caller, f.target])).toBe(identityState);
    expect(first).toEqual({
      contract: DISCOVERY_RESULT_CONTRACT_V1,
      agentReference: f.initialGrant.agentReference,
    });
  });

  it("fails closed on malformed requests, sources, budgets, and dependency failures", async () => {
    const malformed = [
      null,
      [],
      {},
      { ...fixture().request, extra: true },
      { ...fixture().request, contract: "v2" },
      { ...fixture().request, email: 1 },
      { ...fixture().request, correlationId: " bad" },
      Object.create({ contract: DISCOVERY_REQUEST_CONTRACT_V1 }),
    ];
    for (const request of malformed) {
      const f = fixture();
      expect(await f.service.discover(f.trustedPrincipal, trustedSource(), request)).toBe(
        DISCOVERY_NEGATIVE_V1,
      );
    }

    const hostile = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("trap");
        },
      },
    );
    const f = fixture();
    expect(await f.service.discover(f.trustedPrincipal, trustedSource(), hostile)).toBe(
      DISCOVERY_NEGATIVE_V1,
    );
    expect(await f.service.discover(f.trustedPrincipal, trustedSource(" bad"), f.request)).toBe(
      DISCOVERY_NEGATIVE_V1,
    );
    const inheritedSource = { unused: true, other: true };
    const prototype = Object.prototype as Record<string, unknown>;
    const priorKind = Object.getOwnPropertyDescriptor(prototype, "kind");
    const priorKey = Object.getOwnPropertyDescriptor(prototype, "key");
    Object.defineProperty(prototype, "kind", {
      configurable: true,
      enumerable: false,
      value: "trusted-discovery-source",
    });
    Object.defineProperty(prototype, "key", {
      configurable: true,
      enumerable: false,
      value: "source",
    });
    try {
      const inherited = fixture();
      expect(
        await inherited.service.discover(
          inherited.trustedPrincipal,
          inheritedSource as unknown as TrustedDiscoverySource,
          inherited.request,
        ),
      ).toBe(DISCOVERY_NEGATIVE_V1);
      expect(inherited.events).toEqual([
        {
          contract: "pan.discovery-event/v1",
          correlationId: "corr-1",
          callerId: "unresolved",
          outcome: "not-resolved",
          control: "validation",
        },
      ]);
    } finally {
      if (priorKind === undefined) {
        delete prototype.kind;
      } else {
        Object.defineProperty(prototype, "kind", priorKind);
      }
      if (priorKey === undefined) {
        delete prototype.key;
      } else {
        Object.defineProperty(prototype, "key", priorKey);
      }
    }
    for (const email of ["*@example.test", "user@*.test", "user@example.*"]) {
      expect(
        await f.service.discover(f.trustedPrincipal, trustedSource(), { ...f.request, email }),
      ).toBe(DISCOVERY_NEGATIVE_V1);
    }
    for (const invalidSource of [
      null,
      "source",
      { kind: "trusted-discovery-source", extra: true },
      { kind: "trusted-discovery-source", key: 1 },
      { kind: "untrusted-source", key: "source" },
      { kind: "trusted-discovery-source", key: "source", extra: true },
      Object.defineProperties(
        {},
        {
          kind: { enumerable: true, value: "trusted-discovery-source" },
          key: { enumerable: true, get: () => "source" },
        },
      ),
    ]) {
      expect(
        await f.service.discover(
          f.trustedPrincipal,
          invalidSource as unknown as TrustedDiscoverySource,
          f.request,
        ),
      ).toBe(DISCOVERY_NEGATIVE_V1);
    }
    const hostileSource = new Proxy(trustedSource(), {
      getPrototypeOf: () => {
        throw new Error("source trap");
      },
    });
    expect(await f.service.discover(f.trustedPrincipal, hostileSource, f.request)).toBe(
      DISCOVERY_NEGATIVE_V1,
    );

    expect(
      await f.service.discover(f.trustedPrincipal, trustedSource(), { ...f.request, email: "bad" }),
    ).toBe(DISCOVERY_NEGATIVE_V1);

    const budgetDenied = new DiscoveryService({
      directory: f.directory,
      policy: f.policy,
      budget: { consume: async () => false },
      events: f.eventPort,
      disclosureCommit: f.disclosureCommit,
      clock: { nowMs: () => 1 },
    });
    let policyCalls = 0;
    let targetCalls = 0;
    f.setOnFindGrants(() => {
      policyCalls += 1;
    });
    f.setOnFindTarget(() => {
      targetCalls += 1;
    });
    expect(await budgetDenied.discover(f.trustedPrincipal, trustedSource(), f.request)).toBe(
      DISCOVERY_NEGATIVE_V1,
    );
    expect(policyCalls).toBe(0);
    expect(targetCalls).toBe(0);

    let budgetCalls = 0;
    const countingBudget: DiscoveryBudgetPort = {
      consume: async () => {
        budgetCalls += 1;
        return true;
      },
    };
    const countsMalformed = new DiscoveryService({
      directory: f.directory,
      policy: f.policy,
      budget: countingBudget,
      events: f.eventPort,
      disclosureCommit: f.disclosureCommit,
      clock: { nowMs: () => 1 },
    });
    await countsMalformed.discover(f.trustedPrincipal, trustedSource(), {});
    expect(budgetCalls).toBe(1);

    for (const failing of ["directory", "policy", "budget", "events", "commit"] as const) {
      const base = fixture();
      const boom = async (): Promise<never> => {
        throw new Error("private dependency detail");
      };
      const service = new DiscoveryService({
        directory:
          failing === "directory"
            ? { resolveCaller: boom, findTarget: base.directory.findTarget }
            : base.directory,
        policy:
          failing === "policy"
            ? { findGrants: boom }
            : failing === "events"
              ? { findGrants: async () => [] }
              : base.policy,
        budget: failing === "budget" ? { consume: boom } : new InMemoryDiscoveryBudget(),
        events: failing === "events" ? { acknowledge: boom } : base.eventPort,
        disclosureCommit: failing === "commit" ? { commit: boom } : base.disclosureCommit,
        clock: { nowMs: () => 1 },
      });
      expect(await service.discover(base.trustedPrincipal, trustedSource(), base.request)).toBe(
        DISCOVERY_NEGATIVE_V1,
      );
      expect(JSON.stringify(base.events)).not.toContain("private dependency detail");
    }
  });

  it("rejects stale, mismatched, and revoked grants immediately", async () => {
    const f = fixture();
    const other = generateAgentIdentityId();
    const mismatch = unwrap(createDiscoverabilityGrant(other, f.target.id, "target@example.test"));
    f.setGrants([mismatch]);
    expect(await f.service.discover(f.trustedPrincipal, trustedSource(), f.request)).toBe(
      DISCOVERY_NEGATIVE_V1,
    );

    const grant = unwrap(
      createDiscoverabilityGrant(f.caller.id, f.target.id, "target@example.test"),
    );
    f.setGrants([unwrap(revokeDiscoverabilityGrant(grant))]);
    expect(await f.service.discover(f.trustedPrincipal, trustedSource(), f.request)).toBe(
      DISCOVERY_NEGATIVE_V1,
    );

    const wrongEmail = unwrap(
      createDiscoverabilityGrant(f.caller.id, f.target.id, "other@example.test"),
    );
    f.setGrants([wrongEmail]);
    expect(await f.service.discover(f.trustedPrincipal, trustedSource(), f.request)).toBe(
      DISCOVERY_NEGATIVE_V1,
    );

    const wrongTarget = unwrap(
      createAgentIdentity(generateAgentIdentityId(), generateHumanIdentityId()),
    );
    f.setGrants([grant]);
    f.setTarget(wrongTarget);
    expect(await f.service.discover(f.trustedPrincipal, trustedSource(), f.request)).toBe(
      DISCOVERY_NEGATIVE_V1,
    );
  });
});

describe("AC-DIS-001 process-local layered budgets", () => {
  it("enforces caller, source, and global rolling limits atomically under concurrency", async () => {
    const caller = generateAgentIdentityId();
    const otherCaller = generateAgentIdentityId();
    const budget = new InMemoryDiscoveryBudget({
      windowMs: 100,
      callerLimit: 2,
      sourceLimit: 3,
      globalLimit: 4,
    });
    const consume = (callerId = caller, sourceKey = "source", nowMs = 10) =>
      budget.consume({ callerId, sourceKey, nowMs });

    expect(await Promise.all([consume(), consume(), consume()])).toEqual([true, true, false]);
    expect(await consume(otherCaller, "other-source")).toBe(true);
    expect(await consume(generateAgentIdentityId(), "third-source")).toBe(false);
    expect(await consume(caller, "source", 111)).toBe(true);

    const sourceBound = new InMemoryDiscoveryBudget({
      windowMs: 100,
      callerLimit: 3,
      sourceLimit: 1,
      globalLimit: 3,
    });
    expect(await sourceBound.consume({ callerId: caller, sourceKey: "shared", nowMs: 1 })).toBe(
      true,
    );
    expect(
      await sourceBound.consume({ callerId: otherCaller, sourceKey: "shared", nowMs: 1 }),
    ).toBe(false);
  });

  it("uses documented defaults, rejects invalid configuration, and resets with a new instance", async () => {
    expect(DEFAULT_DISCOVERY_BUDGETS).toEqual({
      windowMs: 60_000,
      callerLimit: 30,
      sourceLimit: 60,
      globalLimit: 1_000,
    });
    for (const invalid of [0, -1, 1.5, Number.NaN]) {
      expect(
        () =>
          new InMemoryDiscoveryBudget({
            ...DEFAULT_DISCOVERY_BUDGETS,
            callerLimit: invalid,
          }),
      ).toThrow(TypeError);
    }
    const first = new InMemoryDiscoveryBudget({
      windowMs: 10,
      callerLimit: 1,
      sourceLimit: 1,
      globalLimit: 1,
    });
    const input = { callerId: generateAgentIdentityId(), sourceKey: "source", nowMs: 1 };
    expect(await first.consume(input)).toBe(true);
    expect(await first.consume(input)).toBe(false);
    expect(
      await new InMemoryDiscoveryBudget({
        windowMs: 10,
        callerLimit: 1,
        sourceLimit: 1,
        globalLimit: 1,
      }).consume(input),
    ).toBe(true);
    expect(await first.consume({ ...input, callerId: "bad" as typeof input.callerId })).toBe(false);
    expect(await first.consume({ ...input, sourceKey: " bad" })).toBe(false);
    expect(await first.consume({ ...input, nowMs: Number.NaN })).toBe(false);
    expect(await first.consume({ ...input, nowMs: -1 })).toBe(false);
  });

  it("bounds high-cardinality keys by the global window and reclaims them after rollover", async () => {
    const budget = new InMemoryDiscoveryBudget({
      windowMs: 10,
      callerLimit: 2,
      sourceLimit: 2,
      globalLimit: 5,
    });
    const outcomes = await Promise.all(
      Array.from({ length: 1_000 }, (_, index) =>
        budget.consume({
          callerId: generateAgentIdentityId(),
          sourceKey: `source-${index}`,
          nowMs: 1,
        }),
      ),
    );
    expect(outcomes.filter(Boolean)).toHaveLength(5);
    expect(
      await budget.consume({
        callerId: generateAgentIdentityId(),
        sourceKey: "after-rollover",
        nowMs: 12,
      }),
    ).toBe(true);
  });
});
