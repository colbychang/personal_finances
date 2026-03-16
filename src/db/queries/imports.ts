import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";

type DB = ReturnType<typeof drizzle>;

// ─── Types ──────────────────────────────────────────────────────────

export interface ImportTransactionInput {
  accountId: number;
  postedAt: string; // YYYY-MM-DD
  name: string;
  amount: number; // cents (positive = expense, negative = income)
  category: string | null;
}

// ─── Queries ────────────────────────────────────────────────────────

/**
 * Bulk import transactions into the database.
 * Returns the number of transactions inserted.
 */
export function importTransactions(
  database: DB,
  transactions: ImportTransactionInput[]
): number {
  if (transactions.length === 0) return 0;

  database
    .insert(schema.transactions)
    .values(
      transactions.map((txn) => ({
        accountId: txn.accountId,
        postedAt: txn.postedAt,
        name: txn.name,
        amount: txn.amount,
        category: txn.category,
        pending: false,
        isTransfer: false,
        reviewState: "none" as const,
      }))
    )
    .run();

  return transactions.length;
}

/**
 * Get existing transactions for an account for duplicate checking.
 * Returns minimal data needed for the duplicate detection algorithm.
 */
export function getExistingTransactionsForDuplicateCheck(
  database: DB,
  accountId: number
): Array<{ id: number; postedAt: string; name: string; amount: number }> {
  return database
    .select({
      id: schema.transactions.id,
      postedAt: schema.transactions.postedAt,
      name: schema.transactions.name,
      amount: schema.transactions.amount,
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.accountId, accountId))
    .all();
}
