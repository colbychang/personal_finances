import {
  eq,
  and,
  inArray,
  desc,
  sql,
  isNull,
  notInArray,
} from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "../schema";
import { INVESTMENT_LIKE_ACCOUNT_TYPES } from "@/lib/account-types";
import { effectiveTransactionMonth } from "./effective-month";

type DB = AppDatabase;

export interface BudgetRow {
  id: number;
  workspaceId?: number | null;
  month: string;
  category: string;
  amount: number;
}

export interface BudgetTemplateRow {
  id: number;
  workspaceId?: number | null;
  category: string;
  amount: number;
  updatedAt: string;
}

export interface BudgetTemplateInput {
  category: string;
  amount: number;
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

export interface BudgetWithSpending {
  category: string;
  budgeted: number;
  spent: number;
  remaining: number;
  isInheritedDefault: boolean;
  categoryColor: string | null;
  transactions: CategoryTransaction[];
}

export interface UnbudgetedSpending {
  category: string;
  spent: number;
  categoryColor: string | null;
  transactions: CategoryTransaction[];
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

export interface BudgetSummary {
  budgets: BudgetWithSpending[];
  unbudgeted: UnbudgetedSpending[];
  totalBudgeted: number;
  totalSpent: number;
  totalRemaining: number;
  reviewSummary: ReviewSummary;
}

async function getCategorySpendingDetails(
  database: DB,
  month: string,
  workspaceId?: number,
): Promise<{
  spendingByCategory: Map<string, number>;
  transactionsByCategory: Map<string, CategoryTransaction[]>;
}> {
  const spendingMap = new Map<string, number>();
  const transactionsByCategory = new Map<string, CategoryTransaction[]>();

  const txns = await database
    .select({
      id: schema.transactions.id,
      postedAt: schema.transactions.postedAt,
      name: schema.transactions.name,
      amount: schema.transactions.amount,
      category: schema.transactions.category,
      accountName: schema.accounts.name,
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
    const splits = splitsMap.get(txn.id);

    if (splits && splits.length > 0) {
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
      continue;
    }

    if (!txn.category) continue;

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

export async function getBudgetsForMonth(
  database: DB,
  month: string,
  workspaceId?: number,
): Promise<BudgetSummary> {
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

  const monthBudgetRows = await database
    .select()
    .from(schema.budgets)
    .where(
      and(
        eq(schema.budgets.month, month),
        workspaceId === undefined ? undefined : eq(schema.budgets.workspaceId, workspaceId),
      ),
    );

  const templateRows = await database
    .select()
    .from(schema.budgetTemplates)
    .where(
      workspaceId === undefined
        ? undefined
        : eq(schema.budgetTemplates.workspaceId, workspaceId),
    );

  const budgetedCategoriesFromMonth = new Set(monthBudgetRows.map((budget) => budget.category));
  const budgetRows: BudgetRow[] = [
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

  const allCategories = await database
    .select({
      name: schema.categories.name,
      color: schema.categories.color,
    })
    .from(schema.categories);
  const categoryColorMap = new Map<string, string | null>(
    allCategories.map((c) => [c.name, c.color]),
  );

  const { spendingByCategory, transactionsByCategory } =
    await getCategorySpendingDetails(database, month, workspaceId);

  const budgetedCategories = new Set<string>();
  const budgets: BudgetWithSpending[] = budgetRows.map((budget) => {
    budgetedCategories.add(budget.category);
    const spent = spendingByCategory.get(budget.category) ?? 0;
    return {
      category: budget.category,
      budgeted: budget.amount,
      spent,
      remaining: budget.amount - spent,
      isInheritedDefault: budget.id < 0,
      categoryColor: categoryColorMap.get(budget.category) ?? null,
      transactions: transactionsByCategory.get(budget.category) ?? [],
    };
  });

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

  const totalBudgeted = budgets.reduce((sum, budget) => sum + budget.budgeted, 0);
  const totalSpent =
    budgets.reduce((sum, budget) => sum + budget.spent, 0) +
    unbudgeted.reduce((sum, item) => sum + item.spent, 0);
  const totalRemaining = totalBudgeted - budgets.reduce((sum, budget) => sum + budget.spent, 0);

  const [uncategorizedSummary] = await database
    .select({
      count: sql<number>`count(*)`,
      amount: sql<number>`coalesce(sum(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id),
    )
    .where(
      and(
        sql`${effectiveTransactionMonth} = ${month}`,
        workspaceId === undefined ? undefined : eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.isTransfer, false),
        eq(schema.transactions.isExcluded, false),
        isNull(schema.transactions.category),
        sql`${schema.transactions.amount} > 0`,
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES]),
      ),
    )
    .limit(1);

  const reviewTransactions = await database
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
      eq(schema.transactions.accountId, schema.accounts.id),
    )
    .where(
      and(
        sql`${effectiveTransactionMonth} = ${month}`,
        workspaceId === undefined ? undefined : eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.isTransfer, false),
        eq(schema.transactions.isExcluded, false),
        isNull(schema.transactions.category),
        sql`${schema.transactions.amount} > 0`,
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES]),
      ),
    )
    .orderBy(desc(schema.transactions.postedAt), desc(schema.transactions.id))
    .limit(5);

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

export interface UpsertBudgetInput {
  month: string;
  category: string;
  amount: number;
}

export function upsertBudget(database: DB, input: UpsertBudgetInput): Promise<BudgetRow> {
  return upsertBudgetForWorkspace(database, input, undefined);
}

export async function upsertBudgetForWorkspace(
  database: DB,
  input: UpsertBudgetInput,
  workspaceId?: number,
): Promise<BudgetRow> {
  const [existing] = await database
    .select()
    .from(schema.budgets)
    .where(
      and(
        workspaceId === undefined ? undefined : eq(schema.budgets.workspaceId, workspaceId),
        eq(schema.budgets.month, input.month),
        eq(schema.budgets.category, input.category),
      ),
    )
    .limit(1);

  if (existing) {
    await database
      .update(schema.budgets)
      .set({ amount: input.amount })
      .where(eq(schema.budgets.id, existing.id));

    return { ...existing, amount: input.amount };
  }

  const [budget] = await database
    .insert(schema.budgets)
    .values({
      workspaceId: workspaceId ?? null,
      month: input.month,
      category: input.category,
      amount: input.amount,
    })
    .returning();

  return budget;
}

export async function copyBudgetsFromMonth(
  database: DB,
  sourceMonth: string,
  targetMonth: string,
  workspaceId?: number,
): Promise<number> {
  const sourceBudgets = await database
    .select()
    .from(schema.budgets)
    .where(
      and(
        eq(schema.budgets.month, sourceMonth),
        workspaceId === undefined ? undefined : eq(schema.budgets.workspaceId, workspaceId),
      ),
    );

  if (sourceBudgets.length === 0) {
    return -1;
  }

  for (const budget of sourceBudgets) {
    await upsertBudgetForWorkspace(
      database,
      {
        month: targetMonth,
        category: budget.category,
        amount: budget.amount,
      },
      workspaceId,
    );
  }

  return sourceBudgets.length;
}

export async function replaceBudgetTemplatesFromMonth(
  database: DB,
  sourceMonth: string,
  workspaceId?: number,
): Promise<number> {
  const sourceBudgets = (await getBudgetsForMonth(database, sourceMonth, workspaceId)).budgets.map(
    (budget) => ({
      category: budget.category,
      amount: budget.budgeted,
    }),
  );

  if (sourceBudgets.length === 0) return -1;

  await database
    .delete(schema.budgetTemplates)
    .where(
      workspaceId === undefined
        ? undefined
        : eq(schema.budgetTemplates.workspaceId, workspaceId),
    );

  await database.insert(schema.budgetTemplates).values(
    sourceBudgets.map((template) => ({
      workspaceId: workspaceId ?? null,
      ...template,
    })),
  );

  return sourceBudgets.length;
}

export async function replaceBudgetTemplates(
  database: DB,
  templates: BudgetTemplateInput[],
  workspaceId?: number,
): Promise<number> {
  await database
    .delete(schema.budgetTemplates)
    .where(
      workspaceId === undefined
        ? undefined
        : eq(schema.budgetTemplates.workspaceId, workspaceId),
    );

  if (templates.length === 0) return 0;

  await database.insert(schema.budgetTemplates).values(
    templates.map((template) => ({
      workspaceId: workspaceId ?? null,
      category: template.category,
      amount: template.amount,
    })),
  );

  return templates.length;
}

export async function applyBudgetTemplatesToMonth(
  database: DB,
  month: string,
  workspaceId?: number,
): Promise<number> {
  const templates = await getBudgetTemplates(database, workspaceId);
  if (templates.length === 0) return -1;

  for (const template of templates) {
    await upsertBudgetForWorkspace(
      database,
      {
        month,
        category: template.category,
        amount: template.amount,
      },
      workspaceId,
    );
  }

  return templates.length;
}

export function getBudgetTemplates(
  database: DB,
  workspaceId?: number,
): Promise<BudgetTemplateRow[]> {
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
    .orderBy(schema.budgetTemplates.category);
}

export async function deleteBudget(
  database: DB,
  month: string,
  category: string,
  workspaceId?: number,
): Promise<boolean> {
  const [existing] = await database
    .select()
    .from(schema.budgets)
    .where(
      and(
        workspaceId === undefined ? undefined : eq(schema.budgets.workspaceId, workspaceId),
        eq(schema.budgets.month, month),
        eq(schema.budgets.category, category),
      ),
    )
    .limit(1);

  if (!existing) return false;

  await database.delete(schema.budgets).where(eq(schema.budgets.id, existing.id));
  return true;
}
