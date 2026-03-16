import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DB_PATH = process.env.DATABASE_URL ?? "./finance.db";

const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL");

// Enable foreign key constraint enforcement
sqlite.pragma("foreign_keys = ON");

export const db = drizzle({ client: sqlite, schema });
export { sqlite };
