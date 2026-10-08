import { Pool } from "pg";
import type { ReplayDecision, ReplayStore } from "./replay-store.js";

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * One row per envelope message id. The table stores that id and nothing else.
 * A committed row survives process restart. The node does not construct this class
 * and does not open a pool. The in-memory store remains the unit adapter.
 */
export const REPLAY_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS replay_message_records (
  message_id text PRIMARY KEY
)`;

const INSERT_SQL = `INSERT INTO replay_message_records (message_id)
VALUES ($1)
RETURNING message_id`;

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

export class PostgresReplayStore implements ReplayStore {
  readonly #pool: SqlPool;

  constructor(pool: SqlPool) {
    this.#pool = pool;
  }

  async remember(messageId: string): Promise<ReplayDecision> {
    if (!isToken(messageId)) {
      return "duplicate";
    }
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN", []);
      const inserted = await client.query(INSERT_SQL, [messageId]);
      if (!insertedMessage(inserted, messageId)) {
        throw new Error("replay insert missed");
      }
      await client.query("COMMIT", []);
      return "accepted";
    } catch (error) {
      try {
        await client.query("ROLLBACK", []);
      } catch {
        // The original insert result still decides.
      }
      if (uniqueViolation(error)) {
        return "duplicate";
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

/** Retries only the PostgreSQL row-type race. Any other failure is immediate. */
export const applyReplaySchema = async (pool: SqlPool): Promise<void> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await querySchema(pool);
      return;
    } catch (error) {
      if (attempt === 4 || !schemaRace(error)) {
        throw error;
      }
      await delay(25 * (attempt + 1));
    }
  }
};

const querySchema = async (pool: SqlPool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(REPLAY_SCHEMA_SQL, []);
  } finally {
    client.release();
  }
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const schemaRace = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const record = error as { code?: unknown; message?: unknown };
  return (
    record.code === "23505" ||
    (typeof record.message === "string" && record.message.includes("pg_type_typname_nsp_index"))
  );
};

const uniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";

const isToken = (value: unknown): value is string => typeof value === "string" && TOKEN.test(value);

const insertedMessage = (result: SqlQueryResult, messageId: string): boolean =>
  (result.rowCount ?? 0) === 1 && savedId(result.rows[0]) === messageId;

const savedId = (row: unknown): string | null => {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return null;
  }
  const id = (row as Record<string, unknown>).message_id;
  return typeof id === "string" ? id : null;
};

/** Local node-postgres pool. TLS is not forced; the URL decides. The node does not call this. */
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
