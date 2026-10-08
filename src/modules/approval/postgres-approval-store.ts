import { Pool } from "pg";
import type { ApprovalError } from "./contracts.js";
import {
  type ApprovalRecord,
  type ApprovalStatus,
  isApproval,
  sameApprovalBinding,
} from "./domain/approval.js";

const dependencyFailure = (): ApprovalError =>
  Object.freeze({ code: "APPROVAL_DEPENDENCY_FAILED" });

const conflict = (): ApprovalError => Object.freeze({ code: "APPROVAL_CONFLICT" });

/**
 * One row per approval and per request. Instants stay text so the driver does not
 * turn them into Date objects. No availability result, profile, secret, kind, or email.
 */
export const APPROVAL_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS approval_records (
  approval_id text PRIMARY KEY,
  request_id text NOT NULL,
  from_agent_id text NOT NULL,
  to_agent_id text NOT NULL,
  skill_version text NOT NULL,
  purpose text NOT NULL,
  scope text NOT NULL,
  start_at text NOT NULL,
  end_at text NOT NULL,
  policy_version text NOT NULL,
  status text NOT NULL,
  expires_at text NOT NULL,
  CONSTRAINT approval_records_request UNIQUE (request_id),
  CONSTRAINT approval_records_status CHECK (
    status IN ('pending', 'approved', 'rejected', 'expired', 'released', 'invalidated')
  )
)`;

const COLUMN_LIST = [
  "approval_id",
  "request_id",
  "from_agent_id",
  "to_agent_id",
  "skill_version",
  "purpose",
  "scope",
  "start_at",
  "end_at",
  "policy_version",
  "status",
  "expires_at",
].join(", ");

const SELECT_BY_ID_OR_REQUEST_FOR_UPDATE = `SELECT ${COLUMN_LIST}
FROM approval_records
WHERE approval_id = $1 OR request_id = $2
FOR UPDATE`;

const SELECT_BY_ID_FOR_UPDATE = `SELECT ${COLUMN_LIST}
FROM approval_records
WHERE approval_id = $1
FOR UPDATE`;

const SELECT_BY_REQUEST = `SELECT ${COLUMN_LIST}
FROM approval_records
WHERE request_id = $1`;

const SELECT_BY_ID = `SELECT ${COLUMN_LIST}
FROM approval_records
WHERE approval_id = $1`;

const SELECT_ALL = `SELECT ${COLUMN_LIST}
FROM approval_records
ORDER BY request_id`;

const INSERT_SQL = `INSERT INTO approval_records (
  approval_id, request_id, from_agent_id, to_agent_id, skill_version, purpose, scope,
  start_at, end_at, policy_version, status, expires_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
RETURNING ${COLUMN_LIST}`;

const UPDATE_STATUS_SQL = `UPDATE approval_records
SET status = $1
WHERE approval_id = $2 AND request_id = $3
RETURNING ${COLUMN_LIST}`;

const TRANSITIONS: Readonly<Record<ApprovalStatus, readonly ApprovalStatus[]>> = {
  pending: ["approved", "rejected", "expired", "invalidated"],
  approved: ["released", "expired", "invalidated"],
  rejected: [],
  expired: [],
  released: [],
  invalidated: [],
};

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

type InsertDecision =
  | { readonly type: "dependency" }
  | { readonly type: "conflict" }
  | { readonly type: "existing"; readonly row: ApprovalRecord }
  | { readonly type: "insert" };

class StoredConflict extends Error {
  constructor() {
    super("APPROVAL_CONFLICT");
    this.name = "StoredConflict";
  }
}

/**
 * Async PostgreSQL adapter. It does not implement synchronous ApprovalStore.
 * ApprovalService stays synchronous until wiring can follow PR #62.
 * Read-then-write uses one transaction. A thrown query rolls back.
 * A unique request id stops two inserts from both committing.
 */
export class PostgresApprovalStore {
  readonly #pool: SqlPool;

  constructor(pool: SqlPool) {
    this.#pool = pool;
  }

  async insertPending(record: unknown): Promise<unknown> {
    try {
      if (!isApproval(record) || record.status !== "pending") {
        return dependencyFailure();
      }
      return await this.#transaction(async (query) => {
        const found = await query(SELECT_BY_ID_OR_REQUEST_FOR_UPDATE, [
          record.id,
          record.requestId,
        ]);
        const decision = decideInsert(record, found.rows);
        if (decision.type === "dependency") {
          throw new Error("approval dependency");
        }
        if (decision.type === "conflict") {
          throw new StoredConflict();
        }
        if (decision.type === "existing") {
          return decision.row;
        }
        const inserted = await query(INSERT_SQL, insertParams(record));
        const saved = toApproval(inserted.rows[0]);
        if (saved === null) {
          throw new Error("approval insert missed");
        }
        if ((inserted.rowCount ?? 0) !== 1) {
          throw new Error("approval insert missed");
        }
        return saved;
      });
    } catch (error) {
      if (error instanceof StoredConflict) {
        return conflict();
      }
      return dependencyFailure();
    }
  }

  async replace(record: unknown): Promise<unknown> {
    try {
      if (!isApproval(record)) {
        return dependencyFailure();
      }
      return await this.#transaction(async (query) => {
        const found = await query(SELECT_BY_ID_FOR_UPDATE, [record.id]);
        const current = toApproval(found.rows[0]);
        if (current === null) {
          throw new Error("approval dependency");
        }
        if (current.requestId !== record.requestId) {
          throw new Error("approval dependency");
        }
        if (current.id !== record.id) {
          throw new Error("approval dependency");
        }
        if (current.expiresAt !== record.expiresAt) {
          throw new Error("approval dependency");
        }
        if (!sameApprovalBinding(current, record)) {
          throw new Error("approval dependency");
        }
        if (!canTransition(current.status, record.status)) {
          throw new Error("approval dependency");
        }
        if (current.status === record.status) {
          return current;
        }
        const updated = await query(UPDATE_STATUS_SQL, [
          record.status,
          record.id,
          record.requestId,
        ]);
        const saved = toApproval(updated.rows[0]);
        if (saved === null) {
          throw new Error("approval replace missed");
        }
        if (saved.status !== record.status) {
          throw new Error("approval replace missed");
        }
        if ((updated.rowCount ?? 0) !== 1) {
          throw new Error("approval replace missed");
        }
        return saved;
      });
    } catch {
      return dependencyFailure();
    }
  }

  async findByRequestId(requestId: unknown): Promise<unknown> {
    if (typeof requestId !== "string") {
      return null;
    }
    return this.#findOne(SELECT_BY_REQUEST, [requestId]);
  }

  async findById(id: unknown): Promise<unknown> {
    if (typeof id !== "string") {
      return null;
    }
    return this.#findOne(SELECT_BY_ID, [id]);
  }

  async values(): Promise<readonly unknown[]> {
    const client = await this.#pool.connect();
    try {
      const found = await client.query(SELECT_ALL, []);
      const records: unknown[] = [];
      for (const row of found.rows) {
        records.push(toApproval(row) ?? row);
      }
      return records;
    } finally {
      client.release();
    }
  }

  async #findOne(sql: string, params: readonly unknown[]): Promise<unknown> {
    try {
      const client = await this.#pool.connect();
      try {
        const found = await client.query(sql, params);
        return toApproval(found.rows[0]);
      } finally {
        client.release();
      }
    } catch {
      return null;
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
        // The caller still receives the original dependency or conflict result.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

export const applyApprovalSchema = async (pool: SqlPool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(APPROVAL_SCHEMA_SQL, []);
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

const insertParams = (record: ApprovalRecord): readonly unknown[] => [
  record.id,
  record.requestId,
  record.fromAgentId,
  record.toAgentId,
  record.skillVersion,
  record.purpose,
  record.scope,
  record.start,
  record.end,
  record.policyVersion,
  record.status,
  record.expiresAt,
];

const decideInsert = (record: ApprovalRecord, rows: readonly unknown[]): InsertDecision => {
  for (const row of rows) {
    if (textAt(row, "approval_id") === record.id) {
      return { type: "dependency" };
    }
  }
  for (const row of rows) {
    if (textAt(row, "request_id") !== record.requestId) {
      continue;
    }
    const current = toApproval(row);
    if (current === null) {
      return { type: "dependency" };
    }
    if (!sameApprovalBinding(current, record)) {
      return { type: "conflict" };
    }
    return { type: "existing", row: current };
  }
  return { type: "insert" };
};

const canTransition = (from: ApprovalStatus, to: ApprovalStatus): boolean =>
  from === to || TRANSITIONS[from].includes(to);

const isRow = (row: unknown): row is Record<string, unknown> => {
  if (typeof row !== "object" || row === null) {
    return false;
  }
  return !Array.isArray(row);
};

const textAt = (row: unknown, key: string): string | null => {
  if (!isRow(row)) {
    return null;
  }
  const value = row[key];
  return typeof value === "string" ? value : null;
};

const toApproval = (row: unknown): ApprovalRecord | null => {
  if (!isRow(row)) {
    return null;
  }
  const mapped = Object.freeze({
    id: row.approval_id,
    requestId: row.request_id,
    fromAgentId: row.from_agent_id,
    toAgentId: row.to_agent_id,
    skillVersion: row.skill_version,
    purpose: row.purpose,
    scope: row.scope,
    start: row.start_at,
    end: row.end_at,
    policyVersion: row.policy_version,
    status: row.status,
    expiresAt: row.expires_at,
  });
  return isApproval(mapped) ? mapped : null;
};
