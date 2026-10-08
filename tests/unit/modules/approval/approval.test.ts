import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    randomUUID: vi.fn(() => actual.randomUUID()),
  };
});

import {
  APPROVAL_LIFETIME_MS,
  APPROVAL_POLICY_VERSION_V1,
  APPROVAL_PURPOSE_V1,
  APPROVAL_SCOPE_V1,
  APPROVAL_SKILL_VERSION_V1,
  type ApprovalErrorCode,
  type ApprovalRecord,
  ApprovalService,
  type ApprovalStore,
  InMemoryApprovalStore,
  isApproval,
  isApprovalId,
  type TrustedApprovalSource,
} from "../../../../src/modules/approval/index.js";
import {
  createPendingApproval,
  parseUtcInstant,
  readApprovalBinding,
  withApprovalStatus,
} from "../../../../src/modules/approval/domain/approval.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-8222-222222222222";
const VALID_APPROVAL_ID =
  "pan_approval_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ApprovalRecord["id"];
const RECORD_KEYS = [
  "id",
  "requestId",
  "fromAgentId",
  "toAgentId",
  "skillVersion",
  "purpose",
  "scope",
  "start",
  "end",
  "policyVersion",
  "status",
  "expiresAt",
];

const unwrap = (
  result: Readonly<{ ok: true; value: ApprovalRecord } | { ok: false }>,
): ApprovalRecord => {
  if (!result.ok) {
    throw new Error("Expected an approval record");
  }
  return result.value;
};

const error = (code: ApprovalErrorCode) => ({
  ok: false,
  error: { code },
});

const owner = (key = "local-owner"): TrustedApprovalSource =>
  ({ kind: "trusted-approval-source", key }) as TrustedApprovalSource;

const clockAt = (start: string) => {
  let current = start;
  return {
    now: () => current,
    set: (value: string) => {
      current = value;
    },
  };
};

const harness = (now = "2026-10-08T12:00:00.000Z") => {
  const time = clockAt(now);
  const store = new InMemoryApprovalStore();
  const service = new ApprovalService({ clock: time, store });
  return { time, store, service };
};

const ask = (overrides: Record<string, unknown> = {}) => ({
  requestId: "req-1",
  fromAgentId: FROM,
  toAgentId: TO,
  skillVersion: APPROVAL_SKILL_VERSION_V1,
  purpose: APPROVAL_PURPOSE_V1,
  scope: APPROVAL_SCOPE_V1,
  start: "2026-10-08T15:00:00.000Z",
  end: "2026-10-08T16:00:00.000Z",
  policyVersion: APPROVAL_POLICY_VERSION_V1,
  ...overrides,
});

const bindingOf = (overrides: Record<string, unknown> = {}) => {
  const binding = readApprovalBinding(ask(overrides));
  if (binding === null) {
    throw new Error("Expected a binding");
  }
  return binding;
};

const pendingOf = (overrides: Record<string, unknown> = {}) => {
  const created = createPendingApproval(bindingOf(overrides), "2026-10-08T12:10:00.000Z");
  if (created === null) {
    throw new Error("Expected a pending approval");
  }
  return created;
};

