import { and, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "../schema";

type DB = AppDatabase;

// Account types mapped to section names
const SECTION_MAP: Record<string, string> = {
  checking: "Checking & Savings",
  savings: "Checking & Savings",
  credit: "Credit Cards",
  investment: "Investments & Retirement",
  retirement: "Investments & Retirement",
};

// Section display order
const SECTION_ORDER = [
  "Checking & Savings",
  "Credit Cards",
  "Investments & Retirement",
];

export interface AccountWithInstitution {
  id: number;
  name: string;
  type: string;
  balanceCurrent: number;
  isAsset: boolean;
  currency: string;
  source: string;
  institutionId: number;
  institutionName: string;
}

export interface AccountSection {
  section: string;
  subtotal: number;
  accounts: AccountWithInstitution[];
}

/**
 * Get all accounts grouped by type section with subtotals.
 * Sections: "Checking & Savings", "Credit Cards", "Investments & Retirement"
 */
export async function getAllAccountsGrouped(
  database: DB,
  workspaceId?: number,
): Promise<AccountSection[]> {
  const where = workspaceId === undefined
    ? undefined
    : eq(schema.accounts.workspaceId, workspaceId);

  const rows = await database
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
      type: schema.accounts.type,
      balanceCurrent: schema.accounts.balanceCurrent,
      isAsset: schema.accounts.isAsset,
      currency: schema.accounts.currency,
      source: schema.accounts.source,
      institutionId: schema.accounts.institutionId,
      institutionName: schema.institutions.name,
    })
    .from(schema.accounts)
    .innerJoin(
      schema.institutions,
      eq(schema.accounts.institutionId, schema.institutions.id)
    )
    .where(where);

  // Group by section
  const sectionMap = new Map<string, AccountWithInstitution[]>();

  for (const row of rows) {
    const section = SECTION_MAP[row.type] ?? "Other";
    if (!sectionMap.has(section)) {
      sectionMap.set(section, []);
    }
    sectionMap.get(section)!.push(row);
  }

  // Build sections in order, skipping empty ones
  const result: AccountSection[] = [];
  for (const sectionName of SECTION_ORDER) {
    const accounts = sectionMap.get(sectionName);
    if (accounts && accounts.length > 0) {
      const subtotal = accounts.reduce((sum, a) => sum + a.balanceCurrent, 0);
      result.push({ section: sectionName, subtotal, accounts });
    }
  }

  return result;
}

export interface CreateAccountInput {
  name: string;
  institution: string;
  type: string;
  balance: number; // in cents
}

/**
 * Create a new account. Creates or reuses institution by name.
 */
export async function createAccount(
  database: DB,
  input: CreateAccountInput,
  workspaceId?: number,
) {
  // Find or create institution
  const institutionId = await findOrCreateInstitution(database, input.institution, workspaceId);

  const isAsset = input.type !== "credit";

  const [result] = await database
    .insert(schema.accounts)
    .values({
      institutionId,
      workspaceId: workspaceId ?? null,
      name: input.name,
      type: input.type,
      balanceCurrent: input.balance,
      balanceAvailable: isAsset ? input.balance : undefined,
      isAsset,
      currency: "USD",
      source: "manual",
    })
    .returning();

  return result;
}

export interface UpdateAccountInput {
  name?: string;
  institution?: string;
  type?: string;
  balance?: number; // in cents
}

/**
 * Update an existing account. Returns the updated account or null if not found.
 */
