import { eq, and, gte, lte, like, or, desc, sql, inArray } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";

type DB = ReturnType<typeof drizzle>;

export interface TransactionWithAccount {
  id: number;
  accountId: number;
  externalId: string | null;
  postedAt: string;
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
  category?: string | string[];
  accountId?: number;
  search?: string;
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

  if (filters.dateFrom) {
    conditions.push(gte(schema.transactions.postedAt, filters.dateFrom));
  }

  if (filters.dateTo) {
    conditions.push(lte(schema.transactions.postedAt, filters.dateTo));
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
