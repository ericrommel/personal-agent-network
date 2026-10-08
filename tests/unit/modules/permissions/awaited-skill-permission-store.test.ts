import { describe, expect, it } from "vitest";
import { type AgentIdentity, createAgentIdentity } from "../../../../src/modules/identity/index.js";
import {
  AwaitedSkillPermissionStore,
  InMemorySkillPermissionStore,
  SKILL_PERMISSION_COMMAND_CONTRACT_V1,
  SkillPermissionService,
  type TrustedPermissionSource,
} from "../../../../src/modules/permissions/index.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";

const unwrap = <T>(result: Readonly<{ ok: true; value: T } | { ok: false }>): T => {
  if (!result.ok) {
    throw new Error("fixture");
  }
  return result.value;
};

const agent = (id: string): AgentIdentity => unwrap(createAgentIdentity(id, OWNER, "active"));

const source = { kind: "trusted-permission-source", key: "local-owner" } as TrustedPermissionSource;

const grant = {
  contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
  action: "grant",
  correlationId: "corr-adapter",
  fromAgentId: FROM,
  toAgentId: TO,
  effect: "ALLOW",
};

describe("awaited skill permission store", () => {
  it("does not grant until the durable insert settles", async () => {
    let releaseInsert: () => void = () => {};
    const insertGate = new Promise<void>((resolve) => {
      releaseInsert = resolve;
    });
    const memory = new InMemorySkillPermissionStore({ record() {} });
    let insertStarted = false;
    const service = new SkillPermissionService({
      events: { record() {} },
      store: new AwaitedSkillPermissionStore({
        insertDurablePermission(record, event) {
          insertStarted = true;
          return insertGate.then(() => memory.insertActive(record, event));
        },
        revokeDurablePermission(from, to, permissionId, event) {
          return memory.revokeMatching(from, to, permissionId, event);
        },
        findDurablePermission(from, to) {
          return memory.findCurrent(from, to);
        },
      }),
      approvals: { invalidateUnreleased() {} },
      parties: {
        findAgent: async (id) => [agent(FROM), agent(TO)].find((party) => party.id === id) ?? null,
      },
    });
    let settled = false;
    const pending = service.grant(source, grant).then((result) => {
      settled = true;
      return result;
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(insertStarted).toBe(true);
    expect(settled).toBe(false);
    expect(memory.findCurrent(FROM, TO)).toBeNull();
    releaseInsert();
    const granted = unwrap(await pending);
    expect(granted.status).toBe("active");
    expect(await service.readSnapshot(FROM, TO)).toMatchObject({ decision: "ALLOW" });
    expect(
      (
        await service.revoke(source, {
          ...grant,
          action: "revoke",
          correlationId: "corr-adapter-revoke",
          permissionId: granted.id,
        })
      ).ok,
    ).toBe(true);
    expect(memory.findCurrent(FROM, TO)).toMatchObject({ id: granted.id, status: "revoked" });
    expect(await service.readSnapshot(FROM, TO)).toBeNull();
  });
});
