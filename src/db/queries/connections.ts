import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";

type DB = ReturnType<typeof drizzle>;

export interface ConnectionWithAccounts {
  id: number;
  institutionName: string;
  provider: string;
  itemId: string | null;
  createdAt: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  accounts: {
    id: number;
    name: string;
    mask: string | null;
    type: string;
    subtype: string | null;
    balanceCurrent: number;
  }[];
}

/**
 * Get all connections with their linked accounts.
 */
export function getAllConnections(database: DB): ConnectionWithAccounts[] {
  const conns = database
    .select()
    .from(schema.connections)
    .all();

  return conns.map((conn) => {
    // Get account links for this connection
    const links = database
      .select({
        accountId: schema.accountLinks.accountId,
        displayName: schema.accountLinks.displayName,
      })
      .from(schema.accountLinks)
      .where(eq(schema.accountLinks.institutionName, conn.institutionName))
      .all();

    // Get full account details for linked accounts
    const accounts = links
      .map((link) => {
        const acct = database
          .select({
            id: schema.accounts.id,
            name: schema.accounts.name,
            mask: schema.accounts.mask,
            type: schema.accounts.type,
            subtype: schema.accounts.subtype,
            balanceCurrent: schema.accounts.balanceCurrent,
          })
          .from(schema.accounts)
          .where(eq(schema.accounts.id, link.accountId))
          .get();
        return acct ?? null;
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    return {
      id: conn.id,
      institutionName: conn.institutionName,
      provider: conn.provider,
      itemId: conn.itemId,
      createdAt: conn.createdAt,
      lastSyncAt: conn.lastSyncAt,
      lastSyncStatus: conn.lastSyncStatus,
      lastSyncError: conn.lastSyncError,
      accounts,
    };
  });
}

/**
 * Get a single connection by ID.
 */
export function getConnectionById(
  database: DB,
  id: number
): typeof schema.connections.$inferSelect | null {
  return (
    database
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.id, id))
      .get() ?? null
  );
}

export interface CreateConnectionInput {
  institutionName: string;
  provider: string;
  accessToken: string; // already encrypted
  itemId: string;
  isEncrypted: boolean;
}

/**
 * Create a new connection record.
 */
export function createConnection(
  database: DB,
  input: CreateConnectionInput
): typeof schema.connections.$inferSelect {
  return database
    .insert(schema.connections)
    .values({
      institutionName: input.institutionName,
      provider: input.provider,
      accessToken: input.accessToken,
      itemId: input.itemId,
      isEncrypted: input.isEncrypted,
    })
    .returning()
    .get();
}

/**
 * Delete a connection and all its associated account links.
 * Also removes associated accounts (Plaid-sourced) and their transactions.
 * Returns true if found and deleted, false if not found.
 */
export function deleteConnection(database: DB, id: number): boolean {
  const conn = database
    .select()
    .from(schema.connections)
    .where(eq(schema.connections.id, id))
    .get();

  if (!conn) return false;

  // Find account links for this connection
  const links = database
    .select({ accountId: schema.accountLinks.accountId })
    .from(schema.accountLinks)
    .where(eq(schema.accountLinks.institutionName, conn.institutionName))
    .all();

  const accountIds = links.map((l) => l.accountId);

  // Delete account links
  database
    .delete(schema.accountLinks)
    .where(eq(schema.accountLinks.institutionName, conn.institutionName))
    .run();

  // Delete transactions and splits for associated accounts
  for (const accountId of accountIds) {
    // Get transaction IDs for this account
    const txns = database
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(eq(schema.transactions.accountId, accountId))
      .all();

    // Delete splits
    for (const txn of txns) {
      database
        .delete(schema.transactionSplits)
        .where(eq(schema.transactionSplits.transactionId, txn.id))
        .run();
    }

    // Delete transactions
    database
      .delete(schema.transactions)
      .where(eq(schema.transactions.accountId, accountId))
      .run();

    // Delete account snapshots
    database
      .delete(schema.accountSnapshots)
      .where(eq(schema.accountSnapshots.accountId, accountId))
      .run();

    // Delete the account
    database
      .delete(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .run();
  }

  // Delete the connection
  database.delete(schema.connections).where(eq(schema.connections.id, id)).run();

  return true;
}

/**
 * Create or find an institution by name for Plaid connections.
 */
export function findOrCreatePlaidInstitution(
  database: DB,
  name: string,
  plaidInstitutionId?: string
): number {
  const existing = database
    .select()
    .from(schema.institutions)
    .where(eq(schema.institutions.name, name))
    .get();

  if (existing) return existing.id;

  const result = database
    .insert(schema.institutions)
    .values({
      name,
      provider: "plaid",
      status: "active",
      plaidInstitutionId: plaidInstitutionId ?? null,
    })
    .returning()
    .get();

  return result.id;
}

export interface CreatePlaidAccountInput {
  institutionId: number;
  externalRef: string; // Plaid account_id
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  balanceCurrent: number; // cents
  balanceAvailable: number | null; // cents
  isAsset: boolean;
}

/**
 * Create a Plaid-sourced account and its account link.
 */
export function createPlaidAccount(
  database: DB,
  input: CreatePlaidAccountInput,
  institutionName: string
): typeof schema.accounts.$inferSelect {
  // Check if account with this external ref already exists
  const existing = database
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.externalRef, input.externalRef))
    .get();

  if (existing) {
    // Update balance
    database
      .update(schema.accounts)
      .set({
        balanceCurrent: input.balanceCurrent,
        balanceAvailable: input.balanceAvailable,
      })
      .where(eq(schema.accounts.id, existing.id))
      .run();

    return database
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, existing.id))
      .get()!;
  }

  const account = database
    .insert(schema.accounts)
    .values({
      institutionId: input.institutionId,
      externalRef: input.externalRef,
      name: input.name,
      mask: input.mask,
      type: input.type,
      subtype: input.subtype,
      balanceCurrent: input.balanceCurrent,
      balanceAvailable: input.balanceAvailable,
      isAsset: input.isAsset,
      currency: "USD",
      source: "plaid",
    })
    .returning()
    .get();

  // Create account link
  database
    .insert(schema.accountLinks)
    .values({
      provider: "plaid",
      externalKey: input.externalRef,
      accountId: account.id,
      institutionName,
      displayName: input.name,
    })
    .run();

  return account;
}
