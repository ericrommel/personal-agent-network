import { Pool } from "pg";
import type { SkillAdvertisementError, SkillAdvertisementEvent } from "./contracts.js";
import {
  advertisementKey,
  isSkillAdvertisement,
  isSkillAdvertisementId,
  type SkillAdvertisement,
} from "./domain/skill-advertisement.js";
import type { SkillAdvertisementEventSink, SkillAdvertisementStorePort } from "./ports.js";

const dependencyFailure = (): SkillAdvertisementError =>
  Object.freeze({ code: "SKILL_ADVERTISEMENT_DEPENDENCY_FAILED" });

const conflict = (): SkillAdvertisementError =>
  Object.freeze({ code: "SKILL_ADVERTISEMENT_CONFLICT" });

const notFound = (): SkillAdvertisementError =>
  Object.freeze({ code: "SKILL_ADVERTISEMENT_NOT_FOUND" });

/**
 * One row per agent and pinned skill version. A committed row survives process restart.
 * The table stores no kind, permission, profile, calendar, secret, or event. `kind` is
 * rebuilt on read. An advertisement grants nothing. A failed sink rolls back an insert
 * and does not undo a committed withdrawal. The method names differ from
 * SkillAdvertisementStorePort. Sharing those names would make this class
 * assignable to the port, and the synchronous service would commit a row
 * while reporting failure. SkillAdvertisementService is not wired to this class.
 */
export const SKILL_ADVERTISEMENT_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS skill_advertisement_records (
  pair_key text PRIMARY KEY,
  advertisement_id text NOT NULL,
  agent_id text NOT NULL,
  skill_version text NOT NULL,
  status text NOT NULL,
  CONSTRAINT skill_advertisement_records_status CHECK (status IN ('advertised', 'withdrawn')),
  CONSTRAINT skill_advertisement_records_pair CHECK (pair_key = agent_id || '>' || skill_version)
)`;

const INSERT_ADVERTISED_SQL = `INSERT INTO skill_advertisement_records (
  pair_key, advertisement_id, agent_id, skill_version, status
) VALUES ($1, $2, $3, $4, 'advertised')
ON CONFLICT (pair_key) DO UPDATE
  SET advertisement_id = EXCLUDED.advertisement_id,
      status = 'advertised'
  WHERE skill_advertisement_records.status = 'withdrawn'
RETURNING advertisement_id`;

const WITHDRAW_SQL = `UPDATE skill_advertisement_records
SET status = 'withdrawn'
WHERE pair_key = $1 AND advertisement_id = $2
RETURNING advertisement_id, agent_id, skill_version, status`;

const FIND_SQL = `SELECT advertisement_id, agent_id, skill_version, status
FROM skill_advertisement_records
WHERE pair_key = $1`;

type SqlQueryResult = Readonly<{
  rows: readonly unknown[];
  rowCount: number | null;
}>;

type SqlQuery = (sql: string, params: readonly unknown[]) => Promise<SqlQueryResult>;

type SqlClient = Readonly<{
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
    super("SKILL_ADVERTISEMENT_CONFLICT");
    this.name = "StoredConflict";
  }
}

class StoredNotFound extends Error {
  constructor() {
    super("SKILL_ADVERTISEMENT_NOT_FOUND");
    this.name = "StoredNotFound";
  }
}

export class PostgresSkillAdvertisementStore {
  readonly #events: SkillAdvertisementEventSink;
  readonly #pool: SqlPool;

  constructor(pool: SqlPool, events: SkillAdvertisementEventSink) {
    this.#pool = pool;
    this.#events = events;
  }

  async insertDurableAdvertisement(
    record: SkillAdvertisement,
    event: SkillAdvertisementEvent,
  ): Promise<unknown> {
    if (!isSkillAdvertisement(record) || record.status !== "advertised") {
      return dependencyFailure();
    }
    const pairKey = advertisementKey(record.agentId, record.skillVersion);
    try {
      await this.#transaction(async (query) => {
        const inserted = await query(INSERT_ADVERTISED_SQL, [
          pairKey,
          record.id,
          record.agentId,
          record.skillVersion,
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

  async withdrawDurableAdvertisement(
    agentId: unknown,
    skillVersion: unknown,
    advertisementId: unknown,
    event: SkillAdvertisementEvent,
  ): Promise<unknown> {
    const pairKey = advertisementKey(agentId, skillVersion);
    if (pairKey === null || !isSkillAdvertisementId(advertisementId)) {
      return notFound();
    }
    let withdrawn: SkillAdvertisement;
    try {
      withdrawn = await this.#transaction(async (query) => {
        const updated = await query(WITHDRAW_SQL, [pairKey, advertisementId]);
        const row = toSkillAdvertisement(updated.rows[0]);
        if (row === null || row.status !== "withdrawn" || row.id !== advertisementId) {
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
      return withdrawn;
    }
    return withdrawn;
  }

  async findDurableAdvertisement(agentId: unknown, skillVersion: unknown): Promise<unknown> {
    const pairKey = advertisementKey(agentId, skillVersion);
    if (pairKey === null) {
      return null;
    }
    try {
      const client = await this.#pool.connect();
      try {
        const found = await client.query(FIND_SQL, [pairKey]);
        return toSkillAdvertisement(found.rows[0]);
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

export const applySkillAdvertisementSchema = async (pool: SqlPool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(SKILL_ADVERTISEMENT_SCHEMA_SQL, []);
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

const toSkillAdvertisement = (row: unknown): SkillAdvertisement | null => {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return null;
  }
  const record = row as Record<string, unknown>;
  const mapped = Object.freeze({
    kind: "skill-advertisement",
    id: record.advertisement_id,
    agentId: record.agent_id,
    skillVersion: record.skill_version,
    status: record.status,
  });
  return isSkillAdvertisement(mapped) ? mapped : null;
};

type _NotSyncAdvertisementPort = PostgresSkillAdvertisementStore extends SkillAdvertisementStorePort
  ? never
  : true;

const _notSyncAdvertisementPort: _NotSyncAdvertisementPort = true;
void _notSyncAdvertisementPort;
