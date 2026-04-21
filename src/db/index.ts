import dotenv from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

dotenv.config({ path: ".env.local" });
dotenv.config();

export type AppDatabase = PgDatabase<any, typeof schema>;

function createDatabaseUnavailableProxy(): AppDatabase {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(
          "Database is not configured. Set DATABASE_URL to your Supabase Postgres connection string.",
        );
      },
    },
  ) as AppDatabase;
}

const connectionString = process.env.DATABASE_URL;
const isSupabasePooler = connectionString?.includes(".pooler.supabase.com") ?? false;
const defaultPoolMax = isSupabasePooler ? "5" : "2";
const maxConnections = Math.max(
  1,
  Number.parseInt(process.env.DATABASE_POOL_MAX ?? defaultPoolMax, 10) || 1,
);
const statementTimeoutMs = Math.max(
  1_000,
  Number.parseInt(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? (isSupabasePooler ? "15000" : "30000"), 10)
    || (isSupabasePooler ? 15_000 : 30_000),
);
const lockTimeoutMs = Math.max(
  1_000,
  Number.parseInt(process.env.DATABASE_LOCK_TIMEOUT_MS ?? "5000", 10) || 5_000,
);

export const sqlClient = connectionString
  ? postgres(connectionString, {
      prepare: false,
      max: maxConnections,
      idle_timeout: 20,
      connect_timeout: 10,
      connection: {
        statement_timeout: statementTimeoutMs,
        lock_timeout: lockTimeoutMs,
      },
    })
  : null;

export const db: AppDatabase = sqlClient
  ? drizzle(sqlClient, { schema })
  : createDatabaseUnavailableProxy();

export async function closeDatabaseConnection(): Promise<void> {
  if (!sqlClient) {
    return;
  }

  await sqlClient.end({ timeout: 1 });
}
