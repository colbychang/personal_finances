import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index";

/**
 * Run all pending Drizzle migrations.
 */
export function runMigrations(): void {
  migrate(db, { migrationsFolder: "./drizzle" });
}
