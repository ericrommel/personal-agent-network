import { describe, expect, it } from "vitest";
import {
  type AgentIdentity,
  createAgentIdentity,
  setAgentIdentityStatus,
} from "../../../../src/modules/identity/index.js";
import {
  AVAILABILITY_SKILL_VERSION_V1,
  advertisementKey,
  createSkillAdvertisement,
  InMemorySkillAdvertisementStore,
  isPinnedSkillVersion,
  isSkillAdvertisement,
  SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
  SKILL_ADVERTISEMENT_EVENT_CONTRACT_V1,
  type SkillAdvertisement,
  type SkillAdvertisementEvent,
  type SkillAdvertisementEventSink,
  SkillAdvertisementService,
  type SkillAdvertisementStorePort,
  type TrustedSkillAdvertisementSource,
  withdrawSkillAdvertisement,
} from "../../../../src/modules/skills/index.js";
import { failure } from "../../../../src/shared/domain/result.js";

const AGENT = "pan_agent_11111111-1111-4111-8111-111111111111";
const OTHER = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const VERSION = AVAILABILITY_SKILL_VERSION_V1;
const RECORD_KEYS = ["kind", "id", "agentId", "skillVersion", "status"];
const EVENT_KEYS = ["contract", "correlationId", "sourceKey", "command", "outcome", "control"];

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

const source = (key = "local-owner"): TrustedSkillAdvertisementSource =>
  ({ kind: "trusted-skill-advertisement-source", key }) as TrustedSkillAdvertisementSource;

const advertiseCommand = (agentId = AGENT, correlationId = "corr-1") => ({
  contract: SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
  action: "advertise" as const,
  correlationId,
  agentId,
  skillVersion: VERSION,
});

const withdrawCommand = (advertisementId: string, agentId = AGENT) => ({
  contract: SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
  action: "withdraw" as const,
  correlationId: "corr-withdraw",
  agentId,
  skillVersion: VERSION,
  advertisementId,
});

const code = (name: string) => failure({ code: name });

const harness = (
  parties: AgentIdentity[] = [agent(AGENT)],
  options?: {
    findAgent?: (id: unknown) => Promise<unknown>;
    record?: SkillAdvertisementEventSink["record"];
    store?: SkillAdvertisementStorePort;
    seed?: ReadonlyArray<readonly [string, unknown]>;
  },
) => {
  const recorded: SkillAdvertisementEvent[] = [];
  const sink: SkillAdvertisementEventSink = {
    record(event) {
      recorded.push(event);
      options?.record?.(event);
    },
  };
  const store = options?.store ?? new InMemorySkillAdvertisementStore(sink, options?.seed);
  const service = new SkillAdvertisementService({
    events: sink,
    store,
    parties: {
      findAgent:
        options?.findAgent ?? (async (id) => parties.find((party) => party.id === id) ?? null),
    },
  });
  return { service, store, recorded };
};

describe("skill advertisement domain", () => {
  it("AC-DOM-001 records no permission, relationship, or discovery fields", () => {
    const record = unwrap(createSkillAdvertisement(AGENT));
    expect(Object.keys(record)).toEqual(RECORD_KEYS);
    expect(record).not.toHaveProperty("permission");
    expect(record).not.toHaveProperty("purpose");
    expect(record).not.toHaveProperty("relationship");
    expect(isSkillAdvertisement({ ...record, permission: "ALLOW" })).toBe(false);
    expect(isPinnedSkillVersion("pan.skill.other/v1")).toBe(false);
    expect(advertisementKey(AGENT, "pan.skill.other/v1")).toBeNull();
    expect(advertisementKey("pan_agent_not-a-uuid", VERSION)).toBeNull();
  });

  it("rejects an unreadable record", () => {
    const record = unwrap(createSkillAdvertisement(AGENT));
    const explosive = new Proxy(record, {
      get() {
        throw new Error("unreadable");
      },
    });
    expect(isSkillAdvertisement(explosive)).toBe(false);
    expect(isSkillAdvertisement(Object.create({ kind: "skill-advertisement" }))).toBe(false);
    expect(withdrawSkillAdvertisement(explosive)).toEqual(
      code("SKILL_ADVERTISEMENT_COMMAND_INVALID"),
    );
  });

  it("withdraws once and allocates a new id on each create", () => {
    const first = unwrap(createSkillAdvertisement(AGENT));
    const second = unwrap(createSkillAdvertisement(AGENT));
    const withdrawn = unwrap(withdrawSkillAdvertisement(first));
    expect(first.id).not.toBe(second.id);
    expect(withdrawn.id).toBe(first.id);
    expect(withdrawn.status).toBe("withdrawn");
    expect(first.status).toBe("advertised");
    expect(unwrap(withdrawSkillAdvertisement(withdrawn))).toBe(withdrawn);
    expect(createSkillAdvertisement("pan_human_33333333-3333-4333-8333-333333333333")).toEqual(
      code("SKILL_ADVERTISEMENT_COMMAND_INVALID"),
    );
  });
});

