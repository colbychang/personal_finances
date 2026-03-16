import { eq, inArray } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";

type DB = ReturnType<typeof drizzle>;

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
export function getAllAccountsGrouped(database: DB): AccountSection[] {
  const rows = database
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
    .all();

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
export function createAccount(database: DB, input: CreateAccountInput) {
  // Find or create institution
  const institutionId = findOrCreateInstitution(database, input.institution);

  const isAsset = input.type !== "credit";

  const result = database
    .insert(schema.accounts)
    .values({
      institutionId,
      name: input.name,
      type: input.type,
      balanceCurrent: input.balance,
      balanceAvailable: isAsset ? input.balance : undefined,
      isAsset,
      currency: "USD",
      source: "manual",
    })
    .returning()
    .get();

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
export function updateAccount(
  database: DB,
  id: number,
  input: UpdateAccountInput
) {
  // Check if account exists
  const existing = database
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, id))
    .get();

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
    updates.institutionId = findOrCreateInstitution(
      database,
      input.institution
    );
  }

  if (Object.keys(updates).length > 0) {
    database
      .update(schema.accounts)
      .set(updates)
      .where(eq(schema.accounts.id, id))
      .run();
  }

  return database
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, id))
    .get()!;
}

/**
 * Delete an account and all its associated transactions (and their splits).
 * Returns true if the account was found and deleted, false otherwise.
 */
export function deleteAccountWithTransactions(
  database: DB,
  id: number
): boolean {
  const existing = database
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, id))
    .get();

  if (!existing) return false;

  // Get all transaction IDs for this account
  const txnIds = database
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .where(eq(schema.transactions.accountId, id))
    .all()
    .map((t) => t.id);

  // Delete transaction splits first (FK constraint)
  if (txnIds.length > 0) {
    database
      .delete(schema.transactionSplits)
      .where(inArray(schema.transactionSplits.transactionId, txnIds))
      .run();
  }

  // Delete transactions
  database
    .delete(schema.transactions)
    .where(eq(schema.transactions.accountId, id))
    .run();

  // Delete account snapshots
  database
    .delete(schema.accountSnapshots)
    .where(eq(schema.accountSnapshots.accountId, id))
    .run();

  // Delete account links
  database
    .delete(schema.accountLinks)
    .where(eq(schema.accountLinks.accountId, id))
    .run();

  // Delete the account itself
  database
    .delete(schema.accounts)
    .where(eq(schema.accounts.id, id))
    .run();

  return true;
}

/**
 * Get a single account by ID with institution name.
 */
export function getAccountById(
  database: DB,
  id: number
): AccountWithInstitution | null {
  const row = database
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
    .where(eq(schema.accounts.id, id))
    .get();

  return row ?? null;
}

/**
 * Find an institution by name or create one if it doesn't exist.
 */
function findOrCreateInstitution(database: DB, name: string): number {
  const existing = database
    .select()
    .from(schema.institutions)
    .where(eq(schema.institutions.name, name))
    .get();

  if (existing) return existing.id;

  const result = database
    .insert(schema.institutions)
    .values({ name, provider: "manual", status: "active" })
    .returning()
    .get();

  return result.id;
}
