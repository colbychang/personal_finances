import {
  eq,
  and,
  gte,
  lte,
  like,
  or,
  desc,
  sql,
  inArray,
  isNull,
  notInArray,
} from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";
import { INVESTMENT_LIKE_ACCOUNT_TYPES } from "@/lib/account-types";
import { shouldExcludePassiveIncomeTransaction } from "@/lib/transaction-exclusions";
import { effectiveTransactionMonth } from "./effective-month";

type DB = ReturnType<typeof drizzle>;

export interface TransactionWithAccount {
  id: number;
  accountId: number;
  externalId: string | null;
  postedAt: string;
  overrideMonth: string | null;
  name: string;
  merchant: string | null;
  amount: number; // cents
  category: string | null;
  pending: boolean;
  notes: string | null;
  categoryOverride: string | null;
  isTransfer: boolean;
  reviewState: string;
  accountName: string;
}

export interface TransactionFilters {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  effectiveMonth?: string; // YYYY-MM
  category?: string | string[];
  accountId?: number;
  search?: string;
  needsReview?: boolean;
  page?: number;
  limit?: number;
}

export interface PaginatedTransactions {
  transactions: TransactionWithAccount[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Get paginated transactions with optional filtering and search.
 * Sorted by posted_at DESC (newest first), then by id DESC.
 */
export function getTransactions(
  database: DB,
  filters: TransactionFilters = {}
): PaginatedTransactions {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const conditions = buildWhereConditions(filters);

  // Count total matching rows
  const countResult = database
    .select({ count: sql<number>`count(*)` })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id)
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .get();

  const total = countResult?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Fetch transactions with join to accounts
  const transactions = database
    .select({
      id: schema.transactions.id,
      accountId: schema.transactions.accountId,
      externalId: schema.transactions.externalId,
      postedAt: schema.transactions.postedAt,
      overrideMonth: schema.transactions.overrideMonth,
      name: schema.transactions.name,
      merchant: schema.transactions.merchant,
      amount: schema.transactions.amount,
      category: schema.transactions.category,
      pending: schema.transactions.pending,
      notes: schema.transactions.notes,
      categoryOverride: schema.transactions.categoryOverride,
      isTransfer: schema.transactions.isTransfer,
      reviewState: schema.transactions.reviewState,
      accountName: schema.accounts.name,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id)
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.transactions.postedAt), desc(schema.transactions.id))
    .limit(limit)
    .offset(offset)
    .all();

  return {
    transactions,
    total,
    page,
    limit,
    totalPages,
  };
}

/**
 * Build SQL WHERE conditions from filter params.
 */
function buildWhereConditions(filters: TransactionFilters) {
  const conditions = [];

  conditions.push(
    notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES])
  );
  conditions.push(eq(schema.transactions.isExcluded, false));
  conditions.push(
    sql`lower(coalesce(${schema.transactions.category}, '')) <> 'income'`
  );

  if (filters.dateFrom) {
    conditions.push(gte(schema.transactions.postedAt, filters.dateFrom));
  }

  if (filters.dateTo) {
    conditions.push(lte(schema.transactions.postedAt, filters.dateTo));
  }

  if (filters.effectiveMonth) {
    conditions.push(sql`${effectiveTransactionMonth} = ${filters.effectiveMonth}`);
  }

  if (filters.category) {
    const categories = Array.isArray(filters.category)
      ? filters.category
      : [filters.category];
    if (categories.length === 1) {
      conditions.push(eq(schema.transactions.category, categories[0]));
    } else if (categories.length > 1) {
      conditions.push(inArray(schema.transactions.category, categories));
    }
  }

  if (filters.accountId) {
    conditions.push(eq(schema.transactions.accountId, filters.accountId));
  }

  if (filters.search) {
    const searchTerm = `%${filters.search}%`;
    conditions.push(
      or(
        like(schema.transactions.name, searchTerm),
        like(schema.transactions.merchant, searchTerm),
        like(schema.transactions.notes, searchTerm)
      )!
    );
  }

  if (filters.needsReview) {
    conditions.push(eq(schema.transactions.isTransfer, false));
    conditions.push(isNull(schema.transactions.category));
    conditions.push(sql`${schema.transactions.amount} > 0`);
  }

  return conditions;
}

/**
 * Get all accounts for use in filter dropdowns.
 * Returns id, name, and type.
 */
export function getAccountsForFilter(
  database: DB
): Array<{ id: number; name: string; type: string }> {
  return database
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
      type: schema.accounts.type,
    })
    .from(schema.accounts)
    .orderBy(schema.accounts.name)
    .all();
}

// ─── CRUD Operations ──────────────────────────────────────────────────

export interface CreateTransactionInput {
  accountId: number;
  postedAt: string; // YYYY-MM-DD
  overrideMonth?: string | null; // YYYY-MM
  name: string;
  amount: number; // cents (positive = expense, negative = income)
  category?: string;
  notes?: string;
  isTransfer: boolean;
}

/**
 * Create a new transaction.
 */
