import { and, eq } from "drizzle-orm";
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
export function getAllConnections(database: DB, workspaceId?: number): ConnectionWithAccounts[] {
  const conns = database
    .select()
    .from(schema.connections)
    .where(
      workspaceId === undefined
        ? undefined
        : eq(schema.connections.workspaceId, workspaceId),
    )
    .all();

  return conns.map((conn) => {
    // Get account links for this connection
    const links = database
      .select({
        accountId: schema.accountLinks.accountId,
        displayName: schema.accountLinks.displayName,
      })
      .from(schema.accountLinks)
      .where(eq(schema.accountLinks.connectionId, conn.id))
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
  id: number,
  workspaceId?: number,
): typeof schema.connections.$inferSelect | null {
  return (
    database
      .select()
      .from(schema.connections)
      .where(
        workspaceId === undefined
          ? eq(schema.connections.id, id)
          : and(
              eq(schema.connections.id, id),
              eq(schema.connections.workspaceId, workspaceId),
            ),
      )
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
  input: CreateConnectionInput,
  workspaceId?: number,
): typeof schema.connections.$inferSelect {
  return database
    .insert(schema.connections)
    .values({
      workspaceId: workspaceId ?? null,
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
export function deleteConnection(database: DB, id: number, workspaceId?: number): boolean {
  const conn = database
    .select()
    .from(schema.connections)
    .where(
      workspaceId === undefined
        ? eq(schema.connections.id, id)
        : and(eq(schema.connections.id, id), eq(schema.connections.workspaceId, workspaceId)),
    )
    .get();

  if (!conn) return false;

  // Find account links for this connection
  const links = database
    .select({ accountId: schema.accountLinks.accountId })
    .from(schema.accountLinks)
    .where(eq(schema.accountLinks.connectionId, conn.id))
    .all();

  const accountIds = links.map((l) => l.accountId);

  // Delete account links
  database
    .delete(schema.accountLinks)
    .where(eq(schema.accountLinks.connectionId, conn.id))
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
  plaidInstitutionId?: string,
  workspaceId?: number,
): number {
  const existing =
    (plaidInstitutionId
      ? database
          .select()
          .from(schema.institutions)
          .where(
            and(
              eq(schema.institutions.plaidInstitutionId, plaidInstitutionId),
              workspaceId === undefined
                ? undefined
                : eq(schema.institutions.workspaceId, workspaceId),
            ),
          )
          .get()
      : null) ??
    database
      .select()
      .from(schema.institutions)
      .where(
        and(
          eq(schema.institutions.name, name),
          workspaceId === undefined
            ? undefined
            : eq(schema.institutions.workspaceId, workspaceId),
        ),
      )
      .get();

  if (existing) {
    if (
      existing.name !== name ||
      existing.plaidInstitutionId !== (plaidInstitutionId ?? existing.plaidInstitutionId)
    ) {
      database
        .update(schema.institutions)
        .set({
          name,
          plaidInstitutionId: plaidInstitutionId ?? existing.plaidInstitutionId,
        })
        .where(eq(schema.institutions.id, existing.id))
        .run();
    }
    return existing.id;
  }

  const result = database
    .insert(schema.institutions)
    .values({
      workspaceId: workspaceId ?? null,
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
  connectionId: number,
  institutionName: string,
  workspaceId?: number,
): typeof schema.accounts.$inferSelect {
  // Check if account with this external ref already exists
  const existingWhere = workspaceId === undefined
    ? eq(schema.accounts.externalRef, input.externalRef)
    : and(
        eq(schema.accounts.externalRef, input.externalRef),
        eq(schema.accounts.workspaceId, workspaceId),
      );

  const existing = database
    .select()
    .from(schema.accounts)
    .where(existingWhere)
    .get();

  if (existing) {
    // Keep account details current in case Plaid metadata changes over time.
    database
      .update(schema.accounts)
      .set({
        workspaceId: workspaceId ?? existing.workspaceId,
        institutionId: input.institutionId,
        name: input.name,
        mask: input.mask,
        type: input.type,
        subtype: input.subtype,
        balanceCurrent: input.balanceCurrent,
        balanceAvailable: input.balanceAvailable,
        isAsset: input.isAsset,
      })
      .where(eq(schema.accounts.id, existing.id))
      .run();
  }

  const account = existing
    ? database
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, existing.id))
        .get()!
    : database
        .insert(schema.accounts)
        .values({
          workspaceId: workspaceId ?? null,
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

  const existingLink = database
    .select({ id: schema.accountLinks.id })
    .from(schema.accountLinks)
    .where(
      workspaceId === undefined
        ? eq(schema.accountLinks.externalKey, input.externalRef)
        : and(
            eq(schema.accountLinks.externalKey, input.externalRef),
            eq(schema.accountLinks.workspaceId, workspaceId),
          ),
    )
    .get();

  const linkValues = {
    provider: "plaid" as const,
    workspaceId: workspaceId ?? null,
    externalKey: input.externalRef,
    connectionId,
    accountId: account.id,
    institutionName,
    displayName: input.name,
    updatedAt: new Date().toISOString(),
  };

  if (existingLink) {
    database
      .update(schema.accountLinks)
      .set(linkValues)
      .where(eq(schema.accountLinks.id, existingLink.id))
      .run();
  } else {
    database
      .insert(schema.accountLinks)
      .values(linkValues)
      .run();
  }

  return account;
}
