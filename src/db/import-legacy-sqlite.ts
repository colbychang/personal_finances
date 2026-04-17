import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { count, eq, sql } from "drizzle-orm";
import { db, closeDatabaseConnection } from "@/db/index";
import * as schema from "@/db/schema";
import * as legacySchema from "@/db/legacy-sqlite-schema";
import { ensurePersonalWorkspaceForAuthUser } from "@/db/queries/workspaces";

type Args = {
  sqlitePath: string;
  workspaceId?: number;
  authUserId?: string;
  email?: string;
  force: boolean;
};

const SERIAL_TABLES = [
  "workspaces",
  "workspace_members",
  "institutions",
  "accounts",
  "transactions",
  "budgets",
  "budget_templates",
  "snapshots",
  "connections",
  "merchant_rules",
  "account_snapshots",
  "account_links",
  "transaction_splits",
  "categories",
] as const;

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const parsed: Args = {
    sqlitePath: process.env.LEGACY_SQLITE_PATH ?? "./finance.db",
    workspaceId: process.env.LEGACY_IMPORT_WORKSPACE_ID
      ? Number(process.env.LEGACY_IMPORT_WORKSPACE_ID)
      : undefined,
    authUserId: process.env.LEGACY_IMPORT_AUTH_USER_ID,
    email: process.env.LEGACY_IMPORT_EMAIL,
    force: process.env.LEGACY_IMPORT_FORCE === "1",
  };

  for (const arg of args) {
    if (arg.startsWith("--sqlite=")) {
      parsed.sqlitePath = arg.slice("--sqlite=".length);
    } else if (arg.startsWith("--workspace-id=")) {
      parsed.workspaceId = Number(arg.slice("--workspace-id=".length));
    } else if (arg.startsWith("--auth-user-id=")) {
      parsed.authUserId = arg.slice("--auth-user-id=".length);
    } else if (arg.startsWith("--email=")) {
      parsed.email = arg.slice("--email=".length);
    } else if (arg === "--force") {
      parsed.force = true;
    }
  }

  if (parsed.workspaceId !== undefined && Number.isNaN(parsed.workspaceId)) {
    throw new Error("workspaceId must be a number");
  }

  return parsed;
}

async function resolveTargetWorkspaceId(args: Args) {
  if (args.workspaceId) {
    const existing = await db
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, args.workspaceId))
      .limit(1);

    if (!existing[0]) {
      throw new Error(
        `Workspace ${args.workspaceId} does not exist in Postgres. Sign in first or provide a valid workspace id.`,
      );
    }

    return args.workspaceId;
  }

  if (!args.authUserId || !args.email) {
    throw new Error(
      "Provide either --workspace-id=<id> or both --auth-user-id=<supabase user id> and --email=<email>.",
    );
  }

  const membership = await ensurePersonalWorkspaceForAuthUser(
    db,
    args.authUserId,
    args.email,
  );
  return membership.workspaceId;
}

async function ensureWorkspaceIsImportable(workspaceId: number, force: boolean) {
  const checks = await Promise.all([
    db.select({ value: count() }).from(schema.institutions).where(eq(schema.institutions.workspaceId, workspaceId)),
    db.select({ value: count() }).from(schema.accounts).where(eq(schema.accounts.workspaceId, workspaceId)),
    db.select({ value: count() }).from(schema.transactions).where(eq(schema.transactions.workspaceId, workspaceId)),
    db.select({ value: count() }).from(schema.budgets).where(eq(schema.budgets.workspaceId, workspaceId)),
    db.select({ value: count() }).from(schema.budgetTemplates).where(eq(schema.budgetTemplates.workspaceId, workspaceId)),
    db.select({ value: count() }).from(schema.snapshots).where(eq(schema.snapshots.workspaceId, workspaceId)),
    db.select({ value: count() }).from(schema.connections).where(eq(schema.connections.workspaceId, workspaceId)),
    db.select({ value: count() }).from(schema.merchantRules).where(eq(schema.merchantRules.workspaceId, workspaceId)),
    db.select({ value: count() }).from(schema.accountLinks).where(eq(schema.accountLinks.workspaceId, workspaceId)),
  ]);

  const existingRows = checks.reduce((sum, rows) => sum + Number(rows[0]?.value ?? 0), 0);

  if (existingRows > 0 && !force) {
    throw new Error(
      `Workspace ${workspaceId} already has imported finance data. Re-run with --force if you want to merge into a non-empty workspace.`,
    );
  }
}