export function createTransaction(
  database: DB,
  input: CreateTransactionInput
) {
  return database
    .insert(schema.transactions)
    .values({
      accountId: input.accountId,
      postedAt: input.postedAt,
      overrideMonth: input.overrideMonth ?? null,
      name: input.name,
      amount: input.amount,
      category: input.category ?? null,
      notes: input.notes ?? null,
      isTransfer: input.isTransfer,
      isExcluded: shouldExcludePassiveIncomeTransaction({
        name: input.name,
        category: input.category ?? null,
        amount: input.amount,
      }),
      pending: false,
      reviewState: "none",
    })
    .returning()
    .get();
}

export interface UpdateTransactionInput {
  postedAt?: string;
  overrideMonth?: string | null;
  name?: string;
  amount?: number;
  category?: string | null;
  notes?: string | null;
  isTransfer?: boolean;
  accountId?: number;
}

/**
 * Update an existing transaction. Returns updated row or null if not found.
 */
export function updateTransaction(
  database: DB,
  id: number,
  input: UpdateTransactionInput
) {
  const existing = database
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .get();

  if (!existing) return null;

  const updates: Record<string, unknown> = {};
  const nextName = input.name ?? existing.name;
  const nextAmount = input.amount ?? existing.amount;
  const nextMerchant = existing.merchant;
  if (input.postedAt !== undefined) updates.postedAt = input.postedAt;
  if (input.overrideMonth !== undefined) updates.overrideMonth = input.overrideMonth;
  if (input.name !== undefined) updates.name = input.name;
  if (input.amount !== undefined) updates.amount = input.amount;
  if (input.category !== undefined) updates.category = input.category;
  if (input.notes !== undefined) updates.notes = input.notes;
  if (input.isTransfer !== undefined) updates.isTransfer = input.isTransfer;
  if (input.accountId !== undefined) updates.accountId = input.accountId;
  updates.isExcluded = shouldExcludePassiveIncomeTransaction({
    name: nextName,
    merchant: nextMerchant,
    category:
      input.category !== undefined
        ? input.category
        : (existing.category ?? null),
    amount: nextAmount,
  });

  if (Object.keys(updates).length > 0) {
    database
      .update(schema.transactions)
      .set(updates)
      .where(eq(schema.transactions.id, id))
      .run();
  }

  return database
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .get()!;
}

/**
 * Delete a transaction and its splits. Returns true if found and deleted.
 */
export function deleteTransaction(database: DB, id: number): boolean {
  const existing = database
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .get();

  if (!existing) return false;

  // Delete splits first (FK constraint)
  database
    .delete(schema.transactionSplits)
    .where(eq(schema.transactionSplits.transactionId, id))
    .run();

  // Delete the transaction
  database
    .delete(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .run();

  return true;
}

/**
 * Get a single transaction by ID with account name.
 */
export function getTransactionById(
  database: DB,
  id: number
): TransactionWithAccount | null {
  const row = database
    .select({
      id: schema.transactions.id,
      accountId: schema.transactions.accountId,
      externalId: schema.transactions.externalId,
      postedAt: schema.transactions.postedAt,
      overrideMonth: schema.transactions.overrideMonth,
      name: schema.transactions.name,
      merchant: schema.transactions.merchant,
      amount: schema.transactions.amount,
      category: schema.transactions.category,
      pending: schema.transactions.pending,
      notes: schema.transactions.notes,
      categoryOverride: schema.transactions.categoryOverride,
      isTransfer: schema.transactions.isTransfer,
      reviewState: schema.transactions.reviewState,
      accountName: schema.accounts.name,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id)
    )
    .where(eq(schema.transactions.id, id))
    .get();

  return row ?? null;
}

// ─── Transaction Splits ──────────────────────────────────────────────

export interface SplitInput {
  category: string;
  amount: number; // cents
}

export interface TransactionSplit {
  id: number;
  transactionId: number;
  category: string;
  amount: number;
}

/**
 * Create or replace splits for a transaction.
 * Deletes existing splits and inserts new ones.
 */
export function createOrUpdateSplits(
  database: DB,
  transactionId: number,
  splits: SplitInput[]
): TransactionSplit[] {
  // Delete existing splits
  database
    .delete(schema.transactionSplits)
    .where(eq(schema.transactionSplits.transactionId, transactionId))
    .run();

  if (splits.length === 0) return [];

  // Insert new splits
  database
    .insert(schema.transactionSplits)
    .values(
      splits.map((s) => ({
        transactionId,
        category: s.category,
        amount: s.amount,
      }))
    )
    .run();

  return database
    .select()
    .from(schema.transactionSplits)
    .where(eq(schema.transactionSplits.transactionId, transactionId))
    .all();
}

/**
 * Get all splits for a transaction.
 */
export function getTransactionSplits(
  database: DB,
  transactionId: number
): TransactionSplit[] {
  return database
    .select()
    .from(schema.transactionSplits)
    .where(eq(schema.transactionSplits.transactionId, transactionId))
    .all();
}
