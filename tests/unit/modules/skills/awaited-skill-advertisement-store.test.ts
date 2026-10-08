import { describe, expect, it } from "vitest";
import { type AgentIdentity, createAgentIdentity } from "../../../../src/modules/identity/index.js";
import {
  AVAILABILITY_SKILL_VERSION_V1,
  AwaitedSkillAdvertisementStore,
  InMemorySkillAdvertisementStore,
  SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
  SkillAdvertisementService,
  type TrustedSkillAdvertisementSource,
} from "../../../../src/modules/skills/index.js";

const AGENT = "pan_agent_11111111-1111-4111-8111-111111111111";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";
const VERSION = AVAILABILITY_SKILL_VERSION_V1;

const unwrap = <T>(result: Readonly<{ ok: true; value: T } | { ok: false }>): T => {
  if (!result.ok) {
    throw new Error("fixture");
  }
  return result.value;
};

const agent = (id: string): AgentIdentity => unwrap(createAgentIdentity(id, OWNER, "active"));

const source = {
  kind: "trusted-skill-advertisement-source",
  key: "local-owner",
} as TrustedSkillAdvertisementSource;

const advertise = {
  contract: SKILL_ADVERTISEMENT_COMMAND_CONTRACT_V1,
  action: "advertise" as const,
  correlationId: "corr-adapter",
  agentId: AGENT,
  skillVersion: VERSION,
};

describe("awaited skill advertisement store", () => {
  it("does not advertise until the durable insert settles", async () => {
    let releaseInsert: () => void = () => {};
    const insertGate = new Promise<void>((resolve) => {
      releaseInsert = resolve;
    });
    const memory = new InMemorySkillAdvertisementStore({ record() {} });
    let insertStarted = false;
    const service = new SkillAdvertisementService({
      events: { record() {} },
      store: new AwaitedSkillAdvertisementStore({
        insertDurableAdvertisement(record, event) {
          insertStarted = true;
          return insertGate.then(() => memory.insertAdvertised(record, event));
        },
        withdrawDurableAdvertisement(agentId, skillVersion, advertisementId, event) {
          return memory.withdrawMatching(agentId, skillVersion, advertisementId, event);
        },
        findDurableAdvertisement(agentId, skillVersion) {
          return memory.findCurrent(agentId, skillVersion);
        },
      }),
      parties: {
        findAgent: async (id) => (id === AGENT ? agent(AGENT) : null),
      },
    });
    let settled = false;
    const pending = service.advertise(source, advertise).then((result) => {
      settled = true;
      return result;
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(insertStarted).toBe(true);
    expect(settled).toBe(false);
    expect(memory.findCurrent(AGENT, VERSION)).toBeNull();
    releaseInsert();
    const created = unwrap(await pending);
    expect(created.status).toBe("advertised");
    expect(await service.readAdvertised(AGENT, VERSION)).toBe(true);
    expect(
      (
        await service.withdraw(source, {
          ...advertise,
          action: "withdraw",
          correlationId: "corr-adapter-withdraw",
          advertisementId: created.id,
        })
      ).ok,
    ).toBe(true);
    expect(memory.findCurrent(AGENT, VERSION)).toMatchObject({
      id: created.id,
      status: "withdrawn",
    });
    expect(await service.readAdvertised(AGENT, VERSION)).toBe(false);
  });
});
