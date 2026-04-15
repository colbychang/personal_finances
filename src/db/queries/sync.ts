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

interface TransactionForMatching {
  id: number;
  postedAt: string;
  amount: number;
  name: string;
  merchant: string | null;
  notes: string | null;
  institutionName: string;
  isTransfer: boolean;
}

// ─── Account ID resolution ────────────────────────────────────────────

/**
 * Build a map from Plaid external account_id to our internal account ID.
 * Uses the accounts table's externalRef field.
 */
function buildAccountIdMap(database: DB, connectionId: number): Map<string, number> {
  const linkedAccounts = database
    .select({
      accountId: schema.accountLinks.accountId,
      externalKey: schema.accountLinks.externalKey,
    })
    .from(schema.accountLinks)
    .where(eq(schema.accountLinks.connectionId, connectionId))
    .all();

  const map = new Map<string, number>();
  for (const acct of linkedAccounts) {
    if (acct.externalKey) {
      map.set(acct.externalKey, acct.accountId);
    }
  }
  return map;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function dayNumber(date: string) {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 86_400_000);
}

function isVenmoInstitution(institutionName: string) {
  return normalizeText(institutionName).includes("venmo");
}

function isStandardTransferName(name: string) {
  return normalizeText(name).includes("standard transfer");
}

function isGenericVenmoBankPull(transaction: TransactionForMatching) {
  if (transaction.isTransfer || transaction.amount <= 0) {
    return false;
  }

  if (isVenmoInstitution(transaction.institutionName)) {
    return false;
  }

  const name = normalizeText(transaction.name);
  const merchant = normalizeText(transaction.merchant);
  return name === "venmo" || merchant === "venmo" || name.startsWith("venmo ");
}

function isVenmoLedgerExpense(transaction: TransactionForMatching) {
  if (transaction.isTransfer || transaction.amount <= 0) {
    return false;
  }

  if (!isVenmoInstitution(transaction.institutionName)) {
    return false;
  }

  return !isStandardTransferName(transaction.name);
}

function reconcileVenmoFundingDuplicates(database: DB) {
  const transactions = database
    .select({
      id: schema.transactions.id,
      postedAt: schema.transactions.postedAt,
      amount: schema.transactions.amount,
      name: schema.transactions.name,
      merchant: schema.transactions.merchant,
      notes: schema.transactions.notes,
      institutionName: schema.institutions.name,
      isTransfer: schema.transactions.isTransfer,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id)
    )
    .innerJoin(
      schema.institutions,
      eq(schema.accounts.institutionId, schema.institutions.id)
    )
    .all();

  const bankCandidates = transactions.filter(isGenericVenmoBankPull);
  const venmoCandidates = transactions.filter(isVenmoLedgerExpense);
  const venmoCandidatesByAmount = new Map<number, TransactionForMatching[]>();

  for (const transaction of venmoCandidates) {
    const list = venmoCandidatesByAmount.get(transaction.amount) ?? [];
    list.push(transaction);
    venmoCandidatesByAmount.set(transaction.amount, list);
  }

  for (const list of venmoCandidatesByAmount.values()) {
    list.sort((a, b) => {
      const diff = dayNumber(a.postedAt) - dayNumber(b.postedAt);
      return diff !== 0 ? diff : a.id - b.id;
    });
  }

  const matchedVenmoIds = new Set<number>();

  for (const bankTransaction of bankCandidates) {
    const potentialMatches = (venmoCandidatesByAmount.get(bankTransaction.amount) ?? [])
      .filter((candidate) => !matchedVenmoIds.has(candidate.id))
      .map((candidate) => ({
        candidate,
        dateDistance: Math.abs(
          dayNumber(candidate.postedAt) - dayNumber(bankTransaction.postedAt)
        ),
      }))
      .filter(({ dateDistance }) => dateDistance <= 1)
      .sort((left, right) => {
        if (left.dateDistance !== right.dateDistance) {
          return left.dateDistance - right.dateDistance;
        }
        return right.candidate.id - left.candidate.id;
      });

    const match = potentialMatches[0]?.candidate;
    if (!match) {
      continue;
    }

    matchedVenmoIds.add(match.id);

    const existingNote = bankTransaction.notes?.trim();
    const autoNote = "Auto-marked as transfer to avoid double-counting a matched Venmo transaction.";
    const nextNote =
      existingNote && existingNote.length > 0
        ? existingNote
        : autoNote;

    database
      .update(schema.transactions)
      .set({
        isTransfer: true,
        notes: nextNote,
      })
      .where(eq(schema.transactions.id, bankTransaction.id))
      .run();
  }
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
  const accountMap = buildAccountIdMap(database, connectionId);
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

  reconcileVenmoFundingDuplicates(database);

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
