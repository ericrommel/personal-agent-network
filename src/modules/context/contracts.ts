/** Half-open UTC query limits and the process-local rolling read budget. */
export const AVAILABILITY_MAX_DURATION_MS = 4 * 60 * 60 * 1000;
export const AVAILABILITY_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;
export const AVAILABILITY_CALLER_BUDGET = 8;
export const AVAILABILITY_NODE_BUDGET = 32;
export const AVAILABILITY_BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;

export const AVAILABILITY_DECISIONS = ["ALLOW", "ASK", "DENY"] as const;

export type AvailabilityDecision = (typeof AVAILABILITY_DECISIONS)[number];

/** Half-open UTC interval `[start, end)`. Instants are strings, not epoch numbers. */
export type AvailabilityInterval = Readonly<{
  start: string;
  end: string;
}>;

export type AvailabilityQuery = Readonly<{
  decision: AvailabilityDecision;
  callerId: string;
  interval: AvailabilityInterval;
}>;

/** Injected node clock. Availability does not read `Date.now` itself. */
export type AvailabilityClock = Readonly<{
  nowMs(): number;
}>;

/**
 * Simulated private busy intervals for one target agent.
 * Readers must not touch `busyIntervals` unless a boolean may be released.
 */
export type SimulatedPrivateContext = Readonly<{
  busyIntervals: readonly AvailabilityInterval[];
}>;

export type AvailabilityServiceDependencies = Readonly<{
  context: SimulatedPrivateContext;
  clock: AvailabilityClock;
}>;
