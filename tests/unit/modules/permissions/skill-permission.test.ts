import { describe, expect, it } from "vitest";
import {
  type AgentIdentity,
  createAgentIdentity,
  setAgentIdentityStatus,
} from "../../../../src/modules/identity/index.js";
import {
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_SCOPE_V1,
  createSkillPermission,
  InMemorySkillPermissionStore,
  isSkillPermission,
  SKILL_PERMISSION_COMMAND_CONTRACT_V1,
  SKILL_PERMISSION_EVENT_CONTRACT_V1,
  type SkillPermissionEvent,
  type SkillPermissionEventSink,
  SkillPermissionService,
  type TrustedPermissionSource,
} from "../../../../src/modules/permissions/index.js";
import { failure } from "../../../../src/shared/domain/result.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const OWNER = "pan_human_33333333-3333-4333-8333-333333333333";

const unwrap = <T>(result: Readonly<{ ok: true; value: T } | { ok: false }>): T => {
  if (!result.ok) {
    throw new Error("fixture");
  }
  return result.value;
};

const agent = (id: string, status: "active" | "disabled" = "active"): AgentIdentity => {
  const created = unwrap(createAgentIdentity(id, OWNER, "active"));
  return status === "active" ? created : unwrap(setAgentIdentityStatus(created, "disabled"));
};

const source = (key = "local-owner"): TrustedPermissionSource =>
  ({ kind: "trusted-permission-source", key }) as TrustedPermissionSource;

const grantCommand = (effect = "ALLOW", from = FROM, to = TO) => ({
  contract: SKILL_PERMISSION_COMMAND_CONTRACT_V1,
  action: "grant" as const,
  correlationId: "corr-1",
  fromAgentId: from,
  toAgentId: to,
  effect,
});

const revokeCommand = (permissionId: string) => ({
  ...grantCommand(),
  action: "revoke" as const,
  correlationId: "corr-revoke",
  permissionId,
});

const code = (name: string) => failure({ code: name });

const silentApprovals = {
  invalidateUnreleased(_from: string, _to: string) {},
};

const harness = (parties: AgentIdentity[] = [agent(FROM), agent(TO)]) => {
  const recorded: SkillPermissionEvent[] = [];
  const invalidated: string[] = [];
  const sink: SkillPermissionEventSink = {
    record(event) {
      recorded.push(event);
    },
  };
  const store = new InMemorySkillPermissionStore(sink);
  const service = new SkillPermissionService({
    events: sink,
    store,
    approvals: {
      invalidateUnreleased(from, to) {
        invalidated.push(`${from}>${to}`);
      },
    },
    parties: { findAgent: async (id) => parties.find((party) => party.id === id) ?? null },
  });
  return { service, store, recorded, invalidated };
};

