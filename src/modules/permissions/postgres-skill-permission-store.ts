import { Pool } from "pg";
import type { SkillPermissionError, SkillPermissionEvent } from "./contracts.js";
import {
  isSkillPermission,
  isSkillPermissionId,
  permissionKey,
  type SkillPermission,
} from "./domain/skill-permission.js";
import type { SkillPermissionEventSink, SkillPermissionStorePort } from "./ports.js";

const dependencyFailure = (): SkillPermissionError =>
  Object.freeze({ code: "SKILL_PERMISSION_DEPENDENCY_FAILED" });

const conflict = (): SkillPermissionError => Object.freeze({ code: "SKILL_PERMISSION_CONFLICT" });

const notFound = (): SkillPermissionError => Object.freeze({ code: "SKILL_PERMISSION_NOT_FOUND" });

/**
 * One row per directed agent pair. A committed row survives process restart.
 * The table stores the permission effect because that effect is the only
 * ALLOW/ASK/DENY source. It stores no kind, email, profile, calendar, boolean,
 * secret, or event. `kind` is rebuilt on read. A failed sink rolls back an
 * insert and does not undo a committed revoke. The method names differ from
 * SkillPermissionStorePort. Sharing those names would make this class
 * assignable to the port, and the synchronous service would commit a revoke
 * without calling invalidateUnreleased. SkillPermissionService is not wired here.
 */
export const SKILL_PERMISSION_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS skill_permission_records (
  pair_key text PRIMARY KEY,
  permission_id text NOT NULL,
  from_agent_id text NOT NULL,
  to_agent_id text NOT NULL,
  skill_version text NOT NULL,
  purpose text NOT NULL,
  scope text NOT NULL,
  effect text NOT NULL,
  status text NOT NULL,
  CONSTRAINT skill_permission_records_effect CHECK (effect IN ('ALLOW', 'ASK', 'DENY')),
  CONSTRAINT skill_permission_records_status CHECK (status IN ('active', 'revoked')),
  CONSTRAINT skill_permission_records_pair CHECK (pair_key = from_agent_id || '>' || to_agent_id)
)`;

const INSERT_ACTIVE_SQL = `INSERT INTO skill_permission_records (
  pair_key, permission_id, from_agent_id, to_agent_id, skill_version, purpose, scope, effect, status
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
ON CONFLICT (pair_key) DO UPDATE
  SET permission_id = EXCLUDED.permission_id,
      skill_version = EXCLUDED.skill_version,
      purpose = EXCLUDED.purpose,
      scope = EXCLUDED.scope,
      effect = EXCLUDED.effect,
      status = 'active'
  WHERE skill_permission_records.status = 'revoked'
RETURNING permission_id`;

const REVOKE_SQL = `UPDATE skill_permission_records
SET status = 'revoked'
WHERE pair_key = $1 AND permission_id = $2
RETURNING permission_id, from_agent_id, to_agent_id, skill_version, purpose, scope, effect, status`;

const FIND_SQL = `SELECT permission_id, from_agent_id, to_agent_id, skill_version, purpose, scope, effect, status
FROM skill_permission_records
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
    super("SKILL_PERMISSION_CONFLICT");
    this.name = "StoredConflict";
  }
}

class StoredNotFound extends Error {
  constructor() {
    super("SKILL_PERMISSION_NOT_FOUND");
    this.name = "StoredNotFound";
  }
}

export class PostgresSkillPermissionStore {
  readonly #events: SkillPermissionEventSink;
  readonly #pool: SqlPool;

  constructor(pool: SqlPool, events: SkillPermissionEventSink) {
    this.#pool = pool;
    this.#events = events;
  }

  async insertDurablePermission(
    record: SkillPermission,
    event: SkillPermissionEvent,
  ): Promise<unknown> {
    if (!isSkillPermission(record) || record.status !== "active") {
      return dependencyFailure();
    }
    const pairKey = permissionKey(record.fromAgentId, record.toAgentId);
    try {
      await this.#transaction(async (query) => {
        const inserted = await query(INSERT_ACTIVE_SQL, [
          pairKey,
          record.id,
          record.fromAgentId,
          record.toAgentId,
          record.skillVersion,
          record.purpose,
          record.scope,
          record.effect,
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

  async revokeDurablePermission(
    fromAgentId: unknown,
    toAgentId: unknown,
    permissionId: unknown,
    event: SkillPermissionEvent,
  ): Promise<unknown> {
    const pairKey = permissionKey(fromAgentId, toAgentId);
    if (pairKey === null || !isSkillPermissionId(permissionId)) {
      return notFound();
    }
    let revoked: SkillPermission;
    try {
      revoked = await this.#transaction(async (query) => {
        const updated = await query(REVOKE_SQL, [pairKey, permissionId]);
        const row = toSkillPermission(updated.rows[0]);
        if (row === null || row.status !== "revoked" || row.id !== permissionId) {
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

  async findDurablePermission(fromAgentId: unknown, toAgentId: unknown): Promise<unknown> {
    const pairKey = permissionKey(fromAgentId, toAgentId);
    if (pairKey === null) {
      return null;
    }
    try {
      const client = await this.#pool.connect();
      try {
        const found = await client.query(FIND_SQL, [pairKey]);
        return toSkillPermission(found.rows[0]);
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

export const applySkillPermissionSchema = async (pool: SqlPool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(SKILL_PERMISSION_SCHEMA_SQL, []);
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

const toSkillPermission = (row: unknown): SkillPermission | null => {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return null;
  }
  const record = row as Record<string, unknown>;
  const mapped = Object.freeze({
    kind: "skill-permission",
    id: record.permission_id,
    fromAgentId: record.from_agent_id,
    toAgentId: record.to_agent_id,
    skillVersion: record.skill_version,
    purpose: record.purpose,
    scope: record.scope,
    effect: record.effect,
    status: record.status,
  });
  return isSkillPermission(mapped) ? mapped : null;
};

type _NotSyncPermissionPort = PostgresSkillPermissionStore extends SkillPermissionStorePort
  ? never
  : true;

const _notSyncPermissionPort: _NotSyncPermissionPort = true;
void _notSyncPermissionPort;