export async function updateAccount(
  database: DB,
  id: number,
  input: UpdateAccountInput,
  workspaceId?: number,
) {
  // Check if account exists
  const existingWhere = workspaceId === undefined
    ? eq(schema.accounts.id, id)
    : and(eq(schema.accounts.id, id), eq(schema.accounts.workspaceId, workspaceId));

  const [existing] = await database
    .select()
    .from(schema.accounts)
    .where(existingWhere)
    .limit(1);

  if (!existing) return null;

  // Build update fields
  const updates: Record<string, unknown> = {};

  if (input.name !== undefined) {
    updates.name = input.name;
  }

  if (input.type !== undefined) {
    updates.type = input.type;
    updates.isAsset = input.type !== "credit";
  }

  if (input.balance !== undefined) {
    updates.balanceCurrent = input.balance;
  }

  if (input.institution !== undefined) {
    updates.institutionId = await findOrCreateInstitution(
      database,
      input.institution,
      workspaceId,
    );
  }

  if (Object.keys(updates).length > 0) {
    await database
      .update(schema.accounts)
      .set(updates)
      .where(existingWhere);
  }

  const [updatedAccount] = await database
    .select()
    .from(schema.accounts)
    .where(existingWhere)
    .limit(1);

  return updatedAccount!;
}

/**
 * Delete an account and all its associated transactions (and their splits).
 * Returns true if the account was found and deleted, false otherwise.
 */
export async function deleteAccountWithTransactions(
  database: DB,
  id: number,
  workspaceId?: number,
): Promise<boolean> {
  const existingWhere = workspaceId === undefined
    ? eq(schema.accounts.id, id)
    : and(eq(schema.accounts.id, id), eq(schema.accounts.workspaceId, workspaceId));

  const [existing] = await database
    .select()
    .from(schema.accounts)
    .where(existingWhere)
    .limit(1);

  if (!existing) return false;

  // Get all transaction IDs for this account
  const txnIds = (await database
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .where(eq(schema.transactions.accountId, id))
    )
    .map((t) => t.id);

  // Delete transaction splits first (FK constraint)
  if (txnIds.length > 0) {
    await database
      .delete(schema.transactionSplits)
      .where(inArray(schema.transactionSplits.transactionId, txnIds));
  }

  // Delete transactions
  await database
    .delete(schema.transactions)
    .where(eq(schema.transactions.accountId, id));

  // Delete account snapshots
  await database
    .delete(schema.accountSnapshots)
    .where(eq(schema.accountSnapshots.accountId, id));

  // Delete account links
  await database
    .delete(schema.accountLinks)
    .where(eq(schema.accountLinks.accountId, id));

  // Delete the account itself
  await database
    .delete(schema.accounts)
    .where(eq(schema.accounts.id, id));

  return true;
}

/**
 * Get a single account by ID with institution name.
 */
export async function getAccountById(
  database: DB,
  id: number,
  workspaceId?: number,
): Promise<AccountWithInstitution | null> {
  const where = workspaceId === undefined
    ? eq(schema.accounts.id, id)
    : and(eq(schema.accounts.id, id), eq(schema.accounts.workspaceId, workspaceId));

  const [row] = await database
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
      type: schema.accounts.type,
      balanceCurrent: schema.accounts.balanceCurrent,
      isAsset: schema.accounts.isAsset,
      currency: schema.accounts.currency,
      source: schema.accounts.source,
      institutionId: schema.accounts.institutionId,
      institutionName: schema.institutions.name,
    })
    .from(schema.accounts)
    .innerJoin(
      schema.institutions,
      eq(schema.accounts.institutionId, schema.institutions.id)
    )
    .where(where)
    .limit(1);

  return row ?? null;
}

/**
 * Find an institution by name or create one if it doesn't exist.
 */
async function findOrCreateInstitution(
  database: DB,
  name: string,
  workspaceId?: number,
): Promise<number> {
  const where = workspaceId === undefined
    ? eq(schema.institutions.name, name)
    : and(
        eq(schema.institutions.name, name),
        eq(schema.institutions.workspaceId, workspaceId),
      );

  const [existing] = await database
    .select()
    .from(schema.institutions)
    .where(where)
    .limit(1);

  if (existing) return existing.id;

  const [result] = await database
    .insert(schema.institutions)
    .values({
      workspaceId: workspaceId ?? null,
      name,
      provider: "manual",
      status: "active",
    })
    .returning();

  return result.id;
}
