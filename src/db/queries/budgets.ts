import { eq, and, gte, lt } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";

type DB = ReturnType<typeof drizzle>;

// ─── Types ──────────────────────────────────────────────────────────────

export interface BudgetRow {
  id: number;
  month: string;
  category: string;
  amount: number; // cents
}

export interface BudgetWithSpending {
  category: string;
  budgeted: number; // cents
  spent: number; // cents (positive = expense)
  remaining: number; // cents (positive = under, negative = over)
  categoryColor: string | null;
}

export interface UnbudgetedSpending {
  category: string;
  spent: number; // cents
  categoryColor: string | null;
}

export interface BudgetSummary {
  budgets: BudgetWithSpending[];
  unbudgeted: UnbudgetedSpending[];
  totalBudgeted: number; // cents
  totalSpent: number; // cents
  totalRemaining: number; // cents
}

// ─── Query Functions ────────────────────────────────────────────────────

/**
 * Get budgets for a month with actual spending calculated from transactions.
 * Spending = sum of non-transfer positive-amount transactions + split amounts
 * for the given month and category.
 */
export function getBudgetsForMonth(database: DB, month: string): BudgetSummary {
  // Validate month format YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { budgets: [], unbudgeted: [], totalBudgeted: 0, totalSpent: 0, totalRemaining: 0 };
  }

  // Calculate date range for the month
  const [year, monthNum] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  // Get the first day of next month
  const nextMonth = monthNum === 12 ? `${year + 1}-01` : `${year}-${String(monthNum + 1).padStart(2, "0")}`;
  const endDate = `${nextMonth}-01`;

  // Get all budgets for this month
  const budgetRows = database
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.month, month))
    .all();

  // Get all category info for color lookup
  const allCategories = database
    .select({
      name: schema.categories.name,
      color: schema.categories.color,
    })
    .from(schema.categories)
    .all();

  const categoryColorMap = new Map(allCategories.map((c) => [c.name, c.color]));

  // Get spending per category for non-transfer, non-split transactions
  // (transactions that have NO splits use their own category)
  // (transactions that HAVE splits use split categories)
  const spendingByCategory = getSpendingByCategory(database, startDate, endDate);

  // Build budget rows with spending
  const budgetedCategories = new Set<string>();
  const budgets: BudgetWithSpending[] = budgetRows.map((b) => {
    budgetedCategories.add(b.category);
    const spent = spendingByCategory.get(b.category) ?? 0;
    return {
      category: b.category,
      budgeted: b.amount,
      spent,
      remaining: b.amount - spent,
      categoryColor: categoryColorMap.get(b.category) ?? null,
    };
  });

  // Find unbudgeted spending (categories with transactions but no budget)
  const unbudgeted: UnbudgetedSpending[] = [];
  for (const [category, spent] of spendingByCategory) {
    if (!budgetedCategories.has(category) && spent > 0) {
      unbudgeted.push({
        category,
        spent,
        categoryColor: categoryColorMap.get(category) ?? null,
      });
    }
  }

  const totalBudgeted = budgets.reduce((sum, b) => sum + b.budgeted, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0) +
    unbudgeted.reduce((sum, u) => sum + u.spent, 0);
  const totalRemaining = totalBudgeted - budgets.reduce((sum, b) => sum + b.spent, 0);

  return { budgets, unbudgeted, totalBudgeted, totalSpent, totalRemaining };
}

/**
 * Calculate spending by category for a date range.
 * Includes split transaction portions. Excludes transfers and income.
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
      isTransfer: schema.transactions.isTransfer,
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

  // Get all splits for these transactions
  const txnIds = txns.map((t) => t.id);
  const splitsMap = new Map<number, Array<{ category: string; amount: number }>>();

  if (txnIds.length > 0) {
    // Get all splits in one query
    const allSplits = database
      .select()
      .from(schema.transactionSplits)
      .all();

    // Filter to relevant transaction IDs
    const relevantSplits = allSplits.filter((s) => txnIds.includes(s.transactionId));

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
      // Use split categories and amounts
      for (const split of splits) {
        const current = spendingMap.get(split.category) ?? 0;
        spendingMap.set(split.category, current + split.amount);
      }
    } else {
      // Use transaction's own category
      const category = txn.category ?? "Uncategorized";
      const current = spendingMap.get(category) ?? 0;
      spendingMap.set(category, current + txn.amount);
    }
  }

  return spendingMap;
}

// ─── Mutations ──────────────────────────────────────────────────────────

export interface UpsertBudgetInput {
  month: string;
  category: string;
  amount: number; // cents
}

/**
 * Upsert a budget (insert or update by month+category).
 */
export function upsertBudget(database: DB, input: UpsertBudgetInput): BudgetRow {
  // Check if exists
  const existing = database
    .select()
    .from(schema.budgets)
    .where(
      and(
        eq(schema.budgets.month, input.month),
        eq(schema.budgets.category, input.category)
      )
    )
    .get();

  if (existing) {
    database
      .update(schema.budgets)
      .set({ amount: input.amount })
      .where(eq(schema.budgets.id, existing.id))
      .run();

    return { ...existing, amount: input.amount };
  }

  return database
    .insert(schema.budgets)
    .values({
      month: input.month,
      category: input.category,
      amount: input.amount,
    })
    .returning()
    .get();
}

/**
 * Copy all budgets from a source month to a target month.
 * Returns the number of budgets copied, or -1 if no source budgets exist.
 */
export function copyBudgetsFromMonth(
  database: DB,
  sourceMonth: string,
  targetMonth: string
): number {
  const sourceBudgets = database
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.month, sourceMonth))
    .all();

  if (sourceBudgets.length === 0) {
    return -1;
  }

  // Upsert each budget into target month
  for (const budget of sourceBudgets) {
    upsertBudget(database, {
      month: targetMonth,
      category: budget.category,
      amount: budget.amount,
    });
  }

  return sourceBudgets.length;
}

/**
 * Delete a budget by month and category.
 */
export function deleteBudget(database: DB, month: string, category: string): boolean {
  const existing = database
    .select()
    .from(schema.budgets)
    .where(
      and(
        eq(schema.budgets.month, month),
        eq(schema.budgets.category, category)
      )
    )
    .get();

  if (!existing) return false;

  database
    .delete(schema.budgets)
    .where(eq(schema.budgets.id, existing.id))
    .run();

  return true;
}
