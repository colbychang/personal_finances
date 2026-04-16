import { eq, and, inArray, notInArray, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";
import { INVESTMENT_LIKE_ACCOUNT_TYPES } from "@/lib/account-types";
import { effectiveTransactionMonth } from "./effective-month";

type DB = ReturnType<typeof drizzle>;

// ─── Types ──────────────────────────────────────────────────────────────

export interface CategorySpendingItem {
  category: string;
  amount: number; // cents
  color: string | null;
}

export interface MonthlySpendingItem {
  month: string; // YYYY-MM
  total: number; // cents
}

export interface CategoryTransaction {
  id: number;
  postedAt: string;
  name: string;
  merchant: string | null;
  amount: number; // cents
  category: string | null;
  accountName: string;
  splitAmount: number | null; // cents, if found via split
}

// ─── Spending by Category ───────────────────────────────────────────────

/**
 * Get spending aggregated by category for a date range.
 * Excludes transfers and income (negative amounts).
 * Handles transaction splits — if a transaction has splits, uses split amounts instead.
 * Returns sorted descending by amount.
 */
export function getSpendingByCategory(
  database: DB,
  startDate: string,
  endDate: string,
  workspaceId?: number,
): CategorySpendingItem[] {
  const startMonth = startDate.slice(0, 7);
  const endMonthExclusive = endDate.slice(0, 7);
  // Get all category colors
  const allCategories = database
    .select({ name: schema.categories.name, color: schema.categories.color })
    .from(schema.categories)
    .all();
  const categoryColorMap = new Map(allCategories.map((c) => [c.name, c.color]));

  // Get all non-transfer expense transactions in the date range
  const txns = database
    .select({
      id: schema.transactions.id,
      amount: schema.transactions.amount,
      category: schema.transactions.category,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id)
    )
    .where(
      and(
        sql`${effectiveTransactionMonth} >= ${startMonth}`,
        sql`${effectiveTransactionMonth} < ${endMonthExclusive}`,
        workspaceId === undefined
          ? undefined
          : eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.isTransfer, false),
        eq(schema.transactions.isExcluded, false),
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES])
      )
    )
    .all();

  // Get splits for these transactions
  const txnIds = txns.map((t) => t.id);
  const splitsMap = new Map<number, Array<{ category: string; amount: number }>>();

  if (txnIds.length > 0) {
    const relevantSplits = database
      .select()
      .from(schema.transactionSplits)
      .where(inArray(schema.transactionSplits.transactionId, txnIds))
      .all();

    for (const split of relevantSplits) {
      if (!splitsMap.has(split.transactionId)) {
        splitsMap.set(split.transactionId, []);
      }
      splitsMap.get(split.transactionId)!.push({
        category: split.category,
        amount: split.amount,
      });
    }
  }

  // Aggregate spending by category
  const spendingMap = new Map<string, number>();

  for (const txn of txns) {
    // Skip income (negative amounts)
    if (txn.amount < 0) continue;

    const splits = splitsMap.get(txn.id);

    if (splits && splits.length > 0) {
      for (const split of splits) {
        const current = spendingMap.get(split.category) ?? 0;
        spendingMap.set(split.category, current + split.amount);
      }
    } else {
      const category = txn.category ?? "Uncategorized";
      const current = spendingMap.get(category) ?? 0;
      spendingMap.set(category, current + txn.amount);
    }
  }

  return Array.from(spendingMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      color: categoryColorMap.get(category) ?? null,
    }))
    .sort((a, b) => b.amount - a.amount);
}

// ─── Monthly Spending Trends ────────────────────────────────────────────

/**
 * Get total spending per month for the last N months.
 * Excludes transfers and income. Returns sorted oldest to newest (for chart display).
 */
export function getMonthlySpendingTrends(
  database: DB,
  months: number,
  workspaceId?: number,
): MonthlySpendingItem[] {
  // Calculate the date range
  const now = new Date();

  // Build list of months we need data for
  const monthList: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthList.push(m);
  }

  const lastMonth = monthList[monthList.length - 1];
  const [lastYear, lastMon] = lastMonth.split("-").map(Number);
  const nextMon = lastMon === 12 ? `${lastYear + 1}-01` : `${lastYear}-${String(lastMon + 1).padStart(2, "0")}`;
  const endMonthExclusive = nextMon;

  // Get all non-transfer expense transactions in the range
  const txns = database
    .select({
      id: schema.transactions.id,
      postedAt: schema.transactions.postedAt,
      overrideMonth: schema.transactions.overrideMonth,
      amount: schema.transactions.amount,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id)
    )
    .where(
      and(
        sql`${effectiveTransactionMonth} >= ${monthList[0]}`,
        sql`${effectiveTransactionMonth} < ${endMonthExclusive}`,
        workspaceId === undefined
          ? undefined
          : eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.isTransfer, false),
        eq(schema.transactions.isExcluded, false),
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES])
      )
    )
    .all();

  // Aggregate by month
  const monthTotals = new Map<string, number>();
  for (const m of monthList) {
    monthTotals.set(m, 0);
  }

  for (const txn of txns) {
    // Skip income
    if (txn.amount < 0) continue;

    const txnMonth = txn.overrideMonth ?? txn.postedAt.slice(0, 7); // YYYY-MM
    if (monthTotals.has(txnMonth)) {
      monthTotals.set(txnMonth, monthTotals.get(txnMonth)! + txn.amount);
    }
  }

  return monthList.map((m) => ({
    month: m,
    total: monthTotals.get(m) ?? 0,
  }));
}

