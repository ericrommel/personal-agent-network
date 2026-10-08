import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_ENVELOPE_CONTRACT_V1,
  AVAILABILITY_PURPOSE_V1,
  AVAILABILITY_REQUEST_CONTRACT_V1,
  AVAILABILITY_SCOPE_V1,
  acceptRemoteEnvelope,
  InMemoryReplayStore,
  type ReplayStore,
} from "../../../../src/modules/messaging/index.js";

const FROM = "pan_agent_11111111-1111-4111-8111-111111111111";
const TO = "pan_agent_22222222-2222-4222-a222-222222222222";
const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const SAN = `urn:pan:agent:${FROM}`;

const instant = (ms: number): string => new Date(ms).toISOString();

const body = {
  contract: AVAILABILITY_REQUEST_CONTRACT_V1,
  requestId: "req-1",
  targetAgentId: TO,
  purpose: AVAILABILITY_PURPOSE_V1,
  scope: AVAILABILITY_SCOPE_V1,
  start: "2026-10-08T12:01:00.000Z",
  end: "2026-10-08T13:00:00.000Z",
};

const envelope = (
  overrides: Record<string, unknown> = {},
  bodyOverrides: Record<string, unknown> = {},
) => ({
  contract: AVAILABILITY_ENVELOPE_CONTRACT_V1,
  messageId: "msg-1",
  issuedAt: instant(NOW),
  expiresAt: instant(NOW + 5 * 60 * 1000),
  recipientAgentId: TO,
  body: { ...body, ...bodyOverrides },
  ...overrides,
});

const accept = (
  value: unknown,
  store: ReplayStore = new InMemoryReplayStore(),
  nowMs: unknown = NOW,
  sender: unknown = SAN,
  localAgentId: unknown = TO,
) => acceptRemoteEnvelope(value, sender, localAgentId, nowMs, store);

