import { describe, expect, it } from "vitest";
import * as auditModule from "../../../../src/modules/audit/index.js";
import {
  AUDIT_CATEGORIES,
  AUDIT_ERROR_CODES,
  AUDIT_OUTCOMES,
  type AuditEvent,
  LocalAuditLog,
  type TrustedAuditOperator,
} from "../../../../src/modules/audit/index.js";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const EPOCH = Date.UTC(2026, 0, 1);
const EVENT_KEYS = ["kind", "id", "recordedAt", "category", "requestId", "outcome"];
const AUDIT_ID = /^pan_audit_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INVALID = { ok: false, error: { code: "AUDIT_COMMAND_INVALID" } } as const;

const operator = (key = "local-owner"): TrustedAuditOperator =>
  ({ kind: "trusted-audit-operator", key }) as TrustedAuditOperator;

const command = (overrides: Record<string, unknown> = {}) => ({
  kind: "audit-event",
  category: "decision",
  requestId: "req-1",
  outcome: "deny",
  ...overrides,
});

const clockAt = (start = EPOCH) => {
  let now = start;
  return {
    nowMs: () => now,
    set(next: number) {
      now = next;
    },
    advance(ms: number) {
      now += ms;
    },
  };
};

const unwrap = <T>(result: Readonly<{ ok: true; value: T } | { ok: false }>): T => {
  if (!result.ok) {
    throw new Error("Expected a successful audit result");
  }
  return result.value;
};

const onlyCode = (result: { ok: false; error: object } | { ok: true }): void => {
  expect(result).toEqual(INVALID);
  if (!result.ok) {
    expect(Object.keys(result.error)).toEqual(["code"]);
    expect(result.error).not.toHaveProperty("message");
  }
};