// ─── Category Drill-Down ────────────────────────────────────────────────

/**
 * Get individual transactions for a specific category within a date range.
 * Includes transactions that directly have the category AND transactions
 * where the category appears in their splits.
 * Returns sorted by date descending (newest first).
 */
export function getCategoryTransactions(
  database: DB,
  category: string,
  startDate: string,
  endDate: string,
  workspaceId?: number,
): CategoryTransaction[] {
  const startMonth = startDate.slice(0, 7);
  const endMonthExclusive = endDate.slice(0, 7);
  // 1. Direct category matches (non-transfer, positive amount only)
  const directTxns = database
    .select({
      id: schema.transactions.id,
      postedAt: schema.transactions.postedAt,
      name: schema.transactions.name,
      merchant: schema.transactions.merchant,
      amount: schema.transactions.amount,
      category: schema.transactions.category,
      accountName: schema.accounts.name,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id)
    )
    .where(
      and(
        eq(schema.transactions.category, category),
        sql`${effectiveTransactionMonth} >= ${startMonth}`,
        sql`${effectiveTransactionMonth} < ${endMonthExclusive}`,
        workspaceId === undefined
          ? undefined
          : eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.isTransfer, false),
        eq(schema.transactions.isExcluded, false),
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES])
      )
    )
    .all();

  // Check if any of these direct transactions have splits
  // If they do, they shouldn't count as "direct" — we'll handle them via splits
  const directIds = directTxns.map((t) => t.id);
  const directWithSplits = new Set<number>();

  if (directIds.length > 0) {
    const splitCheck = database
      .select({ transactionId: schema.transactionSplits.transactionId })
      .from(schema.transactionSplits)
      .where(inArray(schema.transactionSplits.transactionId, directIds))
      .all();
    for (const s of splitCheck) {
      directWithSplits.add(s.transactionId);
    }
  }

  // 2. Split category matches — find transactions that have a split with this category
  const splitMatches = database
    .select({
      transactionId: schema.transactionSplits.transactionId,
      splitAmount: schema.transactionSplits.amount,
    })
    .from(schema.transactionSplits)
    .where(eq(schema.transactionSplits.category, category))
    .all();

  const splitTxnIds = splitMatches.map((s) => s.transactionId);
  const splitAmountMap = new Map<number, number>();
  for (const s of splitMatches) {
    splitAmountMap.set(s.transactionId, s.splitAmount);
  }

  let splitTxns: typeof directTxns = [];
  if (splitTxnIds.length > 0) {
    splitTxns = database
      .select({
        id: schema.transactions.id,
        postedAt: schema.transactions.postedAt,
        name: schema.transactions.name,
        merchant: schema.transactions.merchant,
        amount: schema.transactions.amount,
        category: schema.transactions.category,
        accountName: schema.accounts.name,
      })
      .from(schema.transactions)
      .innerJoin(
        schema.accounts,
        eq(schema.transactions.accountId, schema.accounts.id)
      )
      .where(
        and(
          inArray(schema.transactions.id, splitTxnIds),
          sql`${effectiveTransactionMonth} >= ${startMonth}`,
          sql`${effectiveTransactionMonth} < ${endMonthExclusive}`,
          workspaceId === undefined
            ? undefined
            : eq(schema.transactions.workspaceId, workspaceId),
          eq(schema.transactions.isTransfer, false),
          eq(schema.transactions.isExcluded, false),
          notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES])
        )
      )
      .all();
  }

  // Merge results, avoiding duplicates
  const seenIds = new Set<number>();
  const result: CategoryTransaction[] = [];

  // Add direct transactions (those without splits)
  for (const txn of directTxns) {
    if (directWithSplits.has(txn.id)) continue; // Will be handled via splits
    if (seenIds.has(txn.id)) continue;
    seenIds.add(txn.id);
    result.push({
      ...txn,
      splitAmount: null,
    });
  }

  // Add split transactions
  for (const txn of splitTxns) {
    if (seenIds.has(txn.id)) continue;
    seenIds.add(txn.id);
    result.push({
      ...txn,
      splitAmount: splitAmountMap.get(txn.id) ?? null,
    });
  }

  // Sort by date descending (newest first)
  result.sort((a, b) => b.postedAt.localeCompare(a.postedAt));

  return result;
}
