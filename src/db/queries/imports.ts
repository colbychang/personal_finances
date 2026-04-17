import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "../schema";
import { shouldExcludePassiveIncomeTransaction } from "@/lib/transaction-exclusions";

type DB = AppDatabase;

export interface ImportTransactionInput {
  accountId: number;
  postedAt: string;
  name: string;
  amount: number;
  category: string | null;
}

export async function importTransactions(
  database: DB,
  transactions: ImportTransactionInput[],
  workspaceId?: number,
): Promise<number> {
  if (transactions.length === 0) return 0;

  await database
    .insert(schema.transactions)
    .values(
      transactions.map((txn) => ({
        workspaceId: workspaceId ?? null,
        accountId: txn.accountId,
        postedAt: txn.postedAt,
        name: txn.name,
        amount: txn.amount,
        category: txn.category,
        pending: false,
        isTransfer: false,
        isExcluded: shouldExcludePassiveIncomeTransaction({
          name: txn.name,
          category: txn.category,
          amount: txn.amount,
        }),
        reviewState: "none" as const,
      })),
    );

  return transactions.length;
}

export function getExistingTransactionsForDuplicateCheck(
  database: DB,
  accountId: number,
  workspaceId?: number,
): Promise<Array<{ id: number; postedAt: string; name: string; amount: number }>> {
  return database
    .select({
      id: schema.transactions.id,
      postedAt: schema.transactions.postedAt,
      name: schema.transactions.name,
      amount: schema.transactions.amount,
    })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.accountId, accountId),
        workspaceId === undefined
          ? undefined
          : eq(schema.transactions.workspaceId, workspaceId),
      ),
    );
}
