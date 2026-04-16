import {
  eq,
  and,
  inArray,
  desc,
  sql,
  isNull,
  notInArray,
} from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";
import { INVESTMENT_LIKE_ACCOUNT_TYPES } from "@/lib/account-types";
import { effectiveTransactionMonth } from "./effective-month";

type DB = ReturnType<typeof drizzle>;

// ─── Types ──────────────────────────────────────────────────────────────

export interface BudgetRow {
  id: number;
  workspaceId?: number | null;
  month: string;
  category: string;
  amount: number; // cents
}

export interface BudgetTemplateRow {
  id: number;
  workspaceId?: number | null;
  category: string;
  amount: number; // cents
  updatedAt: string;
}

export interface BudgetTemplateInput {
  category: string;
  amount: number; // cents
}

export interface BudgetWithSpending {
  category: string;
  budgeted: number; // cents
  spent: number; // cents (positive = expense)
  remaining: number; // cents (positive = under, negative = over)
  isInheritedDefault: boolean;
  categoryColor: string | null;
  transactions: CategoryTransaction[];
}

export interface UnbudgetedSpending {
  category: string;
  spent: number; // cents
  categoryColor: string | null;
  transactions: CategoryTransaction[];
}

export interface BudgetSummary {
  budgets: BudgetWithSpending[];
  unbudgeted: UnbudgetedSpending[];
  totalBudgeted: number; // cents
  totalSpent: number; // cents
  totalRemaining: number; // cents
  reviewSummary: ReviewSummary;
}

export interface ReviewTransaction {
  id: number;
  postedAt: string;
  name: string;
  amount: number;
  accountName: string;
}

export interface ReviewSummary {
  uncategorizedCount: number;
  uncategorizedAmount: number;
  transactions: ReviewTransaction[];
}

export interface CategoryTransaction {
  id: number;
  postedAt: string;
  name: string;
  amount: number;
  originalAmount: number;
  accountName: string;
  isSplit: boolean;
}

// ─── Query Functions ────────────────────────────────────────────────────

/**
 * Get budgets for a month with actual spending calculated from transactions.
 * Spending = net sum of categorized non-transfer transactions + split amounts
 * for the given month and category.
 */
