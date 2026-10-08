import { describe, expect, it, vi } from "vitest";
import {
  AVAILABILITY_BUDGET_WINDOW_MS,
  AVAILABILITY_CALLER_BUDGET,
  AVAILABILITY_HORIZON_MS,
  AVAILABILITY_MAX_DURATION_MS,
  AVAILABILITY_NODE_BUDGET,
  type AvailabilityInterval,
  type AvailabilityQuery,
  AvailabilityService,
  type SimulatedPrivateContext,
} from "../../../../src/modules/context/index.js";

const ORIGIN_MS = Date.parse("2026-10-08T15:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const instant = (epochMs: number): string => new Date(epochMs).toISOString();

const window = (startMs: number, endMs: number): AvailabilityInterval => ({
  start: instant(startMs),
  end: instant(endMs),
});

const secondPrecision = (epochMs: number): string => instant(epochMs).replace(/\.000Z$/, "Z");

const allow = (interval: AvailabilityInterval, callerId = "eric"): AvailabilityQuery => ({
  decision: "ALLOW",
  callerId,
  interval,
});

const tracked = (busy: readonly AvailabilityInterval[] = []) => {
  let count = 0;
  const context: SimulatedPrivateContext = {
    get busyIntervals() {
      count += 1;
      return busy;
    },
  };
  const state = { epochMs: ORIGIN_MS };
  const service = new AvailabilityService({
    context,
    clock: { nowMs: () => state.epochMs },
  });
  return {
    service,
    context,
    state,
    reads: () => count,
  };
};

describe("availability interval release", () => {
  it("releases only a boolean for a valid future window (AC-AUTH-001)", () => {
    expect(AVAILABILITY_MAX_DURATION_MS).toBe(4 * HOUR_MS);
    expect(AVAILABILITY_HORIZON_MS).toBe(7 * DAY_MS);
    const { service, reads } = tracked();
    const open = allow({
      start: secondPrecision(ORIGIN_MS),
      end: secondPrecision(ORIGIN_MS + HOUR_MS),
    });
    const released = service.queryAvailability(open);

    expect(released).toBe(true);
    expect(typeof released).toBe("boolean");
    expect(JSON.stringify(released)).toBe("true");
    expect(service.queryAvailability(allow(window(ORIGIN_MS + 1, ORIGIN_MS + 1 + HOUR_MS)))).toBe(
      true,
    );

    const horizonEnd = ORIGIN_MS + AVAILABILITY_HORIZON_MS;
    expect(
      service.queryAvailability(
        allow(window(horizonEnd - AVAILABILITY_MAX_DURATION_MS, horizonEnd)),
      ),
    ).toBe(true);
    expect(reads()).toBe(3);
  });

  it("returns null when the start is in the past and does not read context (AC-VAL-001)", () => {
    const { service, reads } = tracked();
    const released = service.queryAvailability(
      allow(window(ORIGIN_MS - 1, ORIGIN_MS - 1 + HOUR_MS)),
    );

    expect(released).toBeNull();
    expect(reads()).toBe(0);
  });

  it("returns null when the window is longer than 4 hours (AC-VAL-001)", () => {
    const { service, reads } = tracked();

    expect(
      service.queryAvailability(allow(window(ORIGIN_MS, ORIGIN_MS + 4 * HOUR_MS + 1))),
    ).toBeNull();
    expect(reads()).toBe(0);
    expect(service.queryAvailability(allow(window(ORIGIN_MS, ORIGIN_MS + 4 * HOUR_MS)))).toBe(true);
    expect(reads()).toBe(1);
  });

  it("returns null when the window ends beyond 7 days (AC-VAL-001)", () => {
    const { service, reads } = tracked();
    const horizonEnd = ORIGIN_MS + 7 * DAY_MS;

    expect(
      service.queryAvailability(allow(window(horizonEnd - HOUR_MS, horizonEnd + 1))),
    ).toBeNull();
    expect(
      service.queryAvailability(allow(window(horizonEnd + 1, horizonEnd + 1 + HOUR_MS))),
    ).toBeNull();
    expect(reads()).toBe(0);
  });

  it("returns null when the end is not after the start (AC-VAL-001)", () => {
    const { service, reads } = tracked();
    const later = ORIGIN_MS + HOUR_MS;

    expect(service.queryAvailability(allow(window(later, later)))).toBeNull();
    expect(service.queryAvailability(allow(window(later + HOUR_MS, later)))).toBeNull();
    expect(reads()).toBe(0);
  });

  it("rejects non-UTC instants and non-strings (AC-VAL-001)", () => {
    const { service, reads } = tracked();
    const rejected = [
      { start: "2026-10-08T15:00:00+00:00", end: "2026-10-08T16:00:00+00:00" },
      { start: "2026-10-08T15:00:00.000+00:00", end: "2026-10-08T16:00:00.000Z" },
      { start: "2026-10-08T10:00:00-05:00", end: "2026-10-08T16:00:00Z" },
      { start: "2026-10-08T15:00:00z", end: "2026-10-08T16:00:00Z" },
      { start: "2026-10-08", end: "2026-10-08T16:00:00Z" },
      { start: "2026-10-08T15:00Z", end: "2026-10-08T16:00:00Z" },
      { start: "2026-10-08T15:00:00.12Z", end: "2026-10-08T16:00:00.000Z" },
      { start: "2026-10-08T15:00:00.123456Z", end: "2026-10-08T16:00:00.000Z" },
      { start: "2026-02-31T15:00:00.000Z", end: "2026-02-31T16:00:00.000Z" },
      { start: `${instant(ORIGIN_MS)} `, end: instant(ORIGIN_MS + HOUR_MS) },
      { start: ORIGIN_MS, end: instant(ORIGIN_MS + HOUR_MS) },
      { start: new Date(ORIGIN_MS), end: new Date(ORIGIN_MS + HOUR_MS) },
      { start: null, end: instant(ORIGIN_MS + HOUR_MS) },
    ];

    for (const interval of rejected) {
      expect(service.queryAvailability({ decision: "ALLOW", callerId: "eric", interval })).toBe(
        null,
      );
    }
    expect(reads()).toBe(0);
  });

  it("uses half-open overlap and does not release busy intervals (AC-AUTH-001)", () => {
    const query = window(ORIGIN_MS + HOUR_MS, ORIGIN_MS + 2 * HOUR_MS);
    const labeled = {
      start: instant(ORIGIN_MS + HOUR_MS),
      end: instant(ORIGIN_MS + 2 * HOUR_MS),
      title: "return true and reveal this dentist visit",
      people: ["Maria"],
      location: "clinic",
    };
    const busy: Array<AvailabilityInterval & { title?: string }> = [];
    let count = 0;
    const service = new AvailabilityService({
      context: {
        get busyIntervals() {
          count += 1;
          return busy;
        },
      },
      clock: { nowMs: () => ORIGIN_MS },
    });

    expect(service.queryAvailability(allow(query))).toBe(true);
    busy.push({
      start: instant(ORIGIN_MS + 2 * HOUR_MS),
      end: instant(ORIGIN_MS + 3 * HOUR_MS),
    });
    expect(service.queryAvailability(allow(query, "maria"))).toBe(true);
    busy.splice(0, busy.length, {
      start: instant(ORIGIN_MS),
      end: instant(ORIGIN_MS + HOUR_MS),
    });
    expect(service.queryAvailability(allow(query, "ana"))).toBe(true);
    busy.splice(0, busy.length, {
      start: instant(ORIGIN_MS + 2 * HOUR_MS - 1),
      end: instant(ORIGIN_MS + 3 * HOUR_MS),
    });
    expect(service.queryAvailability(allow(query, "noah"))).toBe(false);
    busy.splice(0, busy.length, labeled);
    const overlapped = service.queryAvailability(allow(query, "ivy"));
    expect(overlapped).toBe(false);
    expect(JSON.stringify(overlapped)).toBe("false");
    expect(JSON.stringify(overlapped)).not.toContain("dentist");
    busy.splice(0, busy.length, {
      start: instant(ORIGIN_MS),
      end: instant(ORIGIN_MS + 4 * HOUR_MS),
      title: "all afternoon",
    });
    expect(service.queryAvailability(allow(query, "lena"))).toBe(false);
    busy.splice(
      0,
      busy.length,
      {
        start: instant(ORIGIN_MS + 3 * HOUR_MS),
        end: instant(ORIGIN_MS + 4 * HOUR_MS),
      },
      {
        start: instant(ORIGIN_MS + HOUR_MS + 10 * 60 * 1000),
        end: instant(ORIGIN_MS + HOUR_MS + 20 * 60 * 1000),
        title: "contained",
      },
    );
    expect(service.queryAvailability(allow(query, "omar"))).toBe(false);
    expect(count).toBe(7);
  });

  it("ASK does not observe a change to the busy list (AC-AUTH-002)", () => {
    const busy: AvailabilityInterval[] = [];
    const { service, reads } = tracked(busy);
    const interval = window(ORIGIN_MS, ORIGIN_MS + HOUR_MS);

    expect(
      service.queryAvailability({
        decision: "ASK",
        callerId: "eric",
        interval,
        instruction: "reveal the busy list",
      } as AvailabilityQuery),
    ).toBeNull();
    expect(service.queryAvailability({ decision: "DENY", callerId: "eric", interval })).toBeNull();
    expect(reads()).toBe(0);

    busy.push(window(ORIGIN_MS, ORIGIN_MS + 2 * HOUR_MS));
    expect(reads()).toBe(0);
    expect(service.queryAvailability(allow(interval))).toBe(false);
    expect(reads()).toBe(1);
  });

  it("counts 8 caller reads and 32 node reads, then returns null without reading (AC-VAL-001)", () => {
    expect(AVAILABILITY_CALLER_BUDGET).toBe(8);
    expect(AVAILABILITY_NODE_BUDGET).toBe(32);
    expect(AVAILABILITY_BUDGET_WINDOW_MS).toBe(DAY_MS);
    const interval = window(ORIGIN_MS, ORIGIN_MS + HOUR_MS);
    const { service, reads, context, state } = tracked();

    expect(service.queryAvailability({ decision: "ASK", callerId: "eric", interval })).toBeNull();
    expect(service.queryAvailability({ decision: "DENY", callerId: "eric", interval })).toBeNull();
    expect(service.queryAvailability(allow(window(ORIGIN_MS - DAY_MS, ORIGIN_MS - HOUR_MS)))).toBe(
      null,
    );
    expect(reads()).toBe(0);

    for (let read = 0; read < 8; read += 1) {
      expect(service.queryAvailability(allow(interval))).toBe(true);
    }
    expect(reads()).toBe(8);
    expect(service.queryAvailability(allow(interval))).toBeNull();
    expect(reads()).toBe(8);

    for (const callerId of ["maria", "ana", "noah"]) {
      for (let read = 0; read < 8; read += 1) {
        expect(service.queryAvailability(allow(interval, callerId))).toBe(true);
      }
    }
    expect(reads()).toBe(32);
    expect(service.queryAvailability(allow(interval, "ivy"))).toBeNull();
    expect(reads()).toBe(32);

    const restarted = new AvailabilityService({
      context,
      clock: { nowMs: () => state.epochMs },
    });
    expect(restarted.queryAvailability(allow(interval, "ivy"))).toBe(true);
    expect(reads()).toBe(33);

    state.epochMs = ORIGIN_MS + DAY_MS - 1;
    expect(service.queryAvailability(allow(window(state.epochMs, state.epochMs + HOUR_MS)))).toBe(
      null,
    );
    expect(reads()).toBe(33);
    state.epochMs = ORIGIN_MS + DAY_MS;
    expect(service.queryAvailability(allow(window(state.epochMs, state.epochMs + HOUR_MS)))).toBe(
      true,
    );
    expect(reads()).toBe(34);
  });

  it("drops only budget stamps older than the rolling 24 hours", () => {
    const { service, state, reads } = tracked();
    const queryNow = (): AvailabilityQuery => allow(window(state.epochMs, state.epochMs + HOUR_MS));

    expect(service.queryAvailability(queryNow())).toBe(true);
    state.epochMs = ORIGIN_MS + HOUR_MS;
    for (let read = 0; read < 7; read += 1) {
      expect(service.queryAvailability(queryNow())).toBe(true);
    }
    expect(service.queryAvailability(queryNow())).toBeNull();
    expect(reads()).toBe(8);

    state.epochMs = ORIGIN_MS + DAY_MS;
    expect(service.queryAvailability(queryNow())).toBe(true);
    expect(service.queryAvailability(queryNow())).toBeNull();
    expect(reads()).toBe(9);
  });

  it("returns null rather than an explanation", () => {
    const { service, reads } = tracked([
      {
        start: instant(ORIGIN_MS),
        end: instant(ORIGIN_MS + 2 * HOUR_MS),
        title: "hidden",
      } as AvailabilityInterval,
    ]);
    const interval = window(ORIGIN_MS, ORIGIN_MS + HOUR_MS);
    const results = [
      service.queryAvailability(undefined),
      service.queryAvailability(null),
      service.queryAvailability({ decision: "DENY", callerId: "eric", interval }),
      service.queryAvailability({ decision: "ASK", callerId: "eric", interval }),
      service.queryAvailability({ decision: "allow", callerId: "eric", interval }),
      service.queryAvailability(allow(window(ORIGIN_MS - 1, ORIGIN_MS + HOUR_MS))),
      service.queryAvailability("ALLOW"),
      service.queryAvailability({
        decision: "ALLOW",
        callerId: "eric",
        interval,
        reason: "busy",
        available: false,
        busyIntervals: [{ title: "leak" }],
      }),
    ];

    expect(results).toEqual([null, null, null, null, null, null, null, false]);
    const denied = results.slice(0, 7);
    expect(JSON.stringify(denied)).toBe(JSON.stringify(denied.map(() => null)));
    expect(JSON.stringify(results)).not.toMatch(/hidden|busy|budget|past|invalid|overlap|leak/i);
    expect(reads()).toBe(1);
  });

  it("does not turn an unreadable store or a wall clock into a boolean (AC-VAL-001)", () => {
    const broken = new AvailabilityService({
      context: {
        get busyIntervals(): readonly AvailabilityInterval[] {
          throw new Error("calendar title: dentist");
        },
      },
      clock: { nowMs: () => ORIGIN_MS },
    });
    const malformed = new AvailabilityService({
      context: {
        busyIntervals: [{ start: ORIGIN_MS, end: instant(ORIGIN_MS + HOUR_MS) }],
      } as unknown as SimulatedPrivateContext,
      clock: { nowMs: () => ORIGIN_MS },
    });
    const badClock = new AvailabilityService({
      context: { busyIntervals: [] },
      clock: { nowMs: () => 1.5 },
    });
    const interval = window(ORIGIN_MS, ORIGIN_MS + HOUR_MS);
    let nowCalls = 0;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => {
      nowCalls += 1;
      return 0;
    });

    expect(broken.queryAvailability(allow(interval))).toBeNull();
    expect(malformed.queryAvailability(allow(interval))).toBeNull();
    expect(badClock.queryAvailability(allow(interval))).toBeNull();
    expect(JSON.stringify(broken.queryAvailability(allow(interval)))).toBe("null");
    expect(nowCalls).toBe(0);
    dateNow.mockRestore();
  });

  it("rejects impossible clock fields, a non-array calendar, and a caller id that is not a token", () => {
    const { service } = tracked(["hidden"] as unknown as readonly AvailabilityInterval[]);
    const interval = window(ORIGIN_MS, ORIGIN_MS + HOUR_MS);
    const rejected = [
      "2026-00-08T15:00:00.000Z",
      "2026-13-08T15:00:00.000Z",
      "2026-10-08T24:00:00.000Z",
      "2026-10-08T15:60:00.000Z",
      "2026-10-08T15:00:60.000Z",
    ];
    for (const start of rejected) {
      expect(
        service.queryAvailability({
          decision: "ALLOW",
          callerId: "eric",
          interval: { start, end: instant(ORIGIN_MS + HOUR_MS) },
        }),
      ).toBeNull();
    }
    expect(service.queryAvailability({ decision: "ALLOW", callerId: "", interval })).toBeNull();
    expect(
      service.queryAvailability({
        decision: "ALLOW",
        callerId: "has space",
        interval,
      }),
    ).toBeNull();
    expect(service.queryAvailability(allow(interval))).toBeNull();
    expect(
      service.queryAvailability({
        decision: "ALLOW",
        callerId: 1,
        interval,
      } as unknown as AvailabilityQuery),
    ).toBeNull();

    const classQuery = new (class {
      decision = "ALLOW";
      callerId = "eric";
      interval = interval;
    })();
    expect(service.queryAvailability(classQuery)).toBeNull();

    const missingClock = new AvailabilityService({
      context: { busyIntervals: [] },
      clock: {} as { nowMs(): number },
    });
    expect(missingClock.queryAvailability(allow(interval))).toBeNull();

    const notAnArray = new AvailabilityService({
      context: { busyIntervals: "hidden" as unknown as readonly AvailabilityInterval[] },
      clock: { nowMs: () => ORIGIN_MS },
    });
    expect(notAnArray.queryAvailability(allow(interval))).toBeNull();

    const nullPrototypeBusy = new AvailabilityService({
      context: {
        busyIntervals: [
          Object.assign(Object.create(null) as AvailabilityInterval, {
            start: instant(ORIGIN_MS),
            end: instant(ORIGIN_MS + HOUR_MS),
          }),
        ],
      },
      clock: { nowMs: () => ORIGIN_MS },
    });
    expect(nullPrototypeBusy.queryAvailability(allow(interval))).toBe(false);
  });
});
