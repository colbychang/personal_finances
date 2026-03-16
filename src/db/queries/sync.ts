import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";

type DB = ReturnType<typeof drizzle>;

// ─── Types for Plaid transaction sync data ────────────────────────────

export interface PlaidSyncTransaction {
  transaction_id: string;
  account_id: string; // Plaid external account_id
  amount: number; // Plaid convention: positive = money out, negative = money in
  date: string; // YYYY-MM-DD
  name: string;
  merchant_name: string | null;
  pending: boolean;
}

export interface PlaidSyncRemovedTransaction {
  transaction_id: string;
}

export interface PlaidSyncData {
  added: PlaidSyncTransaction[];
  modified: PlaidSyncTransaction[];
  removed: PlaidSyncRemovedTransaction[];
}

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
}

// ─── Account ID resolution ────────────────────────────────────────────

/**
 * Build a map from Plaid external account_id to our internal account ID.
 * Uses the accounts table's externalRef field.
 */
function buildAccountIdMap(database: DB): Map<string, number> {
  const accounts = database
    .select({
      id: schema.accounts.id,
      externalRef: schema.accounts.externalRef,
    })
    .from(schema.accounts)
    .all();

  const map = new Map<string, number>();
  for (const acct of accounts) {
    if (acct.externalRef) {
      map.set(acct.externalRef, acct.id);
    }
  }
  return map;
}

// ─── Transaction sync ─────────────────────────────────────────────────

/**
 * Process added/modified/removed transactions from Plaid sync.
 * - Added: Insert new transactions (skip duplicates by external_id).
 * - Modified: Update existing transactions by external_id.
 * - Removed: Delete transactions by external_id.
 *
 * Plaid amount convention: positive = money out (expense), negative = money in (income).
 * We store the same convention (positive cents = expense, negative cents = income).
 */
export function syncTransactionsFromPlaid(
  database: DB,
  connectionId: number,
  data: PlaidSyncData
): SyncResult {
  const accountMap = buildAccountIdMap(database);
  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;

  // Process added transactions
  for (const txn of data.added) {
    const accountId = accountMap.get(txn.account_id);
    if (!accountId) {
      // Skip transactions for unknown accounts
      continue;
    }

    // Check if transaction already exists (deduplication)
    const existing = database
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, txn.transaction_id))
      .get();

    if (existing) {
      // Already exists — skip (no duplicate)
      continue;
    }

    // Convert Plaid dollars to cents
    const amountCents = Math.round(txn.amount * 100);

    database
      .insert(schema.transactions)
      .values({
        accountId,
        externalId: txn.transaction_id,
        postedAt: txn.date,
        name: txn.name,
        merchant: txn.merchant_name ?? null,
        amount: amountCents,
        category: null, // Will be categorized later (AI or merchant rules)
        pending: txn.pending,
        notes: null,
        categoryOverride: null,
        isTransfer: false,
        reviewState: "none",
      })
      .run();

    addedCount++;
  }

  // Process modified transactions
  for (const txn of data.modified) {
    const accountId = accountMap.get(txn.account_id);
    if (!accountId) continue;

    const amountCents = Math.round(txn.amount * 100);

    const existing = database
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, txn.transaction_id))
      .get();

    if (!existing) {
      // Modified transaction not found — insert as new
      database
        .insert(schema.transactions)
        .values({
          accountId,
          externalId: txn.transaction_id,
          postedAt: txn.date,
          name: txn.name,
          merchant: txn.merchant_name ?? null,
          amount: amountCents,
          category: null,
          pending: txn.pending,
          notes: null,
          categoryOverride: null,
          isTransfer: false,
          reviewState: "none",
        })
        .run();

      modifiedCount++;
      continue;
    }

    database
      .update(schema.transactions)
      .set({
        accountId,
        postedAt: txn.date,
        name: txn.name,
        merchant: txn.merchant_name ?? null,
        amount: amountCents,
        pending: txn.pending,
      })
      .where(eq(schema.transactions.id, existing.id))
      .run();

    modifiedCount++;
  }

  // Process removed transactions
  for (const removed of data.removed) {
    const existing = database
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, removed.transaction_id))
      .get();

    if (!existing) continue;

    // Delete splits first (FK constraint)
    database
      .delete(schema.transactionSplits)
      .where(eq(schema.transactionSplits.transactionId, existing.id))
      .run();

    // Delete the transaction
    database
      .delete(schema.transactions)
      .where(eq(schema.transactions.id, existing.id))
      .run();

    removedCount++;
  }

  return { added: addedCount, modified: modifiedCount, removed: removedCount };
}

// ─── Connection sync status ───────────────────────────────────────────

export interface UpdateSyncStatusInput {
  cursor: string | null;
  status: "success" | "error" | "syncing";
  error: string | null;
}

/**
 * Update a connection's sync cursor and status.
 */
export function updateConnectionSyncStatus(
  database: DB,
  connectionId: number,
  input: UpdateSyncStatusInput
): void {
  const updates: Record<string, unknown> = {
    lastSyncStatus: input.status,
    lastSyncError: input.error,
    lastSyncAt: new Date().toISOString(),
  };

  if (input.cursor !== null) {
    updates.transactionsCursor = input.cursor;
  }

  database
    .update(schema.connections)
    .set(updates)
    .where(eq(schema.connections.id, connectionId))
    .run();
}

// ─── Account balance update ───────────────────────────────────────────

export interface PlaidAccountBalance {
  account_id: string; // Plaid external account_id
  balances: {
    current: number | null;
    available: number | null;
  };
}

/**
 * Update account balances from Plaid account data.
 * Matches accounts by externalRef (Plaid account_id).
 */
export function updateAccountBalances(
  database: DB,
  plaidAccounts: PlaidAccountBalance[]
): void {
  for (const plaidAcct of plaidAccounts) {
    // Find our account by external ref
    const account = database
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(eq(schema.accounts.externalRef, plaidAcct.account_id))
      .get();

    if (!account) continue;

    const updates: Record<string, unknown> = {};

    if (plaidAcct.balances.current !== null) {
      updates.balanceCurrent = Math.round(plaidAcct.balances.current * 100);
    }

    if (plaidAcct.balances.available !== null) {
      updates.balanceAvailable = Math.round(plaidAcct.balances.available * 100);
    }

    if (Object.keys(updates).length > 0) {
      database
        .update(schema.accounts)
        .set(updates)
        .where(eq(schema.accounts.id, account.id))
        .run();
    }
  }
}