describe("skill permission", () => {
  it("AC-DOM-001 grants an explicit effect without a relationship field", async () => {
    const { service } = harness();
    const granted = unwrap(await service.grant(source(), grantCommand("ASK")));
    expect(granted.effect).toBe("ASK");
    expect(granted).not.toHaveProperty("relationship");
    expect(await service.readSnapshot(FROM, TO)).toEqual({
      decision: "ASK",
      purpose: AVAILABILITY_PURPOSE_V1,
      scope: AVAILABILITY_SCOPE_V1,
    });
    expect(await service.readSnapshot(TO, FROM)).toBeNull();
    expect(createSkillPermission(FROM, FROM, "ALLOW")).toEqual(
      code("SKILL_PERMISSION_COMMAND_INVALID"),
    );
    expect(isSkillPermission({ ...granted, email: "a@b.c" })).toBe(false);
  });

  it("conflicts while active and revokes without restoring on observer failure", async () => {
    const { service } = harness();
    const first = unwrap(await service.grant(source(), grantCommand("ALLOW")));
    expect(await service.grant(source(), grantCommand("DENY"))).toEqual(
      code("SKILL_PERMISSION_CONFLICT"),
    );
    let observed = false;
    const sink: SkillPermissionEventSink = {
      record(event) {
        if (event.command === "revoke" && event.outcome === "accepted") {
          observed = true;
          throw new Error("observer");
        }
      },
    };
    const store = new InMemorySkillPermissionStore(sink);
    const invalidated: string[] = [];
    const local = new SkillPermissionService({
      events: sink,
      store,
      approvals: {
        invalidateUnreleased(from, to) {
          invalidated.push(`${from}>${to}`);
        },
      },
      parties: {
        findAgent: async (id) => [agent(FROM), agent(TO)].find((party) => party.id === id) ?? null,
      },
    });
    const created = unwrap(await local.grant(source(), grantCommand("ALLOW")));
    const revoked = await local.revoke(source(), revokeCommand(created.id));
    expect(observed).toBe(true);
    expect(revoked.ok).toBe(true);
    expect(invalidated).toEqual([`${FROM}>${TO}`]);
    expect(await local.readSnapshot(FROM, TO)).toBeNull();
    expect(await service.revoke(source(), revokeCommand(first.id))).toMatchObject({ ok: true });
    expect(await service.readSnapshot(FROM, TO)).toBeNull();
  });

  it("stores nothing for an invalid or ineligible grant", async () => {
    const { service, store } = harness([agent(FROM)]);
    expect(await service.grant(source(), grantCommand("ALLOW", FROM, FROM))).toEqual(
      code("SKILL_PERMISSION_COMMAND_INVALID"),
    );
    expect(await service.grant(source(), { ...grantCommand(), effect: "PERMIT" })).toEqual(
      code("SKILL_PERMISSION_COMMAND_INVALID"),
    );
    expect(await service.grant(source(), null)).toEqual(code("SKILL_PERMISSION_COMMAND_INVALID"));
    expect(await service.grant(source(), grantCommand("ALLOW"))).toEqual(
      code("SKILL_PERMISSION_PARTY_INELIGIBLE"),
    );
    expect(store.findCurrent(FROM, TO)).toBeNull();
    const thrown = new SkillPermissionService({
      events: { record() {} },
      store: new InMemorySkillPermissionStore({ record() {} }),
      approvals: silentApprovals,
      parties: {
        findAgent: async () => {
          throw new Error("down");
        },
      },
    });
    expect(await thrown.grant(source(), grantCommand())).toEqual(
      code("SKILL_PERMISSION_DEPENDENCY_FAILED"),
    );
  });

  it("does not report a permission after the target becomes ineligible during read", async () => {
    const parties = [agent(FROM), agent(TO)];
    const { service } = harness(parties);
    unwrap(await service.grant(source(), grantCommand("ALLOW")));
    parties.splice(1, 1, agent(TO, "disabled"));
    expect(await service.readSnapshot(FROM, TO)).toBeNull();
  });

  it("covers revoked inserts, rollback, unreadable records, and rejected commands", async () => {
    const created = unwrap(createSkillPermission(FROM, TO, "ALLOW"));
    expect(created.status).toBe("active");
    expect(
      isSkillPermission(
        new Proxy(created, {
          get() {
            throw new Error("x");
          },
        }),
      ),
    ).toBe(false);
    expect(isSkillPermission(Object.create({ kind: "skill-permission" }))).toBe(false);
    const quiet: SkillPermissionEventSink = { record() {} };
    const store = new InMemorySkillPermissionStore(quiet);
    expect(
      store.insertActive(
        { ...created, status: "revoked" },
        {
          contract: SKILL_PERMISSION_EVENT_CONTRACT_V1,
          correlationId: "corr-1",
          sourceKey: "local-owner",
          command: "grant",
          outcome: "accepted",
          control: "none",
        },
      ),
    ).toEqual({ code: "SKILL_PERMISSION_DEPENDENCY_FAILED" });
    expect(
      store.revokeMatching(FROM, FROM, created.id, {
        contract: SKILL_PERMISSION_EVENT_CONTRACT_V1,
        correlationId: "corr-1",
        sourceKey: "local-owner",
        command: "revoke",
        outcome: "accepted",
        control: "none",
      }),
    ).toEqual({ code: "SKILL_PERMISSION_NOT_FOUND" });
    const rolling = new InMemorySkillPermissionStore({
      record() {
        throw new Error("grant observer");
      },
    });
    const service = new SkillPermissionService({
      events: { record() {} },
      store: rolling,
      approvals: silentApprovals,
      parties: {
        findAgent: async (id) => [agent(FROM), agent(TO)].find((party) => party.id === id) ?? null,
      },
    });
    expect(await service.grant(source(), grantCommand())).toEqual(
      code("SKILL_PERMISSION_DEPENDENCY_FAILED"),
    );
    expect(rolling.findCurrent(FROM, TO)).toBeNull();
    const { service: main, store: mainStore } = harness();
    expect(await main.grant(source(), null)).toEqual(code("SKILL_PERMISSION_COMMAND_INVALID"));
    expect(await main.revoke(source(), null)).toEqual(code("SKILL_PERMISSION_COMMAND_INVALID"));
    expect(await main.grant(null as unknown as TrustedPermissionSource, grantCommand())).toEqual(
      code("SKILL_PERMISSION_COMMAND_INVALID"),
    );
    const accessor = grantCommand();
    Object.defineProperty(accessor, "correlationId", { enumerable: true, get: () => "corr-1" });
    expect(await main.grant(source(), accessor)).toEqual(code("SKILL_PERMISSION_COMMAND_INVALID"));
    expect(mainStore.findCurrent(FROM, TO)).toBeNull();
    const throwingRead = new SkillPermissionService({
      events: quiet,
      approvals: silentApprovals,
      store: {
        insertActive: () => null,
        revokeMatching: () => ({ code: "SKILL_PERMISSION_DEPENDENCY_FAILED", extra: true }),
        findCurrent: () => {
          throw new Error("read");
        },
      },
      parties: { findAgent: async () => agent(FROM) },
    });
    expect(await throwingRead.readSnapshot(FROM, TO)).toBeNull();
    expect(await throwingRead.revoke(source(), revokeCommand(created.id))).toEqual(
      code("SKILL_PERMISSION_DEPENDENCY_FAILED"),
    );
    const emptyArray = new SkillPermissionService({
      events: quiet,
      approvals: silentApprovals,
      store: {
        insertActive: () => [],
        revokeMatching: () => [],
        findCurrent: () => null,
      },
      parties: {
        findAgent: async (id) => [agent(FROM), agent(TO)].find((party) => party.id === id) ?? null,
      },
    });
    expect(await emptyArray.grant(source(), grantCommand())).toEqual(
      code("SKILL_PERMISSION_DEPENDENCY_FAILED"),
    );
    const seeded = new InMemorySkillPermissionStore(quiet, [
      [`${FROM}>${TO}`, { effect: "ALLOW" }],
    ]);
    expect(seeded.findCurrent(FROM, TO)).toBeNull();
    expect(await main.grant(source(), { ...grantCommand(), correlationId: 1 })).toEqual(
      code("SKILL_PERMISSION_COMMAND_INVALID"),
    );
    const explosive = new Proxy(grantCommand(), {
      ownKeys() {
        throw new Error("keys");
      },
    });
    expect(await main.grant(source(), explosive)).toEqual(code("SKILL_PERMISSION_COMMAND_INVALID"));
    const inherited = Object.assign(Object.create({ leaked: true }), grantCommand());
    expect(await main.grant(source(), inherited)).toEqual(code("SKILL_PERMISSION_COMMAND_INVALID"));
    const granted = unwrap(await main.grant(source(), grantCommand("DENY")));
    expect(unwrap(await main.revoke(source(), revokeCommand(granted.id))).status).toBe("revoked");
    expect((await main.revoke(source(), revokeCommand(granted.id))).ok).toBe(true);
    expect(await main.revoke(source(), revokeCommand(created.id))).toEqual(
      code("SKILL_PERMISSION_NOT_FOUND"),
    );
    expect(store.findCurrent(FROM, FROM)).toBeNull();
    expect(
      await main.grant(
        { kind: "nope", key: "local-owner" } as unknown as TrustedPermissionSource,
        grantCommand(),
      ),
    ).toEqual(code("SKILL_PERMISSION_COMMAND_INVALID"));
    let prototypeReads = 0;
    const explosiveSource = new Proxy(
      { kind: "trusted-permission-source", key: "local-owner" },
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
      await main.grant(explosiveSource as TrustedPermissionSource, grantCommand("ALLOW")),
    ).toEqual(code("SKILL_PERMISSION_COMMAND_INVALID"));
    const mismatched = new SkillPermissionService({
      events: quiet,
      approvals: silentApprovals,
      store: {
        insertActive: () => null,
        revokeMatching: () => null,
        findCurrent: () => unwrap(createSkillPermission(TO, FROM, "ALLOW")),
      },
      parties: {
        findAgent: async (id) => [agent(FROM), agent(TO)].find((party) => party.id === id) ?? null,
      },
    });
    expect(await mismatched.readSnapshot(FROM, TO)).toBeNull();
    let reads = 0;
    const changed = new SkillPermissionService({
      events: quiet,
      approvals: silentApprovals,
      store: {
        insertActive: () => null,
        revokeMatching: () => null,
        findCurrent: () => {
          reads += 1;
          return reads === 1 ? created : { ...created, status: "revoked" as const };
        },
      },
      parties: {
        findAgent: async (id) => [agent(FROM), agent(TO)].find((party) => party.id === id) ?? null,
      },
    });
    expect(await changed.readSnapshot(FROM, TO)).toBeNull();
    const hostile = new SkillPermissionService({
      approvals: silentApprovals,
      events: {
        record(event) {
          if (event.outcome === "rejected") {
            throw new Error("rejected");
          }
        },
      },
      store: new InMemorySkillPermissionStore(quiet),
      parties: {
        findAgent: async (id) => [agent(FROM), agent(TO)].find((party) => party.id === id) ?? null,
      },
    });
    expect(await hostile.grant(source(), null)).toEqual(code("SKILL_PERMISSION_DEPENDENCY_FAILED"));
  });

  it("invalidates unreleased approvals only after the stored revoke", async () => {
    const { service, invalidated } = harness();
    const granted = unwrap(await service.grant(source(), grantCommand("ASK")));
    const missing = "pan_skill_permission_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(await service.revoke(source(), revokeCommand(missing))).toEqual(
      code("SKILL_PERMISSION_NOT_FOUND"),
    );
    expect(invalidated).toEqual([]);
    expect(unwrap(await service.revoke(source(), revokeCommand(granted.id))).status).toBe(
      "revoked",
    );
    expect(invalidated).toEqual([`${FROM}>${TO}`]);

    const failing = new SkillPermissionService({
      events: { record() {} },
      store: new InMemorySkillPermissionStore({ record() {} }),
      approvals: {
        invalidateUnreleased() {
          throw new Error("approval down");
        },
      },
      parties: {
        findAgent: async (id) => [agent(FROM), agent(TO)].find((party) => party.id === id) ?? null,
      },
    });
    const second = unwrap(await failing.grant(source(), grantCommand("ALLOW")));
    expect(await failing.revoke(source(), revokeCommand(second.id))).toEqual(
      code("SKILL_PERMISSION_DEPENDENCY_FAILED"),
    );
    expect(await failing.readSnapshot(FROM, TO)).toBeNull();

    const asyncFailure = new SkillPermissionService({
      events: { record() {} },
      store: new InMemorySkillPermissionStore({ record() {} }),
      approvals: {
        invalidateUnreleased() {
          return Promise.reject(new Error("approval down"));
        },
      },
      parties: {
        findAgent: async (id) => [agent(FROM), agent(TO)].find((party) => party.id === id) ?? null,
      },
    });
    const third = unwrap(await asyncFailure.grant(source(), grantCommand("ALLOW")));
    expect(await asyncFailure.revoke(source(), revokeCommand(third.id))).toEqual(
      code("SKILL_PERMISSION_DEPENDENCY_FAILED"),
    );
    expect(await asyncFailure.readSnapshot(FROM, TO)).toBeNull();
  });

  it("does not settle a revoke until an async invalidator settles", async () => {
    const store = new InMemorySkillPermissionStore({ record() {} });
    let releaseInvalidation: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseInvalidation = resolve;
    });
    let started = false;
    const service = new SkillPermissionService({
      events: { record() {} },
      store,
      approvals: {
        invalidateUnreleased() {
          started = true;
          return gate;
        },
      },
      parties: {
        findAgent: async (id) => [agent(FROM), agent(TO)].find((party) => party.id === id) ?? null,
      },
    });
    const granted = unwrap(await service.grant(source(), grantCommand("ASK")));
    let settled = false;
    const pending = service.revoke(source(), revokeCommand(granted.id)).then((result) => {
      settled = true;
      return result;
    });
    // Async revoke frames settle on later microtasks even when the invalidator
    // is not awaited. A macrotask runs only after that chain, so the gate must
    // still be open here or the wait is not proven.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(started).toBe(true);
    expect(settled).toBe(false);
    releaseInvalidation();
    expect((await pending).ok).toBe(true);
    expect(settled).toBe(true);
    expect(store.findCurrent(FROM, TO)).toMatchObject({ id: granted.id, status: "revoked" });
  });
});
