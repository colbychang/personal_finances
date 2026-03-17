import { eq, and, gte, lt, desc, asc, inArray } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";

type DB = ReturnType<typeof drizzle>;

// ─── Types ──────────────────────────────────────────────────────────────

export interface CategorySpending {
  category: string;
  amount: number; // cents
  color: string | null;
}

export interface RecentTransaction {
  id: number;
  postedAt: string;
  name: string;
  amount: number; // cents
  category: string | null;
  isTransfer: boolean;
  accountName: string;
}

export interface BudgetStatusItem {
  category: string;
  budgeted: number; // cents
  spent: number; // cents
  percentage: number; // 0-100+
  status: "on-track" | "approaching" | "over-budget";
  color: string | null;
}

export interface BudgetStatusSummary {
  onTrack: number;
  approaching: number;
  overBudget: number;
  total: number;
  items: BudgetStatusItem[];
}

export interface NetWorthTrend {
  current: number; // cents (assets - liabilities from account balances)
  previous: number | null; // cents (from previous month snapshot)
  change: number | null; // cents (current - previous)
}

export interface MonthComparison {
  category: string;
  currentMonth: number; // cents
  previousMonth: number; // cents
  change: number; // cents (current - previous)
  color: string | null;
}

export interface NetWorthHistoryPoint {
  month: string;
  netWorth: number; // cents
}

export interface DashboardData {
  totalSpending: number; // cents
  spendingByCategory: CategorySpending[];
  budgetStatus: BudgetStatusSummary;
  recentTransactions: RecentTransaction[];
  netWorth: NetWorthTrend;
  netWorthHistory: NetWorthHistoryPoint[];
  monthComparison: MonthComparison[];
}

// ─── Helper Functions ───────────────────────────────────────────────────

/**
 * Calculate the date range for a YYYY-MM month string.
 */
function getMonthRange(month: string): { startDate: string; endDate: string } {
  const [year, monthNum] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const nextMonth =
    monthNum === 12
      ? `${year + 1}-01`
      : `${year}-${String(monthNum + 1).padStart(2, "0")}`;
  const endDate = `${nextMonth}-01`;
  return { startDate, endDate };
}

/**
 * Get the previous month string for a YYYY-MM month.
 */