describe("local audit log", () => {
  it("records a minimized event from the injected clock", () => {
    const clock = clockAt();
    const log = new LocalAuditLog(clock);
    const input = command();
    const event = unwrap(log.append(operator(), input));

    expect(AUDIT_CATEGORIES).toEqual(["decision", "approval", "disclosure", "revocation"]);
    expect(AUDIT_OUTCOMES).toEqual([
      "allow",
      "ask",
      "deny",
      "released",
      "invalidated",
      "unavailable",
    ]);
    expect(AUDIT_ERROR_CODES).toEqual(["AUDIT_COMMAND_INVALID"]);
    expect(Object.keys(event)).toEqual(EVENT_KEYS);
    expect(event.kind).toBe("audit-event");
    expect(event.id).toMatch(AUDIT_ID);
    expect(event.recordedAt).toBe(new Date(EPOCH).toISOString());
    expect(event.category).toBe("decision");
    expect(event.requestId).toBe("req-1");
    expect(event.outcome).toBe("deny");
    expect(event).not.toHaveProperty("result");
    expect(Object.isFrozen(event)).toBe(true);
    expect(JSON.stringify(event)).not.toContain("local-owner");

    input.outcome = "allow";
    (input as { result?: boolean }).result = false;
    const retained = unwrap(log.read(operator()));
    expect(retained).toEqual([event]);
    expect(Object.isFrozen(retained)).toBe(true);
    expect(retained[0]).not.toHaveProperty("result");
  });

  it("accepts every closed category and outcome without deduplicating request ids", () => {
    const clock = clockAt();
    const log = new LocalAuditLog(clock);
    const stored: AuditEvent[] = [];
    for (const category of AUDIT_CATEGORIES) {
      for (const outcome of AUDIT_OUTCOMES) {
        clock.advance(1);
        stored.push(
          unwrap(
            log.append(
              operator(),
              command({ category, outcome, requestId: `req-${category}-${outcome}` }),
            ),
          ),
        );
      }
    }
    clock.advance(1);
    const duplicate = unwrap(log.append(operator(), command()));
    expect(duplicate.id).not.toBe(stored[0]?.id);
    expect(duplicate.recordedAt).not.toBe(stored[0]?.recordedAt);
    expect(unwrap(log.read(operator()))).toEqual([...stored, duplicate]);
  });

  it("AC-AUD-001 untrusted caller cannot read, append, or delete", () => {
    const clock = clockAt();
    let clockCalls = 0;
    const log = new LocalAuditLog({
      nowMs() {
        clockCalls += 1;
        return clock.nowMs();
      },
    });
    const event = unwrap(log.append(operator(), command()));
    clockCalls = 0;
    const inherited = { unused: true };
    const prototype = Object.prototype as Record<string, unknown>;
    const priorKind = Object.getOwnPropertyDescriptor(prototype, "kind");
    const priorKey = Object.getOwnPropertyDescriptor(prototype, "key");
    Object.defineProperty(prototype, "kind", {
      configurable: true,
      enumerable: false,
      value: "trusted-audit-operator",
    });
    Object.defineProperty(prototype, "key", {
      configurable: true,
      enumerable: false,
      value: "local-owner",
    });
    const untrusted = [
      null,
      undefined,
      "local-owner",
      { kind: "trusted-audit-operator", key: "local-owner", export: true },
      { kind: "remote-agent", key: "local-owner" },
      { kind: "trusted-audit-operator", key: "bad key" },
      { kind: "trusted-audit-operator", key: "" },
      { kind: "trusted-audit-operator" },
      { key: "local-owner" },
      Object.create(null),
      inherited,
      Object.defineProperty({}, "kind", {
        enumerable: true,
        value: "trusted-audit-operator",
      }),
      new Proxy(operator(), {
        get() {
          throw new Error("unreadable operator");
        },
      }),
    ];
    try {
      for (const source of untrusted) {
        const caller = source as TrustedAuditOperator;
        onlyCode(log.read(caller));
        onlyCode(log.append(caller, command()));
        onlyCode(log.deleteAll(caller));
        onlyCode(log.deleteExpired(caller));
      }
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

    expect(clockCalls).toBe(0);
    expect(unwrap(log.read(operator()))).toEqual([event]);
    expect(unwrap(log.read(operator("owner:2")))).toEqual([event]);
    const maxKey = `a${"b".repeat(127)}`;
    expect(unwrap(log.read(operator(maxKey)))).toEqual([event]);
    onlyCode(log.read(operator(`a${"b".repeat(128)}`)));
    onlyCode(log.read(operator(".owner")));
    onlyCode(log.read(operator("owner@node")));
  });

  it("rejects a non-finite clock and an unreadable command", () => {
    const log = new LocalAuditLog({ nowMs: () => Number.NaN });
    expect(log.read(operator())).toEqual(INVALID);
    expect(log.append(operator(), command())).toEqual(INVALID);
    expect(log.deleteExpired(operator())).toEqual(INVALID);
    const finite = new LocalAuditLog(clockAt());
    const explosive = new Proxy(command(), {
      ownKeys() {
        throw new Error("keys");
      },
    });
    expect(finite.append(operator(), explosive)).toEqual(INVALID);
  });

  it("AC-PRV-001 minimization rejects a result field and stores nothing", () => {
    const clock = clockAt();
    const log = new LocalAuditLog(clock);
    const kept = unwrap(log.append(operator(), command({ requestId: "kept" })));
    const forbidden = [
      { result: false },
      { result: true },
      { available: false },
      { email: "owner@example.com" },
      { profile: "Ada" },
      { body: "secret-message-body" },
      { message: "private prompt" },
      { interval: "2026-01-01/2026-01-02" },
      { busy: ["09:00", "10:00"] },
      { effect: "read-calendar" },
      { permission: "ALLOW" },
    ];
    for (const extra of forbidden) {
      const rejected = log.append(operator(), command(extra));
      onlyCode(rejected);
      expect(JSON.stringify(rejected)).not.toContain("secret-message-body");
      expect(JSON.stringify(rejected)).not.toContain("owner@example.com");
      expect(JSON.stringify(rejected)).not.toContain("result");
      expect(JSON.stringify(rejected)).not.toContain("available");
    }
    expect(unwrap(log.read(operator()))).toEqual([kept]);

    const superset = command();
    Object.defineProperty(superset, "result", { value: false, enumerable: false });
    onlyCode(log.append(operator(), superset));
    onlyCode(log.append(operator(), { ...command(), id: kept.id, recordedAt: kept.recordedAt }));
    const { outcome: _outcome, ...missingOutcome } = command();
    onlyCode(log.append(operator(), missingOutcome));
    onlyCode(log.append(operator(), command({ outcome: "ALLOW" })));
    onlyCode(log.append(operator(), command({ outcome: true })));
    onlyCode(log.append(operator(), command({ category: "policy" })));
    onlyCode(log.append(operator(), command({ requestId: "owner@example.com" })));
    onlyCode(log.append(operator(), command({ requestId: "has space" })));
    onlyCode(log.append(operator(), command({ requestId: `a${"b".repeat(128)}` })));
    onlyCode(log.append(operator(), null));
    onlyCode(log.append(operator(), ["audit-event"]));
    onlyCode(
      log.append(
        operator(),
        Object.create({
          kind: "audit-event",
          category: "decision",
          requestId: "req-1",
          outcome: "deny",
        }),
      ),
    );
    const accessor = command();
    Object.defineProperty(accessor, "outcome", { enumerable: true, get: () => "deny" });
    onlyCode(log.append(operator(), accessor));
    onlyCode(
      log.append(
        operator(),
        new Proxy(command(), {
          get() {
            throw new Error("unreadable command");
          },
        }),
      ),
    );
    const nullPrototype = Object.assign(Object.create(null), command({ requestId: "null-proto" }));
    const accepted = unwrap(log.append(operator(), nullPrototype));
    expect(accepted.requestId).toBe("null-proto");
    expect(Object.keys(accepted)).toEqual(EVENT_KEYS);
    expect(unwrap(log.read(operator())).map((item) => item.requestId)).toEqual([
      "kept",
      "null-proto",
    ]);
  });

  it("drops events recorded earlier than 30 days on read and append", () => {
    const clock = clockAt();
    const log = new LocalAuditLog(clock);
    const old = unwrap(log.append(operator(), command({ requestId: "old" })));
    clock.advance(10 * 24 * 60 * 60 * 1000);
    const mid = unwrap(log.append(operator(), command({ requestId: "mid" })));
    clock.set(EPOCH + RETENTION_MS);
    expect(unwrap(log.read(operator()))).toEqual([old, mid]);

    clock.set(EPOCH + RETENTION_MS + 1);
    onlyCode(log.append(operator(), command({ result: false })));
    onlyCode(log.read(null as unknown as TrustedAuditOperator));
    clock.set(EPOCH);
    expect(unwrap(log.read(operator()))).toEqual([old, mid]);

    clock.set(EPOCH + RETENTION_MS + 1);
    expect(unwrap(log.read(operator()))).toEqual([mid]);
    clock.set(EPOCH);
    expect(unwrap(log.read(operator()))).toEqual([mid]);

    const freshLog = new LocalAuditLog(clock);
    clock.set(EPOCH);
    const first = unwrap(freshLog.append(operator(), command({ requestId: "old" })));
    clock.advance(10 * 24 * 60 * 60 * 1000);
    const second = unwrap(freshLog.append(operator(), command({ requestId: "mid" })));
    clock.set(EPOCH + RETENTION_MS + 1);
    const third = unwrap(freshLog.append(operator(), command({ requestId: "new" })));
    expect(third.recordedAt).toBe(new Date(EPOCH + RETENTION_MS + 1).toISOString());
    clock.set(EPOCH);
    expect(unwrap(freshLog.read(operator()))).toEqual([second, third]);
    expect(first.requestId).toBe("old");
  });

  it("deleteAll removes every retained event and deleteExpired removes only expired events", () => {
    const clock = clockAt();
    const log = new LocalAuditLog(clock);
    unwrap(log.append(operator(), command({ requestId: "old" })));
    clock.advance(10 * 24 * 60 * 60 * 1000);
    const mid = unwrap(log.append(operator(), command({ requestId: "mid" })));
    clock.set(EPOCH + RETENTION_MS + 1);
    expect(log.deleteExpired(operator())).toEqual({ ok: true, value: true });
    clock.set(EPOCH);
    expect(unwrap(log.read(operator()))).toEqual([mid]);

    const kept = unwrap(log.append(operator(), command({ requestId: "kept" })));
    expect(log.deleteExpired(operator())).toEqual({ ok: true, value: true });
    expect(unwrap(log.read(operator()))).toEqual([mid, kept]);

    expect(log.deleteAll(operator())).toEqual({ ok: true, value: true });
    expect(unwrap(log.read(operator()))).toEqual([]);
    clock.set(EPOCH + RETENTION_MS + 1);
    expect(unwrap(log.read(operator()))).toEqual([]);

    const wipe = new LocalAuditLog(clock);
    clock.set(EPOCH);
    unwrap(wipe.append(operator(), command({ requestId: "expired-resident" })));
    clock.set(EPOCH + RETENTION_MS + 1);
    expect(wipe.deleteAll(operator())).toEqual({ ok: true, value: true });
    clock.set(EPOCH);
    expect(unwrap(wipe.read(operator()))).toEqual([]);

    const again = unwrap(log.append(operator(), command({ requestId: "again" })));
    const broken = clockAt();
    let fail = false;
    const resilient = new LocalAuditLog({
      nowMs() {
        if (fail) {
          throw new Error("clock down");
        }
        return broken.nowMs();
      },
    });
    const stored = unwrap(resilient.append(operator(), command()));
    fail = true;
    onlyCode(resilient.append(operator(), command({ requestId: "next" })));
    onlyCode(resilient.read(operator()));
    onlyCode(resilient.deleteExpired(operator()));
    fail = false;
    expect(unwrap(resilient.read(operator()))).toEqual([stored]);
    expect(resilient.deleteAll(operator())).toEqual({ ok: true, value: true });
    expect(unwrap(resilient.read(operator()))).toEqual([]);
    expect(again.requestId).toBe("again");
  });

  it("a new instance is a new store", () => {
    const clock = clockAt();
    const first = new LocalAuditLog(clock);
    unwrap(first.append(operator(), command()));
    const restarted = new LocalAuditLog(clock);
    expect(unwrap(restarted.read(operator()))).toEqual([]);
    expect(unwrap(first.read(operator()))).toHaveLength(1);
  });

  it("rejects a clock that cannot mint an ISO UTC timestamp and stores nothing", () => {
    const values: unknown[] = ["1000", Number.NaN, Number.POSITIVE_INFINITY, 1e20, undefined];
    for (const value of values) {
      let armed = true;
      const broken = new LocalAuditLog({
        nowMs() {
          if (armed) {
            armed = false;
            return value as number;
          }
          return EPOCH;
        },
      });
      onlyCode(broken.append(operator(), command()));
      expect(unwrap(broken.read(operator()))).toEqual([]);
    }
    let throws = true;
    const throwing = new LocalAuditLog({
      nowMs() {
        if (throws) {
          throws = false;
          throw new Error("clock down");
        }
        return EPOCH;
      },
    });
    onlyCode(throwing.append(operator(), command()));
    expect(unwrap(throwing.read(operator()))).toEqual([]);
  });

  it("has no remote read, export socket, or query function", () => {
    const log = new LocalAuditLog(clockAt());
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(log)).sort()).toEqual([
      "append",
      "constructor",
      "deleteAll",
      "deleteExpired",
      "read",
    ]);
    const absent = [
      "query",
      "export",
      "socket",
      "listen",
      "find",
      "search",
      "subscribe",
      "stream",
      "readRemote",
      "save",
      "load",
    ];
    for (const name of absent) {
      expect(name in log).toBe(false);
      expect(Object.hasOwn(LocalAuditLog, name)).toBe(false);
    }
    expect(Object.keys(auditModule).sort()).toEqual([
      "AUDIT_CATEGORIES",
      "AUDIT_ERROR_CODES",
      "AUDIT_OUTCOMES",
      "LocalAuditLog",
    ]);
    expect(auditModule).not.toHaveProperty("query");
    expect(auditModule).not.toHaveProperty("parseTrustedAuditOperator");
    expect(auditModule).not.toHaveProperty("createAuditServer");
    expect(auditModule).not.toHaveProperty("exportAudit");
  });
});