export function getBudgetsForMonth(
  database: DB,
  month: string,
  workspaceId?: number,
): BudgetSummary {
  // Validate month format YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return {
      budgets: [],
      unbudgeted: [],
      totalBudgeted: 0,
      totalSpent: 0,
      totalRemaining: 0,
      reviewSummary: {
        uncategorizedCount: 0,
        uncategorizedAmount: 0,
        transactions: [],
      },
    };
  }

  // Get all explicit budgets for this month
  const monthBudgetRows = database
    .select()
    .from(schema.budgets)
    .where(
      and(
        eq(schema.budgets.month, month),
        workspaceId === undefined
          ? undefined
          : eq(schema.budgets.workspaceId, workspaceId),
      ),
    )
    .all();

  // Pull in default/template budgets for categories without a month override.
  const templateRows = database
    .select()
    .from(schema.budgetTemplates)
    .where(
      workspaceId === undefined
        ? undefined
        : eq(schema.budgetTemplates.workspaceId, workspaceId),
    )
    .all();
  const budgetedCategoriesFromMonth = new Set(
    monthBudgetRows.map((budget) => budget.category)
  );
  const budgetRows = [
    ...monthBudgetRows,
    ...templateRows
      .filter((template) => !budgetedCategoriesFromMonth.has(template.category))
      .map((template) => ({
        id: -template.id,
        workspaceId: template.workspaceId,
        month,
        category: template.category,
        amount: template.amount,
      })),
  ];

  // Get all category info for color lookup
  const allCategories = database
    .select({
      name: schema.categories.name,
      color: schema.categories.color,
    })
    .from(schema.categories)
    .all();

  const categoryColorMap = new Map(allCategories.map((c) => [c.name, c.color]));

  const { spendingByCategory, transactionsByCategory } =
    getCategorySpendingDetails(database, month, workspaceId);

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
      isInheritedDefault: b.id < 0,
      categoryColor: categoryColorMap.get(b.category) ?? null,
      transactions: transactionsByCategory.get(b.category) ?? [],
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
        transactions: transactionsByCategory.get(category) ?? [],
      });
    }
  }

  const totalBudgeted = budgets.reduce((sum, b) => sum + b.budgeted, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0) +
    unbudgeted.reduce((sum, u) => sum + u.spent, 0);
  const totalRemaining = totalBudgeted - budgets.reduce((sum, b) => sum + b.spent, 0);

  const uncategorizedSummary = database
    .select({
      count: sql<number>`count(*)`,
      amount: sql<number>`coalesce(sum(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id)
    )
    .where(
      and(
        sql`${effectiveTransactionMonth} = ${month}`,
        workspaceId === undefined
          ? undefined
          : eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.isTransfer, false),
        eq(schema.transactions.isExcluded, false),
        isNull(schema.transactions.category),
        sql`${schema.transactions.amount} > 0`,
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES])
      )
    )
    .get();

  const reviewTransactions = database
    .select({
      id: schema.transactions.id,
      postedAt: schema.transactions.postedAt,
      name: schema.transactions.name,
      amount: schema.transactions.amount,
      accountName: schema.accounts.name,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id)
    )
    .where(
      and(
        sql`${effectiveTransactionMonth} = ${month}`,
        workspaceId === undefined
          ? undefined
          : eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.isTransfer, false),
        eq(schema.transactions.isExcluded, false),
        isNull(schema.transactions.category),
        sql`${schema.transactions.amount} > 0`,
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES])
      )
    )
    .orderBy(desc(schema.transactions.postedAt), desc(schema.transactions.id))
    .limit(5)
    .all();

  return {
    budgets,
    unbudgeted,
    totalBudgeted,
    totalSpent,
    totalRemaining,
    reviewSummary: {
      uncategorizedCount: uncategorizedSummary?.count ?? 0,
      uncategorizedAmount: uncategorizedSummary?.amount ?? 0,
      transactions: reviewTransactions,
    },
  };
}

/**
 * Calculate spending by category for a date range.
 * Includes split transaction portions. Excludes transfers.
 * Negative categorized transactions reduce the category's net spending.
 */
function getCategorySpendingDetails(
  database: DB,
  month: string,
  workspaceId?: number,
): {
  spendingByCategory: Map<string, number>;
  transactionsByCategory: Map<string, CategoryTransaction[]>;
} {
  const spendingMap = new Map<string, number>();
  const transactionsByCategory = new Map<string, CategoryTransaction[]>();

  // Get all non-transfer transactions in the date range
  const txns = database
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
    .where(
      and(
        sql`${effectiveTransactionMonth} = ${month}`,
        workspaceId === undefined
          ? undefined
          : eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.isTransfer, false),
        eq(schema.transactions.isExcluded, false),
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES])
      )
    )
    .all();

  // Get splits for these transactions using SQL-level filtering
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
    const splits = splitsMap.get(txn.id);

    if (splits && splits.length > 0) {
      // Use split categories and amounts
      for (const split of splits) {
        const current = spendingMap.get(split.category) ?? 0;
        spendingMap.set(split.category, current + split.amount);
        if (!transactionsByCategory.has(split.category)) {
          transactionsByCategory.set(split.category, []);
        }
        transactionsByCategory.get(split.category)!.push({
          id: txn.id,
          postedAt: txn.postedAt,
          name: txn.name,
          amount: split.amount,
          originalAmount: txn.amount,
          accountName: txn.accountName,
          isSplit: true,
        });
      }
    } else {
      // Use transaction's own category
      if (!txn.category) {
        continue;
      }

      const category = txn.category;
      const current = spendingMap.get(category) ?? 0;
      spendingMap.set(category, current + txn.amount);
      if (!transactionsByCategory.has(category)) {
        transactionsByCategory.set(category, []);
      }
      transactionsByCategory.get(category)!.push({
        id: txn.id,
        postedAt: txn.postedAt,
        name: txn.name,
        amount: txn.amount,
        originalAmount: txn.amount,
        accountName: txn.accountName,
        isSplit: false,
      });
    }
  }

  for (const transactions of transactionsByCategory.values()) {
    transactions.sort((left, right) => {
      if (left.postedAt !== right.postedAt) {
        return left.postedAt < right.postedAt ? 1 : -1;
      }
      return right.id - left.id;
    });
  }

  return {
    spendingByCategory: spendingMap,
    transactionsByCategory,
  };
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
  return upsertBudgetForWorkspace(database, input, undefined);
}

export function upsertBudgetForWorkspace(
  database: DB,
  input: UpsertBudgetInput,
  workspaceId?: number,
): BudgetRow {
  // Check if exists
  const existing = database
    .select()
    .from(schema.budgets)
    .where(
      and(
        workspaceId === undefined
          ? undefined
          : eq(schema.budgets.workspaceId, workspaceId),
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
      workspaceId: workspaceId ?? null,
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
  targetMonth: string,
  workspaceId?: number,
): number {
  const sourceBudgets = database
    .select()
    .from(schema.budgets)
    .where(
      and(
        eq(schema.budgets.month, sourceMonth),
        workspaceId === undefined
          ? undefined
          : eq(schema.budgets.workspaceId, workspaceId),
      ),
    )
    .all();

  if (sourceBudgets.length === 0) {
    return -1;
  }

  // Upsert each budget into target month
  for (const budget of sourceBudgets) {
    upsertBudgetForWorkspace(database, {
      month: targetMonth,
      category: budget.category,
      amount: budget.amount,
    }, workspaceId);
  }

  return sourceBudgets.length;
}

/**
 * Replace the default budget model with the currently visible budgets for a month.
 * This saves a reusable template that future months will inherit unless they have
 * a month-specific override for a category.
 */
export function replaceBudgetTemplatesFromMonth(
  database: DB,
  sourceMonth: string,
  workspaceId?: number,
): number {
  const sourceBudgets = getBudgetsForMonth(database, sourceMonth, workspaceId).budgets.map(
    (budget) => ({
      category: budget.category,
      amount: budget.budgeted,
    })
  );

  if (sourceBudgets.length === 0) {
    return -1;
  }

  database
    .delete(schema.budgetTemplates)
    .where(
      workspaceId === undefined
        ? undefined
        : eq(schema.budgetTemplates.workspaceId, workspaceId),
    )
    .run();
  database
    .insert(schema.budgetTemplates)
    .values(sourceBudgets.map((template) => ({
      workspaceId: workspaceId ?? null,
      ...template,
    })))
    .run();

  return sourceBudgets.length;
}

export function replaceBudgetTemplates(
  database: DB,
  templates: BudgetTemplateInput[],
  workspaceId?: number,
): number {
  database
    .delete(schema.budgetTemplates)
    .where(
      workspaceId === undefined
        ? undefined
        : eq(schema.budgetTemplates.workspaceId, workspaceId),
    )
    .run();

  if (templates.length === 0) {
    return 0;
  }

  database
    .insert(schema.budgetTemplates)
    .values(
      templates.map((template) => ({
        workspaceId: workspaceId ?? null,
        category: template.category,
        amount: template.amount,
      }))
    )
    .run();

  return templates.length;
}

export function applyBudgetTemplatesToMonth(
  database: DB,
  month: string,
  workspaceId?: number,
): number {
  const templates = getBudgetTemplates(database, workspaceId);

  if (templates.length === 0) {
    return -1;
  }

  for (const template of templates) {
    upsertBudgetForWorkspace(database, {
      month,
      category: template.category,
      amount: template.amount,
    }, workspaceId);
  }

  return templates.length;
}

export function getBudgetTemplates(database: DB, workspaceId?: number): BudgetTemplateRow[] {
  return database
    .select({
      id: schema.budgetTemplates.id,
      workspaceId: schema.budgetTemplates.workspaceId,
      category: schema.budgetTemplates.category,
      amount: schema.budgetTemplates.amount,
      updatedAt: schema.budgetTemplates.updatedAt,
    })
    .from(schema.budgetTemplates)
    .where(
      workspaceId === undefined
        ? undefined
        : eq(schema.budgetTemplates.workspaceId, workspaceId),
    )
    .orderBy(schema.budgetTemplates.category)
    .all();
}

/**
 * Delete a budget by month and category.
 */
export function deleteBudget(
  database: DB,
  month: string,
  category: string,
  workspaceId?: number,
): boolean {
  const existing = database
    .select()
    .from(schema.budgets)
    .where(
      and(
        workspaceId === undefined
          ? undefined
          : eq(schema.budgets.workspaceId, workspaceId),
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
