import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "@/db/schema";

const RESET_TABLES = [
  "transaction_splits",
  "account_snapshots",
  "account_links",
  "transactions",
  "accounts",
  "connections",
  "institutions",
  "merchant_rules",
  "budget_templates",
  "budgets",
  "snapshots",
  "workspace_members",
  "categories",
  "workspaces",
] as const;

export interface TestDb {
  client: PGlite;
  db: AppDatabase;
}

export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  await client.waitReady;

  const db = drizzle({ client, schema }) as AppDatabase;
  await migrate(db, { migrationsFolder: "./drizzle-postgres" });

  return { client, db };
}

export async function resetTestDb(db: AppDatabase) {
  await db.execute(sql.raw(`TRUNCATE TABLE ${RESET_TABLES.join(", ")} RESTART IDENTITY CASCADE`));
}

export async function closeTestDb(testDb: TestDb) {
  await testDb.client.close();
}

export async function seedManualInstitution(
  db: AppDatabase,
  name = "Test Bank",
  workspaceId?: number,
) {
  const [institution] = await db
    .insert(schema.institutions)
    .values({
      workspaceId: workspaceId ?? null,
      name,
      provider: "manual",
      status: "active",
    })
    .returning();

  return institution!;
}

export async function seedWorkspace(
  db: AppDatabase,
  {
    name = "Test Workspace",
    slug = "test-workspace",
  }: {
    name?: string;
    slug?: string;
  } = {},
) {
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({
      name,
      slug,
    })
    .returning();

  return workspace!;
}

export async function seedManualAccount(
  db: AppDatabase,
  {
    institutionId,
    name = "Checking",
    type = "checking",
    balanceCurrent = 500_000,
    isAsset = true,
    workspaceId,
  }: {
    institutionId: number;
    name?: string;
    type?: string;
    balanceCurrent?: number;
    isAsset?: boolean;
    workspaceId?: number;
  },
) {
  const [account] = await db
    .insert(schema.accounts)
    .values({
      workspaceId: workspaceId ?? null,
      institutionId,
      name,
      type,
      balanceCurrent,
      isAsset,
      currency: "USD",
      source: "manual",
    })
    .returning();

  return account!;
}

export async function getInstitutionByName(db: AppDatabase, name: string) {
  const [institution] = await db
    .select()
    .from(schema.institutions)
    .where(eq(schema.institutions.name, name))
    .limit(1);

  return institution ?? null;
}