async function insertInChunks<T>(rows: T[], insertChunk: (chunk: T[]) => Promise<void>) {
  const chunkSize = 250;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    if (chunk.length > 0) {
      await insertChunk(chunk);
    }
  }
}

async function resetSequence(tableName: string) {
  await db.execute(
    sql.raw(`
      SELECT setval(
        pg_get_serial_sequence('${tableName}', 'id'),
        COALESCE((SELECT MAX(id) FROM "${tableName}"), 1),
        COALESCE((SELECT MAX(id) IS NOT NULL FROM "${tableName}"), false)
      )
    `),
  );
}

async function main() {
  const args = parseArgs();
  const workspaceId = await resolveTargetWorkspaceId(args);
  await ensureWorkspaceIsImportable(workspaceId, args.force);

  const sqlite = new Database(args.sqlitePath, { readonly: true });
  const legacyDb = drizzleSqlite({ client: sqlite, schema: legacySchema });

  try {
    const legacyCategories = legacyDb.select().from(legacySchema.categories).all();
    const legacyInstitutions = legacyDb.select().from(legacySchema.institutions).all();
    const legacyConnections = legacyDb.select().from(legacySchema.connections).all();
    const legacyAccounts = legacyDb.select().from(legacySchema.accounts).all();
    const legacyTransactions = legacyDb.select().from(legacySchema.transactions).all();
    const legacyBudgets = legacyDb.select().from(legacySchema.budgets).all();
    const legacyBudgetTemplates = legacyDb.select().from(legacySchema.budgetTemplates).all();
    const legacySnapshots = legacyDb.select().from(legacySchema.snapshots).all();
    const legacyMerchantRules = legacyDb.select().from(legacySchema.merchantRules).all();
    const legacyAccountSnapshots = legacyDb.select().from(legacySchema.accountSnapshots).all();
    const legacyAccountLinks = legacyDb.select().from(legacySchema.accountLinks).all();
    const legacyTransactionSplits = legacyDb.select().from(legacySchema.transactionSplits).all();

    if (legacyCategories.length > 0) {
      await insertInChunks(legacyCategories, async (chunk) => {
        await db
          .insert(schema.categories)
          .values(
            chunk.map((row) => ({
              id: row.id,
              name: row.name,
              color: row.color,
              icon: row.icon,
              isPredefined: row.isPredefined,
              sortOrder: row.sortOrder,
            })),
          )
          .onConflictDoUpdate({
            target: schema.categories.name,
            set: {
              color: sql`excluded.color`,
              icon: sql`excluded.icon`,
              isPredefined: sql`excluded.is_predefined`,
              sortOrder: sql`excluded.sort_order`,
            },
          });
      });
    }

    if (legacyInstitutions.length > 0) {
      await insertInChunks(legacyInstitutions, async (chunk) => {
        await db.insert(schema.institutions).values(
          chunk.map((row) => ({
            id: row.id,
            workspaceId,
            name: row.name,
            provider: row.provider,
            status: row.status,
            plaidInstitutionId: row.plaidInstitutionId,
            lastSyncAt: row.lastSyncAt,
          })),
        );
      });
    }

    if (legacyConnections.length > 0) {
      await insertInChunks(legacyConnections, async (chunk) => {
        await db.insert(schema.connections).values(
          chunk.map((row) => ({
            id: row.id,
            workspaceId,
            institutionName: row.institutionName,
            provider: row.provider,
            accessToken: row.accessToken,
            itemId: row.itemId,
            createdAt: row.createdAt,
            transactionsCursor: row.transactionsCursor,
            isEncrypted: row.isEncrypted,
            lastSyncAt: row.lastSyncAt,
            lastSyncStatus: row.lastSyncStatus,
            lastSyncError: row.lastSyncError,
          })),
        );
      });
    }

    if (legacyAccounts.length > 0) {
      await insertInChunks(legacyAccounts, async (chunk) => {
        await db.insert(schema.accounts).values(
          chunk.map((row) => ({
            id: row.id,
            workspaceId,
            institutionId: row.institutionId,
            externalRef: row.externalRef,
            name: row.name,
            mask: row.mask,
            type: row.type,
            subtype: row.subtype,
            balanceCurrent: row.balanceCurrent,
            balanceAvailable: row.balanceAvailable,
            isAsset: row.isAsset,
            currency: row.currency,
            source: row.source,
          })),
        );
      });
    }

    if (legacyTransactions.length > 0) {
      await insertInChunks(legacyTransactions, async (chunk) => {
        await db.insert(schema.transactions).values(
          chunk.map((row) => ({
            id: row.id,
            workspaceId,
            accountId: row.accountId,
            externalId: row.externalId,
            postedAt: row.postedAt,
            overrideMonth: row.overrideMonth,
            name: row.name,
            merchant: row.merchant,
            amount: row.amount,
            category: row.category,
            pending: row.pending,
            notes: row.notes,
            categoryOverride: row.categoryOverride,
            isTransfer: row.isTransfer,
            isExcluded: row.isExcluded,
            reviewState: row.reviewState,
          })),
        );
      });
    }

    if (legacyBudgets.length > 0) {
      await insertInChunks(legacyBudgets, async (chunk) => {
        await db.insert(schema.budgets).values(
          chunk.map((row) => ({
            id: row.id,
            workspaceId,
            month: row.month,
            category: row.category,
            amount: row.amount,
          })),
        );
      });
    }

    if (legacyBudgetTemplates.length > 0) {
      await insertInChunks(legacyBudgetTemplates, async (chunk) => {
        await db.insert(schema.budgetTemplates).values(
          chunk.map((row) => ({
            id: row.id,
            workspaceId,
            category: row.category,
            amount: row.amount,
            updatedAt: row.updatedAt,
          })),
        );
      });
    }

    if (legacySnapshots.length > 0) {
      await insertInChunks(legacySnapshots, async (chunk) => {
        await db.insert(schema.snapshots).values(
          chunk.map((row) => ({
            id: row.id,
            workspaceId,
            month: row.month,
            assets: row.assets,
            liabilities: row.liabilities,
            netWorth: row.netWorth,
          })),
        );
      });
    }

    if (legacyMerchantRules.length > 0) {
      await insertInChunks(legacyMerchantRules, async (chunk) => {
        await db.insert(schema.merchantRules).values(
          chunk.map((row) => ({
            id: row.id,
            workspaceId,
            merchantKey: row.merchantKey,
            label: row.label,
            category: row.category,
            isTransfer: row.isTransfer,
            updatedAt: row.updatedAt,
          })),
        );
      });
    }

    if (legacyAccountSnapshots.length > 0) {
      await insertInChunks(legacyAccountSnapshots, async (chunk) => {
        await db.insert(schema.accountSnapshots).values(
          chunk.map((row) => ({
            id: row.id,
            accountId: row.accountId,
            day: row.day,
            capturedAt: row.capturedAt,
            balanceCurrent: row.balanceCurrent,
            isAsset: row.isAsset,
          })),
        );
      });
    }

    if (legacyAccountLinks.length > 0) {
      await insertInChunks(legacyAccountLinks, async (chunk) => {
        await db.insert(schema.accountLinks).values(
          chunk.map((row) => ({
            id: row.id,
            workspaceId,
            provider: row.provider,
            externalKey: row.externalKey,
            connectionId: row.connectionId,
            accountId: row.accountId,
            institutionName: row.institutionName,
            displayName: row.displayName,
            updatedAt: row.updatedAt,
          })),
        );
      });
    }

    if (legacyTransactionSplits.length > 0) {
      await insertInChunks(legacyTransactionSplits, async (chunk) => {
        await db.insert(schema.transactionSplits).values(
          chunk.map((row) => ({
            id: row.id,
            transactionId: row.transactionId,
            category: row.category,
            amount: row.amount,
          })),
        );
      });
    }

    for (const tableName of SERIAL_TABLES) {
      await resetSequence(tableName);
    }

    const summary = {
      workspaceId,
      categories: legacyCategories.length,
      institutions: legacyInstitutions.length,
      connections: legacyConnections.length,
      accounts: legacyAccounts.length,
      transactions: legacyTransactions.length,
      budgets: legacyBudgets.length,
      budgetTemplates: legacyBudgetTemplates.length,
      snapshots: legacySnapshots.length,
      merchantRules: legacyMerchantRules.length,
      accountSnapshots: legacyAccountSnapshots.length,
      accountLinks: legacyAccountLinks.length,
      transactionSplits: legacyTransactionSplits.length,
    };

    console.log("Legacy import complete.");
    console.table(summary);
  } finally {
    sqlite.close();
    await closeDatabaseConnection();
  }
}

main().catch(async (error) => {
  console.error("Legacy import failed:", error);
  await closeDatabaseConnection();
  process.exitCode = 1;
});
