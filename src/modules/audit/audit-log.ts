import { randomUUID } from "node:crypto";
import { failure, type Result, success } from "../../shared/domain/result.js";
import {
  AUDIT_CATEGORIES,
  AUDIT_OUTCOMES,
  type AuditCategory,
  type AuditError,
  type AuditEvent,
  type AuditOutcome,
  type TrustedAuditOperator,
} from "./contracts.js";

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
/** Thirty 24-hour UTC days. Expired means recordedAt is strictly earlier than now minus this window. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const OPERATOR_KEYS = ["kind", "key"] as const;
const COMMAND_KEYS = ["kind", "category", "requestId", "outcome"] as const;

const INVALID_COMMAND: AuditError = Object.freeze({ code: "AUDIT_COMMAND_INVALID" });

export type AuditClock = Readonly<{ nowMs(): number }>;

type ParsedCommand = Readonly<{
  category: AuditCategory;
  requestId: string;
  outcome: AuditOutcome;
}>;

type StoredAuditEvent = Readonly<{
  recordedAtMs: number;
  event: AuditEvent;
}>;

const invalid = (): Result<never, AuditError> => failure(INVALID_COMMAND);

/**
 * Process-local audit record. A new instance is a new store; restart drops every event.
 * Not durable. Only a trusted local operator may append, read, or delete.
 * There is no remote read, export socket, or query.
 */
export class LocalAuditLog {
  readonly #clock: AuditClock;
  readonly #events: StoredAuditEvent[] = [];

  constructor(clock: AuditClock) {
    this.#clock = clock;
  }

  append(operator: TrustedAuditOperator, command: unknown): Result<AuditEvent, AuditError> {
    try {
      if (!isOperator(operator)) {
        return invalid();
      }
      const parsed = parseCommand(command);
      if (parsed === null) {
        return invalid();
      }
      const recordedAtMs = instant(this.#clock);
      if (recordedAtMs === null) {
        return invalid();
      }
      const event = createEvent(parsed, recordedAtMs);
      dropExpired(this.#events, recordedAtMs);
      this.#events.push({ recordedAtMs, event });
      return success(event);
    } catch {
      return invalid();
    }
  }

  read(operator: TrustedAuditOperator): Result<readonly AuditEvent[], AuditError> {
    try {
      if (!isOperator(operator)) {
        return invalid();
      }
      const recordedAtMs = instant(this.#clock);
      if (recordedAtMs === null) {
        return invalid();
      }
      dropExpired(this.#events, recordedAtMs);
      return success(Object.freeze(this.#events.map((item) => item.event)));
    } catch {
      return invalid();
    }
  }

  deleteAll(operator: TrustedAuditOperator): Result<true, AuditError> {
    try {
      if (!isOperator(operator)) {
        return invalid();
      }
      this.#events.length = 0;
      return success(true);
    } catch {
      return invalid();
    }
  }

  deleteExpired(operator: TrustedAuditOperator): Result<true, AuditError> {
    try {
      if (!isOperator(operator)) {
        return invalid();
      }
      const recordedAtMs = instant(this.#clock);
      if (recordedAtMs === null) {
        return invalid();
      }
      dropExpired(this.#events, recordedAtMs);
      return success(true);
    } catch {
      return invalid();
    }
  }
}

const createEvent = (command: ParsedCommand, recordedAtMs: number): AuditEvent =>
  Object.freeze({
    kind: "audit-event",
    id: `pan_audit_${randomUUID()}`,
    recordedAt: new Date(recordedAtMs).toISOString(),
    category: command.category,
    requestId: command.requestId,
    outcome: command.outcome,
  });

const dropExpired = (events: StoredAuditEvent[], nowMs: number): void => {
  const cutoff = nowMs - RETENTION_MS;
  let kept = 0;
  for (const event of events) {
    if (event.recordedAtMs >= cutoff) {
      events[kept] = event;
      kept += 1;
    }
  }
  events.length = kept;
};

const instant = (clock: AuditClock): number | null => {
  const raw = clock.nowMs();
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  const recordedAtMs = new Date(raw).getTime();
  return Number.isFinite(recordedAtMs) ? recordedAtMs : null;
};

const parseCommand = (input: unknown): ParsedCommand | null => {
  try {
    const record = exactOwnData(input, COMMAND_KEYS, "data");
    if (
      record === null ||
      record.kind !== "audit-event" ||
      !isCategory(record.category) ||
      !isToken(record.requestId) ||
      !isOutcome(record.outcome)
    ) {
      return null;
    }
    return {
      category: record.category,
      requestId: record.requestId,
      outcome: record.outcome,
    };
  } catch {
    return null;
  }
};

const isOperator = (input: unknown): input is TrustedAuditOperator => {
  const record = exactOwnData(input, OPERATOR_KEYS, "object");
  return record !== null && record.kind === "trusted-audit-operator" && isToken(record.key);
};

const isCategory = (input: unknown): input is AuditCategory =>
  AUDIT_CATEGORIES.some((category) => category === input);

const isOutcome = (input: unknown): input is AuditOutcome =>
  AUDIT_OUTCOMES.some((outcome) => outcome === input);

const isToken = (input: unknown): input is string => typeof input === "string" && TOKEN.test(input);

const exactOwnData = (
  input: unknown,
  expected: readonly string[],
  prototype: "object" | "data",
): Record<string, unknown> | null => {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return null;
    }
    const actual = Object.getPrototypeOf(input) as unknown;
    const prototypeAllowed =
      prototype === "object"
        ? actual === Object.prototype
        : actual === Object.prototype || actual === null;
    const keys = Reflect.ownKeys(input);
    if (
      !prototypeAllowed ||
      !Object.values(Object.getOwnPropertyDescriptors(input)).every((item) => "value" in item) ||
      keys.length !== expected.length ||
      !expected.every((key) => Object.hasOwn(input, key)) ||
      !keys.every((key) => typeof key === "string")
    ) {
      return null;
    }
    return input as Record<string, unknown>;
  } catch {
    return null;
  }
};
