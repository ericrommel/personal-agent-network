import { Pool } from "pg";
import type { RelationshipError, RelationshipEvent } from "./contracts.js";
import {
  directedPairKey,
  isRelationship,
  isRelationshipId,
  type Relationship,
} from "./domain/relationship.js";
import type { RelationshipEventSink } from "./ports.js";

const dependencyFailure = (): RelationshipError =>
  Object.freeze({ code: "RELATIONSHIP_DEPENDENCY_FAILED" });

const conflict = (): RelationshipError => Object.freeze({ code: "RELATIONSHIP_CONFLICT" });

const notFound = (): RelationshipError => Object.freeze({ code: "RELATIONSHIP_NOT_FOUND" });

/**
 * One row per ordered pair. The table stores no email, profile, skill, or permission.
 * `kind` is supplied when a row is read back into the domain record.
 */
export const RELATIONSHIP_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS relationship_records (
  pair_key text PRIMARY KEY,
  relationship_id text NOT NULL,
  from_agent_id text NOT NULL,
  to_agent_id text NOT NULL,
  status text NOT NULL,
  CONSTRAINT relationship_records_status CHECK (status IN ('active', 'revoked')),
  CONSTRAINT relationship_records_pair CHECK (pair_key = from_agent_id || '>' || to_agent_id)
)`;

const INSERT_ACTIVE_SQL = `INSERT INTO relationship_records (
  pair_key, relationship_id, from_agent_id, to_agent_id, status
) VALUES ($1, $2, $3, $4, 'active')
ON CONFLICT (pair_key) DO UPDATE
  SET relationship_id = EXCLUDED.relationship_id,
      status = 'active'
  WHERE relationship_records.status = 'revoked'
RETURNING relationship_id`;

const REVOKE_SQL = `UPDATE relationship_records
SET status = 'revoked'
WHERE pair_key = $1 AND relationship_id = $2
RETURNING relationship_id, from_agent_id, to_agent_id, status`;

const FIND_SQL = `SELECT relationship_id, from_agent_id, to_agent_id, status
FROM relationship_records
WHERE pair_key = $1`;

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

class StoredConflict extends Error {
  constructor() {
    super("RELATIONSHIP_CONFLICT");
    this.name = "StoredConflict";
  }
}

class StoredNotFound extends Error {
  constructor() {
    super("RELATIONSHIP_NOT_FOUND");
    this.name = "StoredNotFound";
  }
}

/**
 * Durable relationship rows. Restart does not clear a committed revoke.
 * The minimized event stays with the in-process sink: a failed sink rolls back an insert
 * and does not undo a committed revoke.
 */
export class PostgresRelationshipStore {
  readonly #events: RelationshipEventSink;
  readonly #pool: SqlPool;

  constructor(pool: SqlPool, events: RelationshipEventSink) {
    this.#pool = pool;
    this.#events = events;
  }

  async insertActive(record: Relationship, event: RelationshipEvent): Promise<unknown> {
    if (!isRelationship(record) || record.status !== "active") {
      return dependencyFailure();
    }
    const pairKey = directedPairKey(record.fromAgentId, record.toAgentId);
    try {
      await this.#transaction(async (query) => {
        const inserted = await query(INSERT_ACTIVE_SQL, [
          pairKey,
          record.id,
          record.fromAgentId,
          record.toAgentId,
        ]);
        if ((inserted.rowCount ?? 0) !== 1) {
          throw new StoredConflict();
        }
        this.#events.record(event);
      });
      return record;
    } catch (error) {
      return error instanceof StoredConflict ? conflict() : dependencyFailure();
    }
  }

  async revokeMatching(
    fromAgentId: unknown,
    toAgentId: unknown,
    relationshipId: unknown,
    event: RelationshipEvent,
  ): Promise<unknown> {
    const pairKey = directedPairKey(fromAgentId, toAgentId);
    if (pairKey === null || !isRelationshipId(relationshipId)) {
      return notFound();
    }
    let revoked: Relationship;
    try {
      revoked = await this.#transaction(async (query) => {
        const updated = await query(REVOKE_SQL, [pairKey, relationshipId]);
        const row = toRelationship(updated.rows[0]);
        if (row === null || row.status !== "revoked" || row.id !== relationshipId) {
          throw new StoredNotFound();
        }
        return row;
      });
    } catch (error) {
      return error instanceof StoredNotFound ? notFound() : dependencyFailure();
    }
    try {
      this.#events.record(event);
    } catch {
      return revoked;
    }
    return revoked;
  }

  async findByDirectedPair(fromAgentId: unknown, toAgentId: unknown): Promise<Relationship | null> {
    const pairKey = directedPairKey(fromAgentId, toAgentId);
    if (pairKey === null) {
      return null;
    }
    try {
      const client = await this.#pool.connect();
      try {
        const found = await client.query(FIND_SQL, [pairKey]);
        return toRelationship(found.rows[0]);
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

export const applyRelationshipSchema = async (pool: SqlPool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(RELATIONSHIP_SCHEMA_SQL, []);
  } finally {
    client.release();
  }
};

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

const toRelationship = (row: unknown): Relationship | null => {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return null;
  }
  const record = row as Record<string, unknown>;
  const mapped = Object.freeze({
    kind: "relationship",
    id: record.relationship_id,
    fromAgentId: record.from_agent_id,
    toAgentId: record.to_agent_id,
    status: record.status,
  });
  return isRelationship(mapped) ? mapped : null;
};
