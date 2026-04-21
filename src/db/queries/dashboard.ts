import { eq, and, desc, asc, inArray, notInArray, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "../schema";
import { INVESTMENT_LIKE_ACCOUNT_TYPES } from "@/lib/account-types";
import { effectiveTransactionMonth } from "./effective-month";
import { getAllCategories } from "./categories";

type DB = AppDatabase;

export interface CategorySpending {
  category: string;
  amount: number;
  color: string | null;
}

export interface RecentTransaction {
  id: number;
  postedAt: string;
  name: string;
  amount: number;
  category: string | null;
  isTransfer: boolean;
  accountName: string;
}

export interface BudgetStatusItem {
  category: string;
  budgeted: number;
  spent: number;
  percentage: number;
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
  current: number;
  previous: number | null;
  change: number | null;
}

export interface MonthComparison {
  category: string;
  currentMonth: number;
  previousMonth: number;
  change: number;
  color: string | null;
}

export interface NetWorthHistoryPoint {
  month: string;
  netWorth: number;
}

export interface DashboardData {
  totalSpending: number;
  spendingByCategory: CategorySpending[];
  budgetStatus: BudgetStatusSummary;
  recentTransactions: RecentTransaction[];
  netWorth: NetWorthTrend;
  netWorthHistory: NetWorthHistoryPoint[];
  monthComparison: MonthComparison[];
}

function getPreviousMonth(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  if (monthNum === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(monthNum - 1).padStart(2, "0")}`;
}

async function getSpendingByCategory(
  database: DB,
  month: string,
  workspaceId?: number,
): Promise<Map<string, number>> {
  const spendingMap = new Map<string, number>();

  const txns = await database
    .select({
      id: schema.transactions.id,
      amount: schema.transactions.amount,
      category: schema.transactions.category,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id),
    )
    .where(
      and(
        sql`${effectiveTransactionMonth} = ${month}`,
        workspaceId === undefined
          ? undefined
          : eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.isTransfer, false),
        eq(schema.transactions.isExcluded, false),
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES]),
      ),
    );

  const txnIds = txns.map((t) => t.id);
  const splitsMap = new Map<number, Array<{ category: string; amount: number }>>();

  if (txnIds.length > 0) {
    const relevantSplits = await database
      .select()
      .from(schema.transactionSplits)
      .where(inArray(schema.transactionSplits.transactionId, txnIds));

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

  for (const txn of txns) {
    if (txn.amount < 0) continue;

    const splits = splitsMap.get(txn.id);
    if (splits && splits.length > 0) {
      for (const split of splits) {
        const current = spendingMap.get(split.category) ?? 0;
        spendingMap.set(split.category, current + split.amount);
      }
      continue;
    }

    const category = txn.category ?? "Uncategorized";
    const current = spendingMap.get(category) ?? 0;
    spendingMap.set(category, current + txn.amount);
  }

  return spendingMap;
}

export async function getDashboardData(
  database: DB,
  month: string,
  workspaceId?: number,
): Promise<DashboardData> {
  const prevMonth = getPreviousMonth(month);

  const allCategoriesPromise = getAllCategories(database, workspaceId);
  const currentSpendingPromise = getSpendingByCategory(database, month, workspaceId);
  const budgetRowsPromise = database
    .select()
    .from(schema.budgets)
    .where(
      and(
        eq(schema.budgets.month, month),
        workspaceId === undefined ? undefined : eq(schema.budgets.workspaceId, workspaceId),
      ),
    );
  const recentTransactionsPromise = database
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
      eq(schema.transactions.accountId, schema.accounts.id),
    )
    .where(
      and(
        workspaceId === undefined
          ? undefined
          : eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.isExcluded, false),
        sql`lower(coalesce(${schema.transactions.category}, '')) <> 'income'`,
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES]),
      ),
    )
    .orderBy(desc(schema.transactions.postedAt), desc(schema.transactions.id))
    .limit(10);
  const accountsPromise = database
    .select({
      balanceCurrent: schema.accounts.balanceCurrent,
      isAsset: schema.accounts.isAsset,
    })
    .from(schema.accounts)
    .where(
      workspaceId === undefined ? undefined : eq(schema.accounts.workspaceId, workspaceId),
    );
  const prevSnapshotPromise = database
    .select()
    .from(schema.snapshots)
    .where(
      and(
        eq(schema.snapshots.month, prevMonth),
        workspaceId === undefined ? undefined : eq(schema.snapshots.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  const prevSpendingPromise = getSpendingByCategory(database, prevMonth, workspaceId);
  const netWorthHistoryPromise = database
    .select({
      month: schema.snapshots.month,
      netWorth: schema.snapshots.netWorth,
    })
    .from(schema.snapshots)
    .where(
      workspaceId === undefined ? undefined : eq(schema.snapshots.workspaceId, workspaceId),
    )
    .orderBy(asc(schema.snapshots.month));

  const [
    allCategories,
    currentSpending,
    budgetRows,
    recentTransactions,
    accounts,
    prevSnapshotRows,
    prevSpending,
    netWorthHistory,
  ] = await Promise.all([
    allCategoriesPromise,
    currentSpendingPromise,
    budgetRowsPromise,
    recentTransactionsPromise,
    accountsPromise,
    prevSnapshotPromise,
    prevSpendingPromise,
    netWorthHistoryPromise,
  ]);

  const categoryColorMap = new Map<string, string | null>(
    allCategories.map((c) => [c.name, c.color]),
  );

  const spendingByCategory: CategorySpending[] = Array.from(currentSpending.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      color: categoryColorMap.get(category) ?? null,
    }))
    .sort((a, b) => b.amount - a.amount);

  const totalSpending = spendingByCategory.reduce((sum, c) => sum + c.amount, 0);

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
  const [prevSnapshot] = prevSnapshotRows;

  const netWorth: NetWorthTrend = {
    current: currentNetWorth,
    previous: prevSnapshot?.netWorth ?? null,
    change: prevSnapshot ? currentNetWorth - prevSnapshot.netWorth : null,
  };

  const allCategoryNames = new Set<string>([
    ...currentSpending.keys(),
    ...prevSpending.keys(),
  ]);

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
