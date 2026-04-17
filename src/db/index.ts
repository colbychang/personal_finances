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
const defaultPoolMax = isSupabasePooler ? "1" : "1";
const maxConnections = Math.max(
  1,
  Number.parseInt(process.env.DATABASE_POOL_MAX ?? defaultPoolMax, 10) || 1,
);

export const sqlClient = connectionString
  ? postgres(connectionString, {
      prepare: false,
      max: maxConnections,
      idle_timeout: 20,
      connect_timeout: 10,
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