describe("skill advertisement service", () => {
  it("advertises one local skill without creating a permission", async () => {
    const { service, recorded, store } = harness();
    const created = unwrap(await service.advertise(source(), advertiseCommand()));

    expect(Object.keys(created)).toEqual(RECORD_KEYS);
    expect(created.skillVersion).toBe(VERSION);
    expect(created.status).toBe("advertised");
    expect(await service.readAdvertised(AGENT, VERSION)).toBe(true);
    expect(await service.readAdvertised(OTHER, VERSION)).toBe(false);
    expect(await service.readAdvertised(AGENT, "pan.skill.other/v1")).toBe(false);
    expect(Object.keys(recorded[0] ?? {})).toEqual(EVENT_KEYS);
    expect(JSON.stringify(recorded)).not.toContain(AGENT);
    expect(JSON.stringify(recorded)).not.toContain(created.id);
    expect(isSkillAdvertisement(store.findCurrent(AGENT, VERSION))).toBe(true);
  });

  it("conflicts while advertised and allocates a new id after withdrawal", async () => {
    const { service, store } = harness();
    const first = unwrap(await service.advertise(source(), advertiseCommand()));
    expect(await service.advertise(source(), advertiseCommand(AGENT, "corr-2"))).toEqual(
      code("SKILL_ADVERTISEMENT_CONFLICT"),
    );
    const withdrawn = unwrap(await service.withdraw(source(), withdrawCommand(first.id)));
    expect(Object.keys(withdrawn)).toEqual(RECORD_KEYS);
    expect(Object.keys(store.findCurrent(AGENT, VERSION) as object)).toEqual(RECORD_KEYS);
    expect(await service.readAdvertised(AGENT, VERSION)).toBe(false);
    const second = unwrap(await service.advertise(source(), advertiseCommand(AGENT, "corr-3")));
    expect(second.id).not.toBe(first.id);
    expect(await service.withdraw(source(), withdrawCommand(first.id))).toEqual(
      code("SKILL_ADVERTISEMENT_NOT_FOUND"),
    );
    expect((store.findCurrent(AGENT, VERSION) as SkillAdvertisement).id).toBe(second.id);
  });

  it("stores nothing for invalid commands", async () => {
    const { service, store, recorded } = harness();
    const discovery = `pan_agent_ref_${AGENT.slice("pan_agent_".length)}`;
    const human = `pan_human_${AGENT.slice("pan_agent_".length)}`;
    expect(await service.advertise(source(), advertiseCommand(discovery))).toEqual(
      code("SKILL_ADVERTISEMENT_COMMAND_INVALID"),
    );
    expect(await service.advertise(source(), advertiseCommand(human))).toEqual(
      code("SKILL_ADVERTISEMENT_COMMAND_INVALID"),
    );
    expect(
      await service.advertise(source(), {
        ...advertiseCommand(),
        skillVersion: "pan.skill.other/v1",
      }),
    ).toEqual(code("SKILL_ADVERTISEMENT_COMMAND_INVALID"));
    expect(await service.advertise(source(), { ...advertiseCommand(), action: "grant" })).toEqual(
      code("SKILL_ADVERTISEMENT_COMMAND_INVALID"),
    );
    expect(await service.advertise(source(), { ...advertiseCommand(), extra: true })).toEqual(
      code("SKILL_ADVERTISEMENT_COMMAND_INVALID"),
    );
    expect(await service.advertise(source(), null)).toEqual(
      code("SKILL_ADVERTISEMENT_COMMAND_INVALID"),
    );
    expect(await service.advertise(source("bad key"), advertiseCommand())).toEqual(
      code("SKILL_ADVERTISEMENT_COMMAND_INVALID"),
    );
    expect(
      await service.withdraw(
        source(),
        withdrawCommand("pan_skill_ad_33333333-3333-1333-8333-333333333333"),
      ),
    ).toEqual(code("SKILL_ADVERTISEMENT_COMMAND_INVALID"));
    expect(await service.withdraw(source(), null)).toEqual(
      code("SKILL_ADVERTISEMENT_COMMAND_INVALID"),
    );
    expect(
      await service.withdraw(source(), {
        ...withdrawCommand("pan_skill_ad_33333333-3333-4333-8333-333333333333"),
        skillVersion: "pan.skill.other/v1",
      }),
    ).toEqual(code("SKILL_ADVERTISEMENT_COMMAND_INVALID"));
    const inherited = Object.assign(Object.create({ leaked: true }), advertiseCommand());
    expect(await service.advertise(source(), inherited)).toEqual(
      code("SKILL_ADVERTISEMENT_COMMAND_INVALID"),
    );
    const accessor = advertiseCommand();
    Object.defineProperty(accessor, "correlationId", {
      enumerable: true,
      get: () => "corr-1",
    });
    expect(await service.advertise(source(), accessor)).toEqual(
      code("SKILL_ADVERTISEMENT_COMMAND_INVALID"),
    );
    expect(store.findCurrent(AGENT, VERSION)).toBeNull();
    expect(recorded.every((event) => Object.keys(event).join() === EVENT_KEYS.join())).toBe(true);
  });

  it("does not advertise a missing, disabled, or unavailable agent", async () => {
    const missing = harness([]);
    const disabled = harness([agent(AGENT, "disabled")]);
    const thrown = harness([], {
      findAgent: async () => {
        throw new Error("directory down");
      },
    });
    expect(await missing.service.advertise(source(), advertiseCommand())).toEqual(
      code("SKILL_ADVERTISEMENT_PARTY_INELIGIBLE"),
    );
    expect(await disabled.service.advertise(source(), advertiseCommand())).toEqual(
      code("SKILL_ADVERTISEMENT_PARTY_INELIGIBLE"),
    );
    expect(await thrown.service.advertise(source(), advertiseCommand())).toEqual(
      code("SKILL_ADVERTISEMENT_DEPENDENCY_FAILED"),
    );
    expect(missing.store.findCurrent(AGENT, VERSION)).toBeNull();
    expect(disabled.store.findCurrent(AGENT, VERSION)).toBeNull();
    expect(thrown.store.findCurrent(AGENT, VERSION)).toBeNull();
  });

  it("rolls back a failed advertise and keeps a withdrawal that already landed", async () => {
    const failing = harness(undefined, {
      record(event) {
        if (event.command === "advertise" && event.outcome === "accepted") {
          throw new Error("observer failed");
        }
      },
    });
    expect(await failing.service.advertise(source(), advertiseCommand())).toEqual(
      code("SKILL_ADVERTISEMENT_DEPENDENCY_FAILED"),
    );
    expect(failing.store.findCurrent(AGENT, VERSION)).toBeNull();

    const store = new InMemorySkillAdvertisementStore({
      record(event) {
        if (event.command === "withdraw") {
          throw new Error("withdraw observer failed");
        }
      },
    });
    const service = new SkillAdvertisementService({
      events: { record() {} },
      store,
      parties: { findAgent: async (id) => (id === AGENT ? agent(AGENT) : null) },
    });
    const created = unwrap(await service.advertise(source(), advertiseCommand()));
    const withdrawn = await service.withdraw(source(), withdrawCommand(created.id));
    expect(withdrawn.ok).toBe(true);
    expect(store.findCurrent(AGENT, VERSION)).toMatchObject({
      id: created.id,
      status: "withdrawn",
    });
  });

  it("reads false for malformed memory, disguised records, and thrown stores", async () => {
    const malformed = harness(undefined, {
      seed: [[`${AGENT}>${VERSION}`, { status: "advertised", permission: "ALLOW" }]],
    });
    expect(malformed.store.findCurrent(AGENT, VERSION)).toBeNull();
    expect(await malformed.service.readAdvertised(AGENT, VERSION)).toBe(false);

    const disguised = harness(undefined, {
      store: {
        insertAdvertised: () => [],
        withdrawMatching: () => ({ code: "SKILL_ADVERTISEMENT_DEPENDENCY_FAILED", extra: true }),
        findCurrent: () => ({ status: "advertised", skill: "availability" }),
      },
    });
    expect(await disguised.service.readAdvertised(AGENT, VERSION)).toBe(false);
    expect(await disguised.service.advertise(source(), advertiseCommand())).toEqual(
      code("SKILL_ADVERTISEMENT_DEPENDENCY_FAILED"),
    );
    expect(
      await disguised.service.withdraw(
        source(),
        withdrawCommand(unwrap(createSkillAdvertisement(AGENT)).id),
      ),
    ).toEqual(code("SKILL_ADVERTISEMENT_DEPENDENCY_FAILED"));
  });

  it("fails closed when a value throws or a rejected event cannot be recorded", async () => {
    const { service } = harness();
    const throwing = new Proxy(advertiseCommand(), {
      ownKeys() {
        throw new Error("keys");
      },
    });
    expect(await service.advertise(source(), throwing)).toEqual(
      code("SKILL_ADVERTISEMENT_COMMAND_INVALID"),
    );
    expect(
      await service.advertise(
        null as unknown as TrustedSkillAdvertisementSource,
        advertiseCommand(),
      ),
    ).toEqual(code("SKILL_ADVERTISEMENT_COMMAND_INVALID"));
    expect(await service.advertise(source(), { ...advertiseCommand(), correlationId: 1 })).toEqual(
      code("SKILL_ADVERTISEMENT_COMMAND_INVALID"),
    );

    let prototypeReads = 0;
    const explosive = new Proxy(
      { kind: "trusted-skill-advertisement-source", key: "local-owner" },
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
    expect(
      await service.advertise(explosive as TrustedSkillAdvertisementSource, advertiseCommand()),
    ).toEqual(code("SKILL_ADVERTISEMENT_COMMAND_INVALID"));

    const hostile = harness(undefined, {
      record(event) {
        if (event.outcome === "rejected") {
          throw new Error("rejected observer failed");
        }
      },
    });
    expect(await hostile.service.advertise(source(), advertiseCommand(AGENT, "bad key"))).toEqual(
      code("SKILL_ADVERTISEMENT_DEPENDENCY_FAILED"),
    );
  });

  it("rechecks presence after party lookup so withdrawal during the await is not current", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let blockNext = false;
    let waiting = false;
    const sink: SkillAdvertisementEventSink = { record() {} };
    const store = new InMemorySkillAdvertisementStore(sink);
    const service = new SkillAdvertisementService({
      events: sink,
      store,
      parties: {
        async findAgent(id: unknown) {
          if (blockNext && id === AGENT) {
            blockNext = false;
            waiting = true;
            await gate;
          }
          return id === AGENT ? agent(AGENT) : null;
        },
      },
    });
    const created = unwrap(await service.advertise(source(), advertiseCommand()));
    blockNext = true;
    const pending = service.readAdvertised(AGENT, VERSION);
    while (!waiting) {
      await Promise.resolve();
    }
    expect((await service.withdraw(source(), withdrawCommand(created.id))).ok).toBe(true);
    if (release === undefined) {
      throw new Error("party lookup gate was not installed");
    }
    release();
    expect(await pending).toBe(false);
    expect(await service.readAdvertised(AGENT, VERSION)).toBe(false);
  });

  it("stops reporting an advertisement when the agent becomes ineligible or the lookup throws", async () => {
    const parties = [agent(AGENT)];
    let throwOnRead = false;
    const { service } = harness(parties, {
      findAgent: async (id) => {
        if (throwOnRead) {
          throw new Error("directory down");
        }
        return parties.find((party) => party.id === id) ?? null;
      },
    });
    unwrap(await service.advertise(source(), advertiseCommand()));
    parties.splice(0, 1, agent(AGENT, "disabled"));
    expect(await service.readAdvertised(AGENT, VERSION)).toBe(false);
    throwOnRead = true;
    expect(await service.readAdvertised(AGENT, VERSION)).toBe(false);
  });

  it("treats a fresh store as a restart and does not insert a withdrawn record", () => {
    const store = new InMemorySkillAdvertisementStore({ record() {} });
    const withdrawn = {
      ...unwrap(createSkillAdvertisement(AGENT)),
      status: "withdrawn" as const,
    };
    expect(
      store.insertAdvertised(withdrawn, {
        contract: SKILL_ADVERTISEMENT_EVENT_CONTRACT_V1,
        correlationId: "corr-1",
        sourceKey: "local-owner",
        command: "advertise",
        outcome: "accepted",
        control: "none",
      }),
    ).toEqual({ code: "SKILL_ADVERTISEMENT_DEPENDENCY_FAILED" });
    expect(
      store.withdrawMatching(AGENT, AGENT, unwrap(createSkillAdvertisement(AGENT)).id, {
        contract: SKILL_ADVERTISEMENT_EVENT_CONTRACT_V1,
        correlationId: "corr-1",
        sourceKey: "local-owner",
        command: "withdraw",
        outcome: "accepted",
        control: "none",
      }),
    ).toEqual({ code: "SKILL_ADVERTISEMENT_NOT_FOUND" });
    expect(
      new InMemorySkillAdvertisementStore({ record() {} }).findCurrent(AGENT, VERSION),
    ).toBeNull();
  });
});