describe("remote availability envelope", () => {
  it("accepts one fresh envelope and builds the principal from the URI SAN", async () => {
    const store = new InMemoryReplayStore();
    const accepted = await accept(envelope(), store);
    expect(accepted?.principal).toEqual({
      schema: "pan.authenticated-agent-principal/v1",
      kind: "authenticated-agent",
      agentId: FROM,
      authenticatedAt: instant(NOW),
    });
    expect(accepted?.principal.authenticatedAt).not.toBe(instant(NOW - 1));
    expect(accepted?.body).toEqual(body);
    expect(Object.isFrozen(accepted?.body)).toBe(true);
    const again = await accept(
      envelope({ messageId: "msg-2", issuedAt: instant(NOW + 1_000) }),
      store,
    );
    expect(again?.body.requestId).toBe("req-1");
  });

  it("accepts the skew and window edges and a null-prototype envelope", async () => {
    const atSkew = await accept(
      envelope({
        issuedAt: instant(NOW + 30_000),
        expiresAt: instant(NOW + 31_000),
      }),
      new InMemoryReplayStore(),
    );
    expect(atSkew?.body.requestId).toBe("req-1");
    const expiredEdge = await accept(
      envelope({
        messageId: "msg-expired-edge",
        issuedAt: instant(NOW - 31_000),
        expiresAt: instant(NOW - 30_000),
      }),
    );
    expect(expiredEdge?.body.requestId).toBe("req-1");
    const noFraction = envelope({
      messageId: "msg-no-fraction",
      issuedAt: "2026-10-08T12:00:00Z",
      expiresAt: "2026-10-08T12:05:00Z",
    });
    expect((await accept(noFraction))?.body.requestId).toBe("req-1");
    const bare = Object.create(null) as Record<string, unknown>;
    Object.assign(bare, envelope({ messageId: "msg-bare" }));
    expect((await accept(bare))?.principal.agentId).toBe(FROM);
  });

  it("fails closed for freshness, identity, recipient, and malformed envelopes", async () => {
    const store = new InMemoryReplayStore();
    const cases = [
      envelope({ issuedAt: instant(NOW + 30_001), expiresAt: instant(NOW + 31_001) }),
      envelope({ issuedAt: instant(NOW - 32_000), expiresAt: instant(NOW - 30_001) }),
      envelope({ expiresAt: instant(NOW + 5 * 60 * 1000 + 1) }),
      envelope({ issuedAt: instant(NOW), expiresAt: instant(NOW) }),
      envelope({ issuedAt: "2026-02-31T12:00:00.000Z" }),
      envelope({ issuedAt: "2026-13-01T12:00:00.000Z" }),
      envelope({ issuedAt: "2026-00-01T12:00:00.000Z" }),
      envelope({ issuedAt: "2026-10-00T12:00:00.000Z" }),
      envelope({ issuedAt: "2026-10-08T24:00:00.000Z" }),
      envelope({ issuedAt: "2026-10-08T12:60:00.000Z" }),
      envelope({ issuedAt: "2026-10-08T12:00:60.000Z" }),
      envelope({ issuedAt: "2026-10-08T12:00:00.000+00:00" }),
      envelope({ expiresAt: "not-a-time" }),
      envelope({ issuedAt: 1 }),
      envelope({ messageId: "" }),
      envelope({ messageId: "bad id" }),
      envelope({ contract: "pan.other/v1" }),
      envelope({ recipientAgentId: FROM }),
      envelope({}, { targetAgentId: FROM }),
      envelope({}, { contract: "pan.other/v1" }),
      envelope({}, { requestId: "" }),
      envelope({}, { purpose: 1 }),
      envelope({}, { scope: 1 }),
      envelope({}, { start: 1 }),
      envelope({}, { end: 1 }),
      envelope({}, { targetAgentId: "pan_agent_not-a-uuid" }),
      envelope({ recipientAgentId: "pan_human_33333333-3333-4333-8333-333333333333" }),
      { ...envelope(), extra: true },
      { ...envelope(), body: { ...body, sender: FROM } },
      { ...envelope(), body: [] },
      [],
      null,
      "envelope",
    ];
    for (const value of cases) {
      expect(await accept(value, store)).toBeNull();
    }
    expect(await accept(envelope({ messageId: "msg-after-reject" }), store)).not.toBeNull();
    expect(await accept(envelope(), store, NOW, "urn:pan:agent:not-an-agent")).toBeNull();
    expect(await accept(envelope(), store, NOW, `urn:pan:agent:${TO}`)).not.toBeNull();
    expect(await accept(envelope({ messageId: "msg-local" }), store, NOW, SAN, FROM)).toBeNull();
    expect(await accept(envelope({ messageId: "msg-clock" }), store, 1.5)).toBeNull();
    expect(await accept(envelope({ messageId: "msg-clock-2" }), store, "now")).toBeNull();
    expect(
      await accept(envelope({ messageId: "msg-clock-3" }), store, 8_640_000_000_000_001),
    ).toBeNull();
    expect(
      await accept(envelope({ messageId: "msg-clock-4" }), store, Number.MAX_SAFE_INTEGER - 10),
    ).toBeNull();
    expect(
      await accept(envelope({ messageId: "msg-clock-5" }), store, Number.MIN_SAFE_INTEGER + 10),
    ).toBeNull();
    const custom = Object.create({ extra: true }) as Record<string, unknown>;
    Object.assign(custom, envelope({ messageId: "msg-custom" }));
    expect(await accept(custom, store)).toBeNull();
    const symbolKey = envelope({ messageId: "msg-symbol" }) as Record<PropertyKey, unknown>;
    symbolKey[Symbol("extra")] = true;
    expect(await accept(symbolKey, store)).toBeNull();
    const getter = envelope({ messageId: "msg-getter" });
    Object.defineProperty(getter, "messageId", { get: () => "msg-getter" });
    expect(await accept(getter, store)).toBeNull();
  });

  it("does not spend the message id when an earlier check fails", async () => {
    const store = new InMemoryReplayStore();
    expect(await accept(envelope({ recipientAgentId: FROM }), store)).toBeNull();
    expect(await accept(envelope(), store)).not.toBeNull();
  });

  it("fails closed on a duplicate, a store failure, and an unusable id", async () => {
    const store = new InMemoryReplayStore();
    expect(await accept(envelope(), store)).not.toBeNull();
    expect(await accept(envelope({ body: { ...body, requestId: "req-2" } }), store)).toBeNull();
    expect(store.remember("")).toBe("duplicate");
    expect(store.remember(1 as never)).toBe("duplicate");
    const failing: ReplayStore = {
      remember(): "accepted" {
        throw new Error("database down");
      },
    };
    expect(await accept(envelope({ messageId: "msg-throw" }), failing)).toBeNull();
    const rejecting: ReplayStore = {
      remember: () => Promise.reject(new Error("database down")),
    };
    expect(await accept(envelope({ messageId: "msg-reject" }), rejecting)).toBeNull();
    const other: ReplayStore = {
      remember: () => "nope" as "accepted",
    };
    expect(await accept(envelope({ messageId: "msg-other" }), other)).toBeNull();
  });
});
