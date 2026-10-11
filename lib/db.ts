import "server-only";
import postgres from "postgres";

const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

/**
 * Shared Postgres connection pool. `prepare: false` keeps it compatible with
 * the connection poolers Neon and Supabase put in front of serverless apps.
 */
export const sql =
  globalForDb.sql ??
  (globalForDb.sql = postgres(process.env.DATABASE_URL ?? "", {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    prepare: false,
    onnotice: () => {},
  }));

/** Advisory lock ids, so only one request at a time refreshes tokens, syncs from Xero or sends alerts. */
export const LOCKS = { xeroTokens: 7301, alertRun: 7302, xeroSync: 7303 } as const;
