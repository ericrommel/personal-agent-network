import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { failure, type Result, success } from "../../shared/domain/result.js";
import type { AuditClock } from "./audit-log.js";
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
const AUDIT_ID = /^pan_audit_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Thirty 24-hour UTC days. Expired means recordedAt is strictly earlier than now minus this window. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const OPERATOR_KEYS = ["kind", "key"] as const;
const COMMAND_KEYS = ["kind", "category", "requestId", "outcome"] as const;
const INVALID: AuditError = Object.freeze({ code: "AUDIT_COMMAND_INVALID" });

/**
 * Minimized audit rows. Instants stay text. No availability result, profile, secret, or message.
 * The node can append through an injected log. It does not construct this class.
 * A restarted read is not Issue #12 acceptance.
 */
export const AUDIT_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS audit_records (
  audit_id text PRIMARY KEY,
  recorded_at text NOT NULL,
  category text NOT NULL,
  request_id text NOT NULL,
  outcome text NOT NULL,
  CONSTRAINT audit_records_category CHECK (
    category IN ('decision', 'approval', 'disclosure', 'revocation')
  ),
  CONSTRAINT audit_records_outcome CHECK (
    outcome IN ('allow', 'ask', 'deny', 'released', 'invalidated', 'unavailable')
  )
)`;

const DELETE_EXPIRED_SQL = "DELETE FROM audit_records WHERE recorded_at < $1";
const DELETE_ALL_SQL = "DELETE FROM audit_records";
const SELECT_SQL = `SELECT audit_id, recorded_at, category, request_id, outcome
FROM audit_records
ORDER BY recorded_at, audit_id`;
const INSERT_SQL = `INSERT INTO audit_records (
  audit_id, recorded_at, category, request_id, outcome
) VALUES ($1, $2, $3, $4, $5)
RETURNING audit_id, recorded_at, category, request_id, outcome`;

export type SqlQueryResult = Readonly<{
  rows: readonly unknown[];
  rowCount: number | null;
}>;

export type SqlQuery = (sql: string, params: readonly unknown[]) => Promise<SqlQueryResult>;

export type SqlClient = Readonly<{
  query: SqlQuery;
  release(): void;
}>;

export type SqlPool = Readonly<{
  connect(): Promise<SqlClient>;
  end(): Promise<void>;
}>;

type PgPoolLike = Readonly<{
  connect(): Promise<{
    query(sql: string, params?: readonly unknown[]): Promise<SqlQueryResult>;
    release(): void;
  }>;
  end(): Promise<void>;
}>;

type ParsedCommand = Readonly<{
  category: AuditCategory;
  requestId: string;
  outcome: AuditOutcome;
}>;

const invalid = (): Result<never, AuditError> => failure(INVALID);

export class PostgresAuditLog {
  readonly #clock: AuditClock;
  readonly #pool: SqlPool;

  constructor(pool: SqlPool, clock: AuditClock) {
    this.#pool = pool;
    this.#clock = clock;
  }

  async append(
    operator: TrustedAuditOperator,
    command: unknown,
  ): Promise<Result<AuditEvent, AuditError>> {
    try {
      const parsed = acceptedCommand(operator, command);
      const nowMs = instant(this.#clock);
      if (parsed === null || nowMs === null) {
        return invalid();
      }
      const event = await this.#transaction(async (query) => {
        await query(DELETE_EXPIRED_SQL, [cutoffIso(nowMs)]);
        const inserted = await query(INSERT_SQL, insertParams(parsed, nowMs));
        const saved = toEvent(inserted.rows[0]);
        if (saved === null || (inserted.rowCount ?? 0) !== 1) {
          throw new Error("audit insert missed");
        }
        return saved;
      });
      return success(event);
    } catch {
      return invalid();
    }
  }

  async read(operator: TrustedAuditOperator): Promise<Result<readonly AuditEvent[], AuditError>> {
    try {
      if (!isOperator(operator)) {
        return invalid();
      }
      const nowMs = instant(this.#clock);
      if (nowMs === null) {
        return invalid();
      }
      const rows = await this.#transaction(async (query) => {
        await query(DELETE_EXPIRED_SQL, [cutoffIso(nowMs)]);
        const found = await query(SELECT_SQL, []);
        return found.rows;
      });
      const events: AuditEvent[] = [];
      for (const row of rows) {
        const event = toEvent(row);
        if (event === null) {
          return invalid();
        }
        events.push(event);
      }
      return success(Object.freeze(events));
    } catch {
      return invalid();
    }
  }

  async deleteAll(operator: TrustedAuditOperator): Promise<Result<true, AuditError>> {
    try {
      if (!isOperator(operator)) {
        return invalid();
      }
      await this.#transaction(async (query) => {
        await query(DELETE_ALL_SQL, []);
      });
      return success(true);
    } catch {
      return invalid();
    }
  }

  async deleteExpired(operator: TrustedAuditOperator): Promise<Result<true, AuditError>> {
    try {
      if (!isOperator(operator)) {
        return invalid();
      }
      const nowMs = instant(this.#clock);
      if (nowMs === null) {
        return invalid();
      }
      await this.#transaction(async (query) => {
        await query(DELETE_EXPIRED_SQL, [cutoffIso(nowMs)]);
      });
      return success(true);
    } catch {
      return invalid();
    }
  }

  async #transaction<T>(work: (query: SqlQuery) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN", []);
      const value = await work(client.query);
      await client.query("COMMIT", []);
      return value;
    } catch (error) {
      try {
        await client.query("ROLLBACK", []);
      } catch {
        // The caller still receives the invalid command result.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

export const applyAuditSchema = async (pool: SqlPool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(AUDIT_SCHEMA_SQL, []);
  } finally {
    client.release();
  }
};

/** Local node-postgres pool. TLS is not forced; the URL decides. */
export const createPgPool = (
  connectionString: string,
  openPool: (connectionString: string) => PgPoolLike = openNodePostgresPool,
): SqlPool => {
  const pool = openPool(connectionString);
  return {
    async connect() {
      const client = await pool.connect();
      return {
        query: async (sql, params) => {
          const result = await client.query(sql, params);
          return {
            rows: result.rows,
            rowCount: result.rowCount,
          };
        },
        release() {
          client.release();
        },
      };
    },
    async end() {
      await pool.end();
    },
  };
};

const openNodePostgresPool = (connectionString: string): PgPoolLike =>
  new Pool({
    connectionString,
    max: 4,
    connectionTimeoutMillis: 2_000,
  });

const acceptedCommand = (operator: TrustedAuditOperator, command: unknown): ParsedCommand | null =>
  isOperator(operator) ? parseCommand(command) : null;

const insertParams = (command: ParsedCommand, nowMs: number): readonly unknown[] => [
  `pan_audit_${randomUUID()}`,
  new Date(nowMs).toISOString(),
  command.category,
  command.requestId,
  command.outcome,
];

const cutoffIso = (nowMs: number): string => new Date(nowMs - RETENTION_MS).toISOString();

const toEvent = (row: unknown): AuditEvent | null => {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return null;
  }
  const record = row as Record<string, unknown>;
  const id = record.audit_id;
  const recordedAt = record.recorded_at;
  const category = record.category;
  const requestId = record.request_id;
  const outcome = record.outcome;
  if (
    typeof id !== "string" ||
    !AUDIT_ID.test(id) ||
    typeof recordedAt !== "string" ||
    !isCanonicalInstant(recordedAt) ||
    !isCategory(category) ||
    typeof requestId !== "string" ||
    !TOKEN.test(requestId) ||
    !isOutcome(outcome)
  ) {
    return null;
  }
  return Object.freeze({
    kind: "audit-event",
    id,
    recordedAt,
    category,
    requestId,
    outcome,
  });
};

const isCanonicalInstant = (value: string): boolean => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
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
  try {
    const record = exactOwnData(input, OPERATOR_KEYS, "object");
    return record !== null && record.kind === "trusted-audit-operator" && isToken(record.key);
  } catch {
    return false;
  }
};

const isCategory = (input: unknown): input is AuditCategory =>
  AUDIT_CATEGORIES.some((category) => category === input);

const isOutcome = (input: unknown): input is AuditOutcome =>
  AUDIT_OUTCOMES.some((outcome) => outcome === input);

const isToken = (input: unknown): input is string => typeof input === "string" && TOKEN.test(input);

const instant = (clock: AuditClock): number | null => {
  try {
    const raw = clock.nowMs();
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return null;
    }
    const recordedAtMs = new Date(raw).getTime();
    return Number.isFinite(recordedAtMs) ? recordedAtMs : null;
  } catch {
    return null;
  }
};

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