describe("local approval lifecycle", () => {
  it("returns the same pending record for the same binding", () => {
    const { service, time, store } = harness();
    const first = unwrap(service.createAsk(ask()));
    time.set("2026-10-08T12:05:00.000Z");
    const second = unwrap(
      service.createAsk({
        policyVersion: APPROVAL_POLICY_VERSION_V1,
        end: "2026-10-08T16:00:00.000Z",
        start: "2026-10-08T15:00:00.000Z",
        scope: APPROVAL_SCOPE_V1,
        purpose: APPROVAL_PURPOSE_V1,
        skillVersion: APPROVAL_SKILL_VERSION_V1,
        toAgentId: TO,
        fromAgentId: FROM,
        requestId: "req-1",
      }),
    );

    expect(second).toBe(first);
    expect(second.status).toBe("pending");
    expect(second.expiresAt).toBe("2026-10-08T12:10:00.000Z");
    expect(APPROVAL_LIFETIME_MS).toBe(10 * 60 * 1000);
    expect(store.values()).toEqual([first]);

    const approved = unwrap(service.approve(owner(), first.id));
    expect(unwrap(service.createAsk(ask()))).toBe(approved);
    expect(store.values()).toEqual([approved]);
  });

  it("conflicts when the same request id has a different binding", () => {
    const { service } = harness();
    const first = unwrap(service.createAsk(ask()));
    const changed = service.createAsk(ask({ end: "2026-10-08T17:00:00.000Z" }));

    expect(changed).toEqual(error("APPROVAL_CONFLICT"));
    if (!changed.ok) {
      expect(Object.keys(changed.error)).toEqual(["code"]);
    }
    expect(service.findByRequestId("req-1")).toBe(first);
    expect(service.createAsk(ask({ skillVersion: "pan.skill.other/v1" }))).toEqual(
      error("APPROVAL_COMMAND_INVALID"),
    );
    expect(service.findByRequestId("req-1")).toBe(first);
  });

  it("expires a pending approval ten minutes after creation and does not approve it", () => {
    const { service, time } = harness("2026-10-08T12:00:00.000Z");
    const early = unwrap(service.createAsk(ask({ requestId: "req-early" })));
    const boundary = unwrap(service.createAsk(ask({ requestId: "req-boundary" })));
    const lateReject = unwrap(service.createAsk(ask({ requestId: "req-late-reject" })));
    const sealed = unwrap(service.createAsk(ask({ requestId: "req-sealed" })));
    expect(early.expiresAt).toBe("2026-10-08T12:10:00.000Z");

    time.set("2026-10-08T12:09:59.999Z");
    expect(unwrap(service.approve(owner(), early.id)).status).toBe("approved");

    time.set("2026-10-08T12:10:00.000Z");
    const expired = unwrap(service.approve(owner(), boundary.id));
    expect(expired.status).toBe("expired");
    expect(expired).toEqual({ ...boundary, status: "expired" });
    expect(service.release(boundary.id, true)).toBe(false);
    expect(service.findById(boundary.id)).toBe(expired);

    expect(unwrap(service.reject(owner(), lateReject.id)).status).toBe("expired");
    expect(service.release(early.id, true)).toBe(false);
    expect(service.findById(early.id)?.status).toBe("approved");

    const untrustedSource: unknown = {
      kind: "trusted-approval-source",
      key: "local-owner",
      note: "calendar",
    };
    const untrusted = service.approve(untrustedSource as TrustedApprovalSource, sealed.id);
    expect(untrusted).toEqual(error("APPROVAL_COMMAND_INVALID"));
    expect(service.findById(sealed.id)).toBe(sealed);
  });

  it("approves only through a trusted local owner source", () => {
    const { service } = harness();
    const created = unwrap(service.createAsk(ask()));
    const badSources = [
      null,
      { kind: "trusted-approval-source", key: "local-owner", context: "inbox" },
      Object.assign(Object.create(null), {
        kind: "trusted-approval-source",
        key: "local-owner",
      }),
      Object.create({ kind: "trusted-approval-source", key: "local-owner" }),
      { kind: "remote-approval-source", key: "local-owner" },
      { kind: "trusted-approval-source", key: "" },
      { kind: "trusted-approval-source", key: "has space" },
      { kind: "trusted-approval-source", key: `a${"b".repeat(128)}` },
      { key: "local-owner" },
    ];

    for (const source of badSources) {
      expect(service.approve(source as TrustedApprovalSource, created.id)).toEqual(
        error("APPROVAL_COMMAND_INVALID"),
      );
      expect(service.reject(source as TrustedApprovalSource, created.id)).toEqual(
        error("APPROVAL_COMMAND_INVALID"),
      );
    }
    expect(service.findById(created.id)).toBe(created);
    expect(service.approve(owner(), "not-an-approval")).toEqual(error("APPROVAL_COMMAND_INVALID"));
    expect(service.approve(owner(), "pan_approval_missing")).toEqual(
      error("APPROVAL_COMMAND_INVALID"),
    );

    const approved = unwrap(service.approve(owner(`a${"b".repeat(127)}`), created.id));
    expect(approved.status).toBe("approved");
    expect(approved).toEqual({ ...created, status: "approved" });
    expect(service.approve(owner(), created.id)).toEqual(successOf(approved));
    expect(service.reject(owner(), created.id)).toEqual(error("APPROVAL_CONFLICT"));
    expect(service.findById(created.id)).toBe(approved);
  });

  it("releases an approved row once", () => {
    const { service } = harness();
    const created = unwrap(service.createAsk(ask()));
    expect(service.release(created.id, true)).toBe(false);
    expect(service.findById(created.id)).toBe(created);

    const approved = unwrap(service.approve(owner(), created.id));
    expect(service.release(approved.id, "true")).toBe(false);
    expect(service.findById(approved.id)).toBe(approved);

    expect(service.release(approved.id, true)).toBe(true);
    const released = service.findById(approved.id);
    expect(released).toEqual({ ...approved, status: "released" });
    expect(service.release(approved.id, true)).toBe(false);
    expect(service.release(approved.id, false)).toBe(false);
    expect(service.findById(approved.id)).toBe(released);
    expect(service.approve(owner(), approved.id)).toEqual(error("APPROVAL_CONFLICT"));
    expect(service.findById(approved.id)).toBe(released);
  });

  it("invalidates an approved row when the relationship is not active", () => {
    const { service } = harness();
    const created = unwrap(service.createAsk(ask()));
    const approved = unwrap(service.approve(owner(), created.id));

    expect(service.release(approved.id, false)).toBe(false);
    const invalidated = service.findById(approved.id);
    expect(invalidated).toEqual({ ...approved, status: "invalidated" });
    expect(service.release(approved.id, true)).toBe(false);
    expect(service.findById(approved.id)).toBe(invalidated);
  });

  it("keeps a released row when unreleased rows for that ordered pair are invalidated", () => {
    const { service, time } = harness();
    const released = releaseOf(service, "req-released");
    const pending = unwrap(service.createAsk(ask({ requestId: "req-pending" })));
    const approved = unwrap(
      service.approve(owner(), unwrap(service.createAsk(ask({ requestId: "req-approved" }))).id),
    );
    const rejected = unwrap(
      service.reject(owner(), unwrap(service.createAsk(ask({ requestId: "req-rejected" }))).id),
    );
    const expiring = unwrap(service.createAsk(ask({ requestId: "req-expired" })));
    const reverse = unwrap(
      service.createAsk(ask({ requestId: "req-reverse", fromAgentId: TO, toAgentId: FROM })),
    );

    time.set("2026-10-08T12:10:00.000Z");
    const expired = unwrap(service.approve(owner(), expiring.id));
    expect(expired.status).toBe("expired");

    service.invalidateUnreleased(FROM, TO);
    service.invalidateUnreleased(FROM, FROM);
    service.invalidateUnreleased("not-an-agent", TO);

    expect(service.findById(released.id)).toBe(released);
    expect(service.findById(pending.id)?.status).toBe("invalidated");
    expect(service.findById(approved.id)?.status).toBe("invalidated");
    expect(service.findById(rejected.id)).toBe(rejected);
    expect(service.findById(expired.id)).toBe(expired);
    expect(service.findById(reverse.id)).toBe(reverse);
  });

  it("stores no context, email, profile, or model text", () => {
    const { service, store } = harness();
    const record = unwrap(service.createAsk(ask()));

    expect(record.id).toMatch(
      /^pan_approval_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(Object.keys(record)).toEqual(RECORD_KEYS);
    expect(Object.isFrozen(record)).toBe(true);
    for (const field of [
      "context",
      "email",
      "profile",
      "model",
      "modelText",
      "raw",
      "available",
      "body",
      "instruction",
      "prompt",
      "source",
      "key",
    ]) {
      expect(record).not.toHaveProperty(field);
    }
    expect(isApproval({ ...record, context: "calendar" })).toBe(false);
    expect(
      service.createAsk({ ...ask({ requestId: "req-context" }), context: "calendar" }),
    ).toEqual(error("APPROVAL_COMMAND_INVALID"));
    expect(
      service.createAsk({
        kind: "remote-ask",
        decision: "ASK",
        context: "share the private calendar",
      }),
    ).toEqual(error("APPROVAL_COMMAND_INVALID"));
    expect(service.findByRequestId("req-context")).toBeNull();
    expect(store.values()).toEqual([record]);
  });

  it("fails closed on a bad clock, a broken store, and a restarted store", () => {
    const brokenClock = new InMemoryApprovalStore();
    const clockService = new ApprovalService({
      clock: {
        now: () => {
          throw new Error("clock unavailable");
        },
      },
      store: brokenClock,
    });
    expect(clockService.createAsk(ask())).toEqual(error("APPROVAL_DEPENDENCY_FAILED"));
    expect(brokenClock.values()).toEqual([]);

    const malformedClock = new ApprovalService({
      clock: { now: () => "not-a-time" },
      store: new InMemoryApprovalStore(),
    });
    expect(malformedClock.createAsk(ask())).toEqual(error("APPROVAL_DEPENDENCY_FAILED"));

    const throwingStore: ApprovalStore = {
      findByRequestId: () => null,
      findById: () => null,
      insertPending: () => {
        throw new Error("store unavailable");
      },
      replace: () => {
        throw new Error("store unavailable");
      },
      values: () => [],
    };
    expect(
      new ApprovalService({
        clock: clockAt("2026-10-08T12:00:00.000Z"),
        store: throwingStore,
      }).createAsk(ask()),
    ).toEqual(error("APPROVAL_DEPENDENCY_FAILED"));

    const corrupt = new InMemoryApprovalStore([
      ["req-1", { requestId: "req-1", context: "secret" }],
    ]);
    const corruptService = new ApprovalService({
      clock: clockAt("2026-10-08T12:00:00.000Z"),
      store: corrupt,
    });
    expect(corruptService.createAsk(ask())).toEqual(error("APPROVAL_DEPENDENCY_FAILED"));
    expect(corrupt.findByRequestId("req-1")).toEqual({ requestId: "req-1", context: "secret" });
    expect(corruptService.findByRequestId("req-1")).toBeNull();

    const { service } = harness();
    const created = unwrap(service.createAsk(ask()));
    const restarted = new ApprovalService({
      clock: clockAt("2026-10-08T12:00:00.000Z"),
      store: new InMemoryApprovalStore(),
    });
    expect(restarted.findById(created.id)).toBeNull();
    expect(restarted.approve(owner(), created.id)).toEqual(error("APPROVAL_NOT_FOUND"));
    expect(restarted.release(created.id, true)).toBe(false);
  });
});

describe("approval domain guards", () => {
  it("parses only real UTC instants and rejects non-canonical expiry", () => {
    expect(parseUtcInstant(null)).toBeNull();
    expect(parseUtcInstant(1)).toBeNull();
    expect(parseUtcInstant("2026-10-08T12:00:00.000Z")).toBe(
      Date.parse("2026-10-08T12:00:00.000Z"),
    );
    expect(parseUtcInstant("2026-10-08T12:00:00Z")).toBe(Date.parse("2026-10-08T12:00:00.000Z"));
    expect(parseUtcInstant("2026-00-01T00:00:00.000Z")).toBeNull();
    expect(parseUtcInstant("2026-13-01T00:00:00.000Z")).toBeNull();
    expect(parseUtcInstant("2026-10-00T00:00:00.000Z")).toBeNull();
    expect(parseUtcInstant("2026-10-08T24:00:00.000Z")).toBeNull();
    expect(parseUtcInstant("2026-10-08T12:60:00.000Z")).toBeNull();
    expect(parseUtcInstant("2026-10-08T12:00:60.000Z")).toBeNull();
    expect(parseUtcInstant("2026-02-30T12:00:00.000Z")).toBeNull();
    expect(parseUtcInstant("2026-04-31T12:00:00.000Z")).toBeNull();
    expect(createPendingApproval(bindingOf(), "2026-10-08T12:10:00Z")).toBeNull();
    expect(createPendingApproval(bindingOf(), "not-a-time")).toBeNull();
    expect(createPendingApproval(bindingOf(), "2026-10-08T12:10:00.000Z")).not.toBeNull();
    expect(isApprovalId(VALID_APPROVAL_ID)).toBe(true);

    const originalExec = RegExp.prototype.exec;
    RegExp.prototype.exec = function exec(this: RegExp, input: string) {
      const match = originalExec.call(this, input);
      if (match === null || input !== "2026-10-08T12:00:00.000Z") {
        return match;
      }
      const patched = [...match] as unknown as RegExpExecArray;
      patched.index = match.index;
      patched.input = match.input;
      patched[1] = undefined as unknown as string;
      return patched;
    };
    try {
      expect(parseUtcInstant("2026-10-08T12:00:00.000Z")).toBeNull();
    } finally {
      RegExp.prototype.exec = originalExec;
    }
  });

  it("rejects non-records, bad prototypes, and thrown bindings", () => {
    const record = pendingOf();
    expect(isApproval(null)).toBe(false);
    expect(isApproval("pending")).toBe(false);
    expect(isApproval([record])).toBe(false);
    expect(readApprovalBinding(null)).toBeNull();
    expect(readApprovalBinding([ask()])).toBeNull();
    class ApprovalLike {
      id = record.id;
      requestId = record.requestId;
      fromAgentId = record.fromAgentId;
      toAgentId = record.toAgentId;
      skillVersion = record.skillVersion;
      purpose = record.purpose;
      scope = record.scope;
      start = record.start;
      end = record.end;
      policyVersion = record.policyVersion;
      status = record.status;
      expiresAt = record.expiresAt;
    }
    expect(isApproval(new ApprovalLike())).toBe(false);
    expect(readApprovalBinding(new ApprovalLike())).toBeNull();

    const explosiveBinding = new Proxy(ask(), {
      get() {
        throw new Error("binding trap");
      },
    });
    expect(readApprovalBinding(explosiveBinding)).toBeNull();

    const explosiveRecord = new Proxy(record, {
      get() {
        throw new Error("record trap");
      },
    });
    expect(isApproval(explosiveRecord)).toBe(false);
    expect(withApprovalStatus(record, "pending")).toBe(record);
    expect(withApprovalStatus(record, "approved")).toEqual({ ...record, status: "approved" });
  });

  it("fails closed when id allocation cannot build a record", () => {
    const invalidId = "not-a-uuid" as ReturnType<typeof randomUUID>;
    vi.mocked(randomUUID).mockReturnValueOnce(invalidId);
    expect(createPendingApproval(bindingOf(), "2026-10-08T12:10:00.000Z")).toBeNull();
    vi.mocked(randomUUID).mockReturnValueOnce(invalidId);
    expect(harness().service.createAsk(ask())).toEqual(error("APPROVAL_DEPENDENCY_FAILED"));
  });
});

describe("in-memory approval store guards", () => {
  it("indexes seeded approvals and rejects non-string ids", () => {
    const seeded = pendingOf({ requestId: "req-seed" });
    const store = new InMemoryApprovalStore([
      ["req-seed", seeded],
      ["req-corrupt", { requestId: "req-corrupt" }],
      ["req-seed", undefined],
    ]);
    expect(store.findByRequestId("req-seed")).toBeNull();
    expect(store.findById(seeded.id)).toBeNull();
    expect(store.findByRequestId(1)).toBeNull();
    expect(store.findByRequestId(null)).toBeNull();
    expect(store.findById(1)).toBeNull();
    expect(store.findById(null)).toBeNull();

    const indexed = new InMemoryApprovalStore([["req-seed", seeded]]);
    expect(indexed.findById(seeded.id)).toBe(seeded);
    expect(indexed.findByRequestId("req-seed")).toBe(seeded);
  });

  it("rejects illegal inserts and replaces", () => {
    const first = pendingOf({ requestId: "req-a" });
    const second = pendingOf({ requestId: "req-b" });
    const duplicateId = Object.freeze({ ...second, id: first.id }) as ApprovalRecord;
    const store = new InMemoryApprovalStore();

    expect(store.insertPending({ status: "pending" })).toEqual({
      code: "APPROVAL_DEPENDENCY_FAILED",
    });
    expect(store.insertPending(withApprovalStatus(first, "approved"))).toEqual({
      code: "APPROVAL_DEPENDENCY_FAILED",
    });
    expect(store.insertPending(first)).toBe(first);
    expect(store.insertPending(duplicateId)).toEqual({ code: "APPROVAL_DEPENDENCY_FAILED" });
    expect(store.replace({ status: "approved" })).toEqual({ code: "APPROVAL_DEPENDENCY_FAILED" });
    expect(store.replace(pendingOf({ requestId: "req-missing" }))).toEqual({
      code: "APPROVAL_DEPENDENCY_FAILED",
    });
    expect(store.replace(withApprovalStatus(first, "released"))).toEqual({
      code: "APPROVAL_DEPENDENCY_FAILED",
    });
    expect(store.replace(first)).toBe(first);
    const approved = withApprovalStatus(first, "approved");
    expect(store.replace(approved)).toBe(approved);
    expect(store.replace(approved)).toBe(approved);
  });

  it("fails closed when map operations throw", () => {
    const record = pendingOf({ requestId: "req-throw" });
    const store = new InMemoryApprovalStore([["req-throw", record]]);
    const originalGet = Map.prototype.get;
    const originalSet = Map.prototype.set;
    const originalHas = Map.prototype.has;

    Map.prototype.get = function get(this: Map<unknown, unknown>, key: unknown) {
      throw new Error(`get:${String(key)}`);
    } as typeof Map.prototype.get;
    try {
      expect(store.findByRequestId("req-throw")).toBeNull();
      expect(store.findById(record.id)).toBeNull();
    } finally {
      Map.prototype.get = originalGet;
    }

    Map.prototype.has = function has() {
      throw new Error("has");
    } as typeof Map.prototype.has;
    try {
      expect(store.insertPending(pendingOf({ requestId: "req-has" }))).toEqual({
        code: "APPROVAL_DEPENDENCY_FAILED",
      });
    } finally {
      Map.prototype.has = originalHas;
    }

    const replaceStore = new InMemoryApprovalStore([["req-throw", record]]);
    Map.prototype.set = function set(this: Map<unknown, unknown>) {
      throw new Error("set");
    } as typeof Map.prototype.set;
    try {
      expect(replaceStore.replace(withApprovalStatus(record, "approved"))).toEqual({
        code: "APPROVAL_DEPENDENCY_FAILED",
      });
      expect(store.insertPending(pendingOf({ requestId: "req-set" }))).toEqual({
        code: "APPROVAL_DEPENDENCY_FAILED",
      });
    } finally {
      Map.prototype.set = originalSet;
    }
  });
});

describe("approval service fail-closed paths", () => {
  it("rejects non-id release, bad clocks, corrupt rows, and failed saves", () => {
    const { service, time } = harness();
    const created = unwrap(service.createAsk(ask()));
    expect(service.release("not-an-id", true)).toBe(false);
    expect(service.release(null, true)).toBe(false);
    expect(service.release(1, true)).toBe(false);

    const approved = unwrap(service.approve(owner(), created.id));
    time.set("not-a-time");
    expect(service.release(approved.id, true)).toBe(false);
    time.set("2026-10-08T12:00:00.000Z");

    const badClock = new ApprovalService({
      clock: { now: () => "not-a-time" },
      store: new InMemoryApprovalStore([[approved.requestId, approved]]),
    });
    expect(badClock.approve(owner(), approved.id)).toEqual(error("APPROVAL_DEPENDENCY_FAILED"));
    expect(badClock.release(approved.id, true)).toBe(false);

    const corruptStore: ApprovalStore = {
      findByRequestId: () => ({ corrupt: true }),
      findById: () => ({ corrupt: true }),
      insertPending: () => 42,
      replace: () => ({ status: "approved" }),
      values: () => [{ corrupt: true }],
    };
    const corruptService = new ApprovalService({
      clock: clockAt("2026-10-08T12:00:00.000Z"),
      store: corruptStore,
    });
    expect(corruptService.approve(owner(), VALID_APPROVAL_ID)).toEqual(
      error("APPROVAL_DEPENDENCY_FAILED"),
    );
    expect(corruptService.findById(VALID_APPROVAL_ID)).toBeNull();
    expect(corruptService.findByRequestId("req-1")).toBeNull();
    expect(corruptService.createAsk(ask({ requestId: "req-num" }))).toEqual(
      error("APPROVAL_DEPENDENCY_FAILED"),
    );

    const pending = pendingOf({ requestId: "req-save" });
    const failingReplace: ApprovalStore = {
      findByRequestId: () => null,
      findById: () => pending,
      insertPending: () => pending,
      replace: () => pending,
      values: () => [pending],
    };
    const saveService = new ApprovalService({
      clock: clockAt("2026-10-08T12:00:00.000Z"),
      store: failingReplace,
    });
    expect(saveService.approve(owner(), pending.id)).toEqual(error("APPROVAL_DEPENDENCY_FAILED"));
  });

  it("fails closed when dependencies throw during decide, release, and reads", () => {
    const pending = pendingOf({ requestId: "req-catch" });
    const throwingStore: ApprovalStore = {
      findByRequestId: () => {
        throw new Error("request lookup");
      },
      findById: () => {
        throw new Error("id lookup");
      },
      insertPending: () => pending,
      replace: () => {
        throw new Error("replace");
      },
      values: () => {
        throw new Error("values");
      },
    };
    const service = new ApprovalService({
      clock: clockAt("2026-10-08T12:00:00.000Z"),
      store: throwingStore,
    });
    expect(service.findById(pending.id)).toBeNull();
    expect(service.findByRequestId("req-catch")).toBeNull();
    expect(service.invalidateUnreleased(FROM, TO)).toBeUndefined();

    const decideStore: ApprovalStore = {
      findByRequestId: () => null,
      findById: () => pending,
      insertPending: () => pending,
      replace: () => {
        throw new Error("replace");
      },
      values: () => [pending],
    };
    const decideService = new ApprovalService({
      clock: clockAt("2026-10-08T12:00:00.000Z"),
      store: decideStore,
    });
    expect(decideService.approve(owner(), pending.id)).toEqual(error("APPROVAL_DEPENDENCY_FAILED"));
    expect(decideService.release(pending.id, true)).toBe(false);

    const approved = withApprovalStatus(pending, "approved");
    const releaseStore: ApprovalStore = {
      findByRequestId: () => null,
      findById: () => approved,
      insertPending: () => approved,
      replace: () => {
        throw new Error("replace");
      },
      values: () => [approved],
    };
    const releaseService = new ApprovalService({
      clock: clockAt("2026-10-08T12:00:00.000Z"),
      store: releaseStore,
    });
    expect(releaseService.release(approved.id, true)).toBe(false);
  });

  it("rejects hostile sources and non-string source fields", () => {
    const { service } = harness();
    const created = unwrap(service.createAsk(ask()));
    const arraySource = [
      "trusted-approval-source",
      "local-owner",
    ] as unknown as TrustedApprovalSource;
    expect(service.approve(arraySource, created.id)).toEqual(error("APPROVAL_COMMAND_INVALID"));
    expect(
      service.approve(
        { kind: "trusted-approval-source", key: 1 } as unknown as TrustedApprovalSource,
        created.id,
      ),
    ).toEqual(error("APPROVAL_COMMAND_INVALID"));
    expect(
      service.approve(
        { kind: 1, key: "local-owner" } as unknown as TrustedApprovalSource,
        created.id,
      ),
    ).toEqual(error("APPROVAL_COMMAND_INVALID"));

    const hostileKeys = new Proxy(
      { kind: "trusted-approval-source", key: "local-owner" },
      {
        ownKeys() {
          throw new Error("keys");
        },
      },
    ) as TrustedApprovalSource;
    expect(service.approve(hostileKeys, created.id)).toEqual(error("APPROVAL_COMMAND_INVALID"));

    const hostileProto = new Proxy(
      { kind: "trusted-approval-source", key: "local-owner" },
      {
        getPrototypeOf() {
          throw new Error("prototype");
        },
      },
    ) as TrustedApprovalSource;
    expect(service.approve(hostileProto, created.id)).toEqual(error("APPROVAL_COMMAND_INVALID"));

    let prototypeReads = 0;
    const secondProtoThrow = new Proxy(
      { kind: "trusted-approval-source", key: "local-owner" },
      {
        getPrototypeOf() {
          prototypeReads += 1;
          if (prototypeReads > 1) {
            throw new Error("source prototype");
          }
          return Object.prototype;
        },
      },
    ) as TrustedApprovalSource;
    expect(service.approve(secondProtoThrow, created.id)).toEqual(
      error("APPROVAL_COMMAND_INVALID"),
    );
  });

  it("treats non-conflict insert results as dependency failures", () => {
    const nullProtoConflict = Object.assign(Object.create(null), {
      code: "APPROVAL_CONFLICT",
    });
    const wrongKey = { other: "APPROVAL_CONFLICT" };
    const store: ApprovalStore = {
      findByRequestId: () => null,
      findById: () => null,
      insertPending: () => nullProtoConflict,
      replace: () => null,
      values: () => [],
    };
    expect(
      new ApprovalService({
        clock: clockAt("2026-10-08T12:00:00.000Z"),
        store,
      }).createAsk(ask({ requestId: "req-null-proto" })),
    ).toEqual(error("APPROVAL_CONFLICT"));

    const wrongKeyStore: ApprovalStore = {
      ...store,
      insertPending: () => wrongKey,
    };
    expect(
      new ApprovalService({
        clock: clockAt("2026-10-08T12:00:00.000Z"),
        store: wrongKeyStore,
      }).createAsk(ask({ requestId: "req-wrong-key" })),
    ).toEqual(error("APPROVAL_DEPENDENCY_FAILED"));

    const arrayCodeStore: ApprovalStore = {
      ...store,
      insertPending: () => ["APPROVAL_CONFLICT"],
    };
    expect(
      new ApprovalService({
        clock: clockAt("2026-10-08T12:00:00.000Z"),
        store: arrayCodeStore,
      }).createAsk(ask({ requestId: "req-array-code" })),
    ).toEqual(error("APPROVAL_DEPENDENCY_FAILED"));
  });
});

const successOf = (record: ApprovalRecord) => ({
  ok: true,
  value: record,
});

const releaseOf = (service: ApprovalService, requestId: string): ApprovalRecord => {
  const created = unwrap(service.createAsk(ask({ requestId })));
  const approved = unwrap(service.approve(owner(), created.id));
  expect(service.release(approved.id, true)).toBe(true);
  const released = service.findById(approved.id);
  if (released === null) {
    throw new Error("Expected the released approval");
  }
  return released;
};
