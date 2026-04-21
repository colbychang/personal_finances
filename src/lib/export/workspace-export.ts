import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import { db } from "@/db/index";
import * as schema from "@/db/schema";

export const WORKSPACE_EXPORT_SCHEMA_VERSION = 1;

function ids<T extends { id: number }>(rows: T[]) {
  return rows.map((row) => row.id);
}

function getFilenamePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function buildWorkspaceExportFilename(workspaceName: string, exportedAt: string) {
  const date = exportedAt.slice(0, 10);
  const workspace = getFilenamePart(workspaceName) || "workspace";
  return `glacier-${workspace}-backup-${date}.json`;
}

export async function buildWorkspaceExport(
  database: AppDatabase = db,
  workspace: {
    workspaceId: number;
    workspaceName: string;
    workspaceSlug: string;
  },
) {
  const exportedAt = new Date().toISOString();

  const [
    institutions,
    accounts,
    transactions,
    budgets,
    budgetTemplates,
    snapshots,
    merchantRules,
    categories,
    connections,
    accountLinks,
  ] = await Promise.all([
    database.select().from(schema.institutions).where(eq(schema.institutions.workspaceId, workspace.workspaceId)),
    database.select().from(schema.accounts).where(eq(schema.accounts.workspaceId, workspace.workspaceId)),
    database.select().from(schema.transactions).where(eq(schema.transactions.workspaceId, workspace.workspaceId)),
    database.select().from(schema.budgets).where(eq(schema.budgets.workspaceId, workspace.workspaceId)),
    database.select().from(schema.budgetTemplates).where(eq(schema.budgetTemplates.workspaceId, workspace.workspaceId)),
    database.select().from(schema.snapshots).where(eq(schema.snapshots.workspaceId, workspace.workspaceId)),
    database.select().from(schema.merchantRules).where(eq(schema.merchantRules.workspaceId, workspace.workspaceId)),
    database
      .select()
      .from(schema.categories)
      .where(
        or(
          eq(schema.categories.workspaceId, workspace.workspaceId),
          and(
            isNull(schema.categories.workspaceId),
            eq(schema.categories.isPredefined, true),
          ),
        ),
      ),
    database
      .select({
        id: schema.connections.id,
        workspaceId: schema.connections.workspaceId,
        institutionName: schema.connections.institutionName,
        provider: schema.connections.provider,
        itemId: schema.connections.itemId,
        createdAt: schema.connections.createdAt,
        transactionsCursor: schema.connections.transactionsCursor,
        isEncrypted: schema.connections.isEncrypted,
        lastSyncAt: schema.connections.lastSyncAt,
        lastSyncStatus: schema.connections.lastSyncStatus,
        lastSyncError: schema.connections.lastSyncError,
      })
      .from(schema.connections)
      .where(eq(schema.connections.workspaceId, workspace.workspaceId)),
    database.select().from(schema.accountLinks).where(eq(schema.accountLinks.workspaceId, workspace.workspaceId)),
  ]);

  const accountIds = ids(accounts);
  const transactionIds = ids(transactions);

  const accountSnapshots =
    accountIds.length === 0
      ? []
      : await database
          .select()
          .from(schema.accountSnapshots)
          .where(inArray(schema.accountSnapshots.accountId, accountIds));

  const transactionSplits =
    transactionIds.length === 0
      ? []
      : await database
          .select()
          .from(schema.transactionSplits)
          .where(inArray(schema.transactionSplits.transactionId, transactionIds));

  return {
    schemaVersion: WORKSPACE_EXPORT_SCHEMA_VERSION,
    exportedAt,
    workspace: {
      id: workspace.workspaceId,
      name: workspace.workspaceName,
      slug: workspace.workspaceSlug,
    },
    data: {
      institutions,
      accounts,
      accountSnapshots,
      accountLinks,
      transactions,
      transactionSplits,
      budgets,
      budgetTemplates,
      snapshots,
      merchantRules,
      categories,
      connections,
    },
  };
}
