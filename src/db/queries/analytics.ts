import { eq, and, inArray, notInArray, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "../schema";
import { INVESTMENT_LIKE_ACCOUNT_TYPES } from "@/lib/account-types";
import { effectiveTransactionMonth } from "./effective-month";
import { getAllCategories } from "./categories";

type DB = AppDatabase;

export interface CategorySpendingItem {
  category: string;
  amount: number;
  color: string | null;
}

export interface MonthlySpendingItem {
  month: string;
  total: number;
}

export interface CategoryTransaction {
  id: number;
  postedAt: string;
  name: string;
  merchant: string | null;
  amount: number;
  category: string | null;
  accountName: string;
  splitAmount: number | null;
}

export async function getSpendingByCategory(
  database: DB,
  startDate: string,
  endDate: string,
  workspaceId?: number,
): Promise<CategorySpendingItem[]> {
  const startMonth = startDate.slice(0, 7);
  const endMonthExclusive = endDate.slice(0, 7);

  const allCategories = await getAllCategories(database, workspaceId);
  const categoryColorMap = new Map<string, string | null>(
    allCategories.map((c) => [c.name, c.color]),
  );

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
        sql`${effectiveTransactionMonth} >= ${startMonth}`,
        sql`${effectiveTransactionMonth} < ${endMonthExclusive}`,
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

  const spendingMap = new Map<string, number>();

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

  return Array.from(spendingMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      color: categoryColorMap.get(category) ?? null,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export async function getMonthlySpendingTrends(
  database: DB,
  months: number,
  workspaceId?: number,
): Promise<MonthlySpendingItem[]> {
  const now = new Date();
  const monthList: string[] = [];

  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const lastMonth = monthList[monthList.length - 1];
  const [lastYear, lastMon] = lastMonth.split("-").map(Number);
  const endMonthExclusive =
    lastMon === 12
      ? `${lastYear + 1}-01`
      : `${lastYear}-${String(lastMon + 1).padStart(2, "0")}`;

  const txns = await database
    .select({
      id: schema.transactions.id,
      postedAt: schema.transactions.postedAt,
      overrideMonth: schema.transactions.overrideMonth,
      amount: schema.transactions.amount,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id),
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
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES]),
      ),
    );

  const monthTotals = new Map<string, number>();
  for (const month of monthList) {
    monthTotals.set(month, 0);
  }

  for (const txn of txns) {
    if (txn.amount < 0) continue;
    const txnMonth = txn.overrideMonth ?? txn.postedAt.slice(0, 7);
    if (monthTotals.has(txnMonth)) {
      monthTotals.set(txnMonth, monthTotals.get(txnMonth)! + txn.amount);
    }
  }

  return monthList.map((month) => ({
    month,
    total: monthTotals.get(month) ?? 0,
  }));
}

export async function getCategoryTransactions(
  database: DB,
  category: string,
  startDate: string,
  endDate: string,
  workspaceId?: number,
): Promise<CategoryTransaction[]> {
  const startMonth = startDate.slice(0, 7);
  const endMonthExclusive = endDate.slice(0, 7);

  const directTxns = await database
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
      eq(schema.transactions.accountId, schema.accounts.id),
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
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES]),
      ),
    );

  const directIds = directTxns.map((t) => t.id);
  const directWithSplits = new Set<number>();

  if (directIds.length > 0) {
    const splitCheck = await database
      .select({ transactionId: schema.transactionSplits.transactionId })
      .from(schema.transactionSplits)
      .where(inArray(schema.transactionSplits.transactionId, directIds));

    for (const split of splitCheck) {
      directWithSplits.add(split.transactionId);
    }
  }

  const splitMatches = await database
    .select({
      transactionId: schema.transactionSplits.transactionId,
      splitAmount: schema.transactionSplits.amount,
    })
    .from(schema.transactionSplits)
    .where(eq(schema.transactionSplits.category, category));

  const splitTxnIds = splitMatches.map((s) => s.transactionId);
  const splitAmountMap = new Map<number, number>(
    splitMatches.map((s) => [s.transactionId, s.splitAmount]),
  );

  let splitTxns: Array<{
    id: number;
    postedAt: string;
    name: string;
    merchant: string | null;
    amount: number;
    category: string | null;
    accountName: string;
  }> = [];

  if (splitTxnIds.length > 0) {
    splitTxns = await database
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
        eq(schema.transactions.accountId, schema.accounts.id),
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
          notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES]),
        ),
      );
  }

  const seenIds = new Set<number>();
  const result: CategoryTransaction[] = [];

  for (const txn of directTxns) {
    if (directWithSplits.has(txn.id) || seenIds.has(txn.id)) continue;
    seenIds.add(txn.id);
    result.push({ ...txn, splitAmount: null });
  }

  for (const txn of splitTxns) {
    if (seenIds.has(txn.id)) continue;
    seenIds.add(txn.id);
    result.push({
      ...txn,
      splitAmount: splitAmountMap.get(txn.id) ?? null,
    });
  }

  result.sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  return result;
}
