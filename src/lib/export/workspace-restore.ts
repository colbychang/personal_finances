import { eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import { db } from "@/db/index";
import * as schema from "@/db/schema";
import { WORKSPACE_EXPORT_SCHEMA_VERSION } from "@/lib/export/workspace-export";

type ExportData = Record<string, unknown[]>;

type WorkspaceBackup = {
  schemaVersion: number;
  exportedAt?: string;
  workspace?: {
    id?: number;
    name?: string;
    slug?: string;
  };
  data: ExportData;
};

type RestoreWorkspace = {
  workspaceId: number;
  workspaceName: string;
  workspaceSlug: string;
};

export type RestorePreview = {
  valid: boolean;
  schemaVersion: number | null;
  exportedAt: string | null;
  sourceWorkspaceName: string | null;
  warnings: string[];
  counts: Record<string, number>;
};

export type RestoreResult = RestorePreview & {
  restoredAt: string;
  targetWorkspace: {
    id: number;
    name: string;
    slug: string;
  };
  restoredCounts: Record<string, number>;
};

const EXPORT_COLLECTIONS = [
  "institutions",
  "accounts",
  "accountSnapshots",
  "accountLinks",
  "transactions",
  "transactionSplits",
  "budgets",
  "budgetTemplates",
  "snapshots",
  "merchantRules",
  "categories",
  "connections",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback: string | null = null) {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function uniqueByName(rows: Record<string, unknown>[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const name = asString(row.name);
    if (!name || seen.has(name)) {
      return false;
    }
    seen.add(name);
    return true;
  });
}

export function parseWorkspaceBackup(payload: unknown): WorkspaceBackup {
  if (!isRecord(payload)) {
    throw new Error("Backup must be a JSON object.");
  }

  if (payload.schemaVersion !== WORKSPACE_EXPORT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported backup schema version. Expected ${WORKSPACE_EXPORT_SCHEMA_VERSION}.`,
    );
  }

  if (!isRecord(payload.data)) {
    throw new Error("Backup is missing its data section.");
  }

  const data: ExportData = {};
  for (const key of EXPORT_COLLECTIONS) {
    const collection = payload.data[key];
    if (!Array.isArray(collection)) {
      throw new Error(`Backup data.${key} must be an array.`);
    }
    data[key] = collection;
  }

  return {
    schemaVersion: payload.schemaVersion,
    exportedAt: asString(payload.exportedAt) ?? undefined,
    workspace: isRecord(payload.workspace)
      ? {
          id: asNullableNumber(payload.workspace.id) ?? undefined,
          name: asString(payload.workspace.name) ?? undefined,
          slug: asString(payload.workspace.slug) ?? undefined,
        }
      : undefined,
    data,
  };
}

export function previewWorkspaceRestore(payload: unknown): RestorePreview {
  const backup = parseWorkspaceBackup(payload);
  const counts = Object.fromEntries(
    EXPORT_COLLECTIONS.map((key) => [key, backup.data[key]?.length ?? 0]),
  );
  const warnings = [
    "Restoring replaces the current workspace's finance data.",
    "Plaid access tokens are not included in backups, so restored bank connections must be reconnected before syncing.",
  ];

  return {
    valid: true,
    schemaVersion: backup.schemaVersion,
    exportedAt: backup.exportedAt ?? null,
    sourceWorkspaceName: backup.workspace?.name ?? null,
    warnings,
    counts,
  };
}

export async function clearWorkspaceFinanceData(database: AppDatabase, workspaceId: number) {
  const accountRows = await database
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(eq(schema.accounts.workspaceId, workspaceId));
  const accountIds = accountRows.map((account) => account.id);

  const transactionRows = await database
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .where(eq(schema.transactions.workspaceId, workspaceId));
  const transactionIds = transactionRows.map((transaction) => transaction.id);

  await database
    .delete(schema.plaidSyncJobs)
    .where(eq(schema.plaidSyncJobs.workspaceId, workspaceId));

  if (transactionIds.length > 0) {
    await database
      .delete(schema.transactionSplits)
      .where(inArray(schema.transactionSplits.transactionId, transactionIds));
  }

  if (accountIds.length > 0) {
    await database
      .delete(schema.accountSnapshots)
      .where(inArray(schema.accountSnapshots.accountId, accountIds));
  }

  await database
    .delete(schema.accountLinks)
    .where(eq(schema.accountLinks.workspaceId, workspaceId));
  await database
    .delete(schema.transactions)
    .where(eq(schema.transactions.workspaceId, workspaceId));
  await database
    .delete(schema.accounts)
    .where(eq(schema.accounts.workspaceId, workspaceId));
  await database
    .delete(schema.connections)
    .where(eq(schema.connections.workspaceId, workspaceId));
  await database
    .delete(schema.institutions)
    .where(eq(schema.institutions.workspaceId, workspaceId));
  await database
    .delete(schema.merchantRules)
    .where(eq(schema.merchantRules.workspaceId, workspaceId));
  await database
    .delete(schema.budgetTemplates)
    .where(eq(schema.budgetTemplates.workspaceId, workspaceId));
  await database.delete(schema.budgets).where(eq(schema.budgets.workspaceId, workspaceId));
  await database
    .delete(schema.snapshots)
    .where(eq(schema.snapshots.workspaceId, workspaceId));
  await database
    .delete(schema.categories)
    .where(eq(schema.categories.workspaceId, workspaceId));
}

async function restoreWorkspaceData(
  database: AppDatabase,
  workspace: RestoreWorkspace,
  backup: WorkspaceBackup,
) {
  const workspaceId = workspace.workspaceId;
  const restoredCounts: Record<string, number> = {};
  const institutionIdMap = new Map<number, number>();
  const connectionIdMap = new Map<number, number>();
  const accountIdMap = new Map<number, number>();
  const transactionIdMap = new Map<number, number>();

  await clearWorkspaceFinanceData(database, workspaceId);

  const customCategories = uniqueByName(
    backup.data.categories.filter(isRecord).filter((category) => {
      return !asBoolean(category.isPredefined) && asString(category.name);
    }),
  );
  if (customCategories.length > 0) {
    await database.insert(schema.categories).values(
      customCategories.map((category) => ({
        workspaceId,
        name: asString(category.name, "Uncategorized")!,
        color: asNullableString(category.color),
        icon: asNullableString(category.icon),
        isPredefined: false,
        sortOrder: asNumber(category.sortOrder),
      })),
    );
  }
  restoredCounts.categories = customCategories.length;

  const institutionRows = backup.data.institutions.filter(isRecord);
  for (const institution of institutionRows) {
    const [created] = await database
      .insert(schema.institutions)
      .values({
        workspaceId,
        name: asString(institution.name, "Restored Institution")!,
        provider: asString(institution.provider, "manual")!,
        status: asString(institution.status, "active")!,
        plaidInstitutionId: asNullableString(institution.plaidInstitutionId),
        lastSyncAt: asNullableString(institution.lastSyncAt),
      })
      .returning();

    const oldId = asNumber(institution.id, -1);
    if (created && oldId >= 0) {
      institutionIdMap.set(oldId, created.id);
    }
  }
  restoredCounts.institutions = institutionIdMap.size;

  const connectionRows = backup.data.connections.filter(isRecord);
  for (const connection of connectionRows) {
    const [created] = await database
      .insert(schema.connections)
      .values({
        workspaceId,
        institutionName: asString(connection.institutionName, "Restored Bank")!,
        provider: asString(connection.provider, "plaid")!,
        accessToken: null,
        itemId: asNullableString(connection.itemId),
        createdAt: asString(connection.createdAt, new Date().toISOString())!,
        transactionsCursor: asNullableString(connection.transactionsCursor),
        isEncrypted: false,
        lastSyncAt: asNullableString(connection.lastSyncAt),
        lastSyncStatus: "restored",
        lastSyncError: "Restored from backup without a Plaid access token. Reconnect this bank to resume syncing.",
      })
      .returning();

    const oldId = asNumber(connection.id, -1);
    if (created && oldId >= 0) {
      connectionIdMap.set(oldId, created.id);
    }
  }
  restoredCounts.connections = connectionIdMap.size;

  const accountRows = backup.data.accounts.filter(isRecord);
  for (const account of accountRows) {
    const oldInstitutionId = asNumber(account.institutionId, -1);
    const institutionId = institutionIdMap.get(oldInstitutionId);
    if (!institutionId) {
      continue;
    }

    const [created] = await database
      .insert(schema.accounts)
      .values({
        workspaceId,
        institutionId,
        externalRef: asNullableString(account.externalRef),
        name: asString(account.name, "Restored Account")!,
        mask: asNullableString(account.mask),
        type: asString(account.type, "checking")!,
        subtype: asNullableString(account.subtype),
        balanceCurrent: asNumber(account.balanceCurrent),
        balanceAvailable: asNullableNumber(account.balanceAvailable),
        isAsset: asBoolean(account.isAsset, true),
        currency: asString(account.currency, "USD")!,
        source: asString(account.source, "manual")!,
      })
      .returning();

    const oldId = asNumber(account.id, -1);
    if (created && oldId >= 0) {
      accountIdMap.set(oldId, created.id);
    }
  }
  restoredCounts.accounts = accountIdMap.size;

  const accountSnapshotRows = backup.data.accountSnapshots.filter(isRecord);
  const accountSnapshotValues = accountSnapshotRows
    .map((snapshot) => {
      const accountId = accountIdMap.get(asNumber(snapshot.accountId, -1));
      if (!accountId) return null;
      return {
        accountId,
        day: asString(snapshot.day, new Date().toISOString().slice(0, 10))!,
        capturedAt: asString(snapshot.capturedAt, new Date().toISOString())!,
        balanceCurrent: asNumber(snapshot.balanceCurrent),
        isAsset: asBoolean(snapshot.isAsset, true),
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  if (accountSnapshotValues.length > 0) {
    await database.insert(schema.accountSnapshots).values(accountSnapshotValues);
  }
  restoredCounts.accountSnapshots = accountSnapshotValues.length;

  const accountLinkRows = backup.data.accountLinks.filter(isRecord);
  const accountLinkValues = accountLinkRows
    .map((link) => {
      const connectionId = connectionIdMap.get(asNumber(link.connectionId, -1));
      const accountId = accountIdMap.get(asNumber(link.accountId, -1));
      if (!connectionId || !accountId) return null;
      return {
        workspaceId,
        provider: asString(link.provider, "plaid")!,
        externalKey: asString(link.externalKey, `restored-${accountId}`)!,
        connectionId,
        accountId,
        institutionName: asString(link.institutionName, "Restored Bank")!,
        displayName: asString(link.displayName, "Restored Account")!,
        updatedAt: asString(link.updatedAt, new Date().toISOString())!,
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  if (accountLinkValues.length > 0) {
    await database.insert(schema.accountLinks).values(accountLinkValues);
  }
  restoredCounts.accountLinks = accountLinkValues.length;

  const transactionRows = backup.data.transactions.filter(isRecord);
  for (const transaction of transactionRows) {
    const accountId = accountIdMap.get(asNumber(transaction.accountId, -1));
    if (!accountId) {
      continue;
    }

    const [created] = await database
      .insert(schema.transactions)
      .values({
        workspaceId,
        accountId,
        externalId: asNullableString(transaction.externalId),
        postedAt: asString(transaction.postedAt, new Date().toISOString().slice(0, 10))!,
        overrideMonth: asNullableString(transaction.overrideMonth),
        name: asString(transaction.name, "Restored Transaction")!,
        merchant: asNullableString(transaction.merchant),
        amount: asNumber(transaction.amount),
        category: asNullableString(transaction.category),
        pending: asBoolean(transaction.pending),
        notes: asNullableString(transaction.notes),
        categoryOverride: asNullableString(transaction.categoryOverride),
        isTransfer: asBoolean(transaction.isTransfer),
        isExcluded: asBoolean(transaction.isExcluded),
        reviewState: asString(transaction.reviewState, "none")!,
      })
      .returning();

    const oldId = asNumber(transaction.id, -1);
    if (created && oldId >= 0) {
      transactionIdMap.set(oldId, created.id);
    }
  }
  restoredCounts.transactions = transactionIdMap.size;

  const splitRows = backup.data.transactionSplits.filter(isRecord);
  const splitValues = splitRows
    .map((split) => {
      const transactionId = transactionIdMap.get(asNumber(split.transactionId, -1));
      if (!transactionId) return null;
      return {
        transactionId,
        category: asString(split.category, "Uncategorized")!,
        amount: asNumber(split.amount),
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  if (splitValues.length > 0) {
    await database.insert(schema.transactionSplits).values(splitValues);
  }
  restoredCounts.transactionSplits = splitValues.length;

  const budgetValues = backup.data.budgets.filter(isRecord).map((budget) => ({
    workspaceId,
    month: asString(budget.month, new Date().toISOString().slice(0, 7))!,
    category: asString(budget.category, "Uncategorized")!,
    amount: asNumber(budget.amount),
  }));
  if (budgetValues.length > 0) {
    await database.insert(schema.budgets).values(budgetValues);
  }
  restoredCounts.budgets = budgetValues.length;

  const budgetTemplateValues = backup.data.budgetTemplates.filter(isRecord).map((template) => ({
    workspaceId,
    category: asString(template.category, "Uncategorized")!,
    amount: asNumber(template.amount),
    updatedAt: asString(template.updatedAt, new Date().toISOString())!,
  }));
  if (budgetTemplateValues.length > 0) {
    await database.insert(schema.budgetTemplates).values(budgetTemplateValues);
  }
  restoredCounts.budgetTemplates = budgetTemplateValues.length;

  const snapshotValues = backup.data.snapshots.filter(isRecord).map((snapshot) => ({
    workspaceId,
    month: asString(snapshot.month, new Date().toISOString().slice(0, 7))!,
    assets: asNumber(snapshot.assets),
    liabilities: asNumber(snapshot.liabilities),
    netWorth: asNumber(snapshot.netWorth),
  }));
  if (snapshotValues.length > 0) {
    await database.insert(schema.snapshots).values(snapshotValues);
  }
  restoredCounts.snapshots = snapshotValues.length;

  const merchantRuleValues = backup.data.merchantRules.filter(isRecord).map((rule) => ({
    workspaceId,
    merchantKey: asString(rule.merchantKey, "restored-merchant")!,
    label: asString(rule.label, "Restored Merchant")!,
    category: asString(rule.category, "Uncategorized")!,
    isTransfer: asBoolean(rule.isTransfer),
    updatedAt: asString(rule.updatedAt, new Date().toISOString())!,
  }));
  if (merchantRuleValues.length > 0) {
    await database.insert(schema.merchantRules).values(merchantRuleValues);
  }
  restoredCounts.merchantRules = merchantRuleValues.length;

  return restoredCounts;
}

export async function restoreWorkspaceBackup(
  database: AppDatabase = db,
  workspace: RestoreWorkspace,
  payload: unknown,
): Promise<RestoreResult> {
  const preview = previewWorkspaceRestore(payload);
  const backup = parseWorkspaceBackup(payload);

  const restoredCounts = await database.transaction(async (transaction) =>
    restoreWorkspaceData(transaction as AppDatabase, workspace, backup),
  );

  return {
    ...preview,
    restoredAt: new Date().toISOString(),
    targetWorkspace: {
      id: workspace.workspaceId,
      name: workspace.workspaceName,
      slug: workspace.workspaceSlug,
    },
    restoredCounts,
  };
}
