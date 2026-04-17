import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./index";

/**
 * Run all pending Drizzle migrations.
 */
export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: "./drizzle-postgres" });
}