function getPreviousMonth(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  if (monthNum === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(monthNum - 1).padStart(2, "0")}`;
}

/**
 * Get spending by category for a date range.
 * Excludes transfers and income (negative amounts).
 * Handles transaction splits.
 */
function getSpendingByCategory(
  database: DB,
  startDate: string,
  endDate: string
): Map<string, number> {
  const spendingMap = new Map<string, number>();

  // Get all non-transfer transactions in the date range
  const txns = database
    .select({
      id: schema.transactions.id,
      amount: schema.transactions.amount,
      category: schema.transactions.category,
    })
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.postedAt, startDate),
        lt(schema.transactions.postedAt, endDate),
        eq(schema.transactions.isTransfer, false)
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

  // Process each transaction
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

  return spendingMap;
}

// ─── Main Query ─────────────────────────────────────────────────────────

/**
 * Get all dashboard data for a given month.
 */
export function getDashboardData(database: DB, month: string): DashboardData {
  // Get all category info for color lookup
  const allCategories = database
    .select({ name: schema.categories.name, color: schema.categories.color })
    .from(schema.categories)
    .all();
  const categoryColorMap = new Map(allCategories.map((c) => [c.name, c.color]));

  const { startDate, endDate } = getMonthRange(month);
  const prevMonth = getPreviousMonth(month);
  const prevRange = getMonthRange(prevMonth);

  // ─── 1. Spending by Category (current month) ─────────────────────
  const currentSpending = getSpendingByCategory(database, startDate, endDate);

  const spendingByCategory: CategorySpending[] = Array.from(currentSpending.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      color: categoryColorMap.get(category) ?? null,
    }))
    .sort((a, b) => b.amount - a.amount);

  const totalSpending = spendingByCategory.reduce((sum, c) => sum + c.amount, 0);

  // ─── 2. Budget Status ────────────────────────────────────────────
  const budgetRows = database
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.month, month))
    .all();

  const budgetItems: BudgetStatusItem[] = budgetRows.map((b) => {
    const spent = currentSpending.get(b.category) ?? 0;
    const percentage = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
    let status: BudgetStatusItem["status"] = "on-track";
    if (percentage >= 100) {
      status = "over-budget";
    } else if (percentage >= 85) {
      status = "approaching";
    }
    return {
      category: b.category,
      budgeted: b.amount,
      spent,
      percentage,
      status,
      color: categoryColorMap.get(b.category) ?? null,
    };
  });

  const budgetStatus: BudgetStatusSummary = {
    onTrack: budgetItems.filter((b) => b.status === "on-track").length,
    approaching: budgetItems.filter((b) => b.status === "approaching").length,
    overBudget: budgetItems.filter((b) => b.status === "over-budget").length,
    total: budgetItems.length,
    items: budgetItems,
  };

  // ─── 3. Recent Transactions ──────────────────────────────────────
  const recentTransactions: RecentTransaction[] = database
    .select({
      id: schema.transactions.id,
      postedAt: schema.transactions.postedAt,
      name: schema.transactions.name,
      amount: schema.transactions.amount,
      category: schema.transactions.category,
      isTransfer: schema.transactions.isTransfer,
      accountName: schema.accounts.name,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id)
    )
    .orderBy(desc(schema.transactions.postedAt), desc(schema.transactions.id))
    .limit(10)
    .all();

  // ─── 4. Net Worth ────────────────────────────────────────────────
  const accounts = database
    .select({
      balanceCurrent: schema.accounts.balanceCurrent,
      isAsset: schema.accounts.isAsset,
    })
    .from(schema.accounts)
    .all();

  let totalAssets = 0;
  let totalLiabilities = 0;
  for (const acct of accounts) {
    if (acct.isAsset) {
      totalAssets += acct.balanceCurrent;
    } else {
      totalLiabilities += acct.balanceCurrent;
    }
  }
  const currentNetWorth = totalAssets - totalLiabilities;

  // Get previous month snapshot
  const prevSnapshot = database
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.month, prevMonth))
    .get();

  const netWorth: NetWorthTrend = {
    current: currentNetWorth,
    previous: prevSnapshot?.netWorth ?? null,
    change: prevSnapshot ? currentNetWorth - prevSnapshot.netWorth : null,
  };

  // ─── 5. Month-over-Month Comparison ──────────────────────────────
  const prevSpending = getSpendingByCategory(
    database,
    prevRange.startDate,
    prevRange.endDate
  );

  // Merge all categories from both months
  const allCategoryNames = new Set<string>();
  for (const key of currentSpending.keys()) allCategoryNames.add(key);
  for (const key of prevSpending.keys()) allCategoryNames.add(key);

  const monthComparison: MonthComparison[] = Array.from(allCategoryNames)
    .map((category) => {
      const currentAmt = currentSpending.get(category) ?? 0;
      const previousAmt = prevSpending.get(category) ?? 0;
      return {
        category,
        currentMonth: currentAmt,
        previousMonth: previousAmt,
        change: currentAmt - previousAmt,
        color: categoryColorMap.get(category) ?? null,
      };
    })
    .sort((a, b) => b.currentMonth - a.currentMonth);

  // ─── 6. Net Worth History (for sparkline) ─────────────────────────
  const netWorthHistory: NetWorthHistoryPoint[] = database
    .select({
      month: schema.snapshots.month,
      netWorth: schema.snapshots.netWorth,
    })
    .from(schema.snapshots)
    .orderBy(asc(schema.snapshots.month))
    .all();

  return {
    totalSpending,
    spendingByCategory,
    budgetStatus,
    recentTransactions,
    netWorth,
    netWorthHistory,
    monthComparison,
  };
}
