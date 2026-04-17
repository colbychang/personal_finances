import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

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

export const sqlClient = connectionString
  ? postgres(connectionString, {
      prepare: false,
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
