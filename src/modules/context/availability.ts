import {
  AVAILABILITY_BUDGET_WINDOW_MS,
  AVAILABILITY_CALLER_BUDGET,
  AVAILABILITY_DECISIONS,
  AVAILABILITY_HORIZON_MS,
  AVAILABILITY_MAX_DURATION_MS,
  AVAILABILITY_NODE_BUDGET,
  type AvailabilityDecision,
  type AvailabilityServiceDependencies,
} from "./contracts.js";

const CALLER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;

type ParsedInterval = Readonly<{
  startMs: number;
  endMs: number;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** ISO-8601 UTC with second or millisecond precision. Offsets and bare dates are rejected. */
const parseInstant = (value: unknown): number | null => {
  if (typeof value !== "string") {
    return null;
  }
  const match = INSTANT_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const fraction = match[7];
  const millisecond = fraction === undefined ? 0 : Number(fraction);
  const utc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const parsed = new Date(utc);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second ||
    parsed.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }
  return utc;
};

const parseBusyInterval = (value: unknown): ParsedInterval | null => {
  if (!isRecord(value)) {
    return null;
  }
  const startMs = parseInstant(value.start);
  const endMs = parseInstant(value.end);
  if (startMs === null || endMs === null || startMs >= endMs) {
    return null;
  }
  return { startMs, endMs };
};

const parseQueryInterval = (value: unknown, nowMs: number): ParsedInterval | null => {
  const interval = parseBusyInterval(value);
  if (interval === null) {
    return null;
  }
  const horizonEnd = nowMs + AVAILABILITY_HORIZON_MS;
  if (interval.startMs < nowMs || interval.endMs > horizonEnd) {
    return null;
  }
  if (interval.endMs - interval.startMs > AVAILABILITY_MAX_DURATION_MS) {
    return null;
  }
  return interval;
};

/** Half-open overlap: sharing only an endpoint is not an overlap. */
const overlaps = (left: ParsedInterval, right: ParsedInterval): boolean =>
  left.startMs < right.endMs && right.startMs < left.endMs;

const readCallerId = (query: Record<string, unknown>): string | null => {
  const { callerId } = query;
  return typeof callerId === "string" && CALLER_ID_PATTERN.test(callerId) ? callerId : null;
};

const readDecision = (query: Record<string, unknown>): AvailabilityDecision | null => {
  const { decision } = query;
  for (const candidate of AVAILABILITY_DECISIONS) {
    if (decision === candidate) {
      return candidate;
    }
  }
  return null;
};

const readNowMs = (clock: AvailabilityServiceDependencies["clock"]): number | null => {
  if (typeof clock?.nowMs !== "function") {
    return null;
  }
  const nowMs = clock.nowMs();
  if (
    !Number.isSafeInteger(nowMs) ||
    !Number.isSafeInteger(nowMs + AVAILABILITY_HORIZON_MS) ||
    !Number.isSafeInteger(nowMs - AVAILABILITY_BUDGET_WINDOW_MS)
  ) {
    return null;
  }
  return nowMs;
};

const withinWindow = (stamps: readonly number[], cutoff: number): number[] =>
  stamps.filter((stamp) => stamp > cutoff);

/**
 * Releases one boolean from simulated private context.
 * Any other outcome is null, with no reason and no busy intervals.
 * The read budget lives on this instance only: it is not durable and resets on restart.
 */
export class AvailabilityService {
  readonly #context: AvailabilityServiceDependencies["context"];
  readonly #clock: AvailabilityServiceDependencies["clock"];
  readonly #callerReads = new Map<string, number[]>();
  #nodeReads: number[] = [];

  constructor(dependencies: AvailabilityServiceDependencies) {
    this.#context = dependencies.context;
    this.#clock = dependencies.clock;
  }

  queryAvailability(query: unknown): boolean | null {
    try {
      if (!isRecord(query)) {
        return null;
      }
      const callerId = readCallerId(query);
      const decision = readDecision(query);
      if (callerId === null || decision !== "ALLOW") {
        return null;
      }
      const nowMs = readNowMs(this.#clock);
      if (nowMs === null) {
        return null;
      }
      const interval = parseQueryInterval(query.interval, nowMs);
      if (interval === null) {
        return null;
      }
      if (!this.#tryConsume(callerId, nowMs)) {
        return null;
      }
      const busy = this.#readBusy();
      if (busy === null) {
        return null;
      }
      return !busy.some((item) => overlaps(interval, item));
    } catch {
      return null;
    }
  }

  #tryConsume(callerId: string, nowMs: number): boolean {
    const cutoff = nowMs - AVAILABILITY_BUDGET_WINDOW_MS;
    const callerKept = withinWindow(this.#callerReads.get(callerId) ?? [], cutoff);
    const nodeKept = withinWindow(this.#nodeReads, cutoff);
    const allowed =
      callerKept.length < AVAILABILITY_CALLER_BUDGET && nodeKept.length < AVAILABILITY_NODE_BUDGET;
    if (allowed) {
      callerKept.push(nowMs);
      nodeKept.push(nowMs);
    }
    this.#nodeReads = nodeKept;
    if (callerKept.length === 0) {
      this.#callerReads.delete(callerId);
    } else {
      this.#callerReads.set(callerId, callerKept);
    }
    return allowed;
  }

  #readBusy(): readonly ParsedInterval[] | null {
    const listed: unknown = this.#context.busyIntervals;
    if (!Array.isArray(listed)) {
      return null;
    }
    const parsed: ParsedInterval[] = [];
    for (const item of listed) {
      const interval = parseBusyInterval(item);
      if (interval === null) {
        return null;
      }
      parsed.push(interval);
    }
    return parsed;
  }
}
