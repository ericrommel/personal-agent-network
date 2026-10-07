import { describe, expect, it } from "vitest";
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
  type TrustedApprovalSource,
} from "../../../../src/modules/approval/index.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-8222-222222222222";
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
