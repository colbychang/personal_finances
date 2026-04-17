/**
 * Transaction categorization logic.
 * - Apply merchant rules first (no AI call needed).
 * - Send remaining uncategorized to OpenAI GPT-4o-mini.
 */

import { eq, inArray, isNull, notInArray, and } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "@/db/schema";
import {
  normalizeMerchantKey,
  getAllMerchantRules,
} from "@/db/queries/merchant-rules";
import { INVESTMENT_LIKE_ACCOUNT_TYPES } from "@/lib/account-types";

type DB = AppDatabase;

interface TransactionForCategorization {
  id: number;
  name: string;
  merchant: string | null;
  amount: number;
  category: string | null;
}

/**
 * Apply merchant rules to a list of transaction IDs.
 * Returns which transactions had rules applied and which remain uncategorized.
 */
export async function applyMerchantRules(
  database: DB,
  transactionIds: number[],
  workspaceId?: number,
): Promise<{ ruleApplied: number[]; remaining: number[] }> {
  if (transactionIds.length === 0) {
    return { ruleApplied: [], remaining: [] };
  }

  // Fetch transactions
  const transactions = await database
    .select({
      id: schema.transactions.id,
      name: schema.transactions.name,
      merchant: schema.transactions.merchant,
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
        inArray(schema.transactions.id, transactionIds),
        workspaceId === undefined
          ? undefined
          : eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.isExcluded, false),
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES])
      )
    );

  // Get all merchant rules
  const rules = await getAllMerchantRules(database, workspaceId);
  const ruleMap = new Map(rules.map((r) => [r.merchantKey, r]));

  const ruleApplied: number[] = [];
  const remaining: number[] = [];

  for (const txn of transactions) {
    // Skip already categorized transactions
    if (txn.category) {
      continue;
    }

    // Try to match by merchant field first, then by name
    const merchantKey = txn.merchant
      ? normalizeMerchantKey(txn.merchant)
      : null;
    const nameKey = normalizeMerchantKey(txn.name);

    let matchedRule = merchantKey ? ruleMap.get(merchantKey) : undefined;

    // If no direct match on merchant, try matching rules against the name
    if (!matchedRule) {
      for (const [ruleKey, rule] of ruleMap) {
        if (nameKey.includes(ruleKey) || (merchantKey && merchantKey.includes(ruleKey))) {
          matchedRule = rule;
          break;
        }
      }
    }

    if (matchedRule) {
      // Apply the rule
      await database
        .update(schema.transactions)
        .set({
          category: matchedRule.category,
          isTransfer: matchedRule.isTransfer,
        })
        .where(eq(schema.transactions.id, txn.id));

      ruleApplied.push(txn.id);
    } else {
      remaining.push(txn.id);
    }
  }

  return { ruleApplied, remaining };
}

/**
 * Get uncategorized transactions for a given set of IDs.
 */
export async function getUncategorizedTransactions(
  database: DB,
  transactionIds: number[],
  workspaceId?: number,
): Promise<TransactionForCategorization[]> {
  if (transactionIds.length === 0) return [];

  return await database
    .select({
      id: schema.transactions.id,
      name: schema.transactions.name,
      merchant: schema.transactions.merchant,
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
        inArray(schema.transactions.id, transactionIds),
        workspaceId === undefined
          ? undefined
          : eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.isExcluded, false),
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES])
      )
    );
}

/**
 * Build the prompt for OpenAI to categorize transactions.
 */
export function buildCategorizationPrompt(
  transactions: Array<{ id: number; name: string; merchant: string | null; amount: number }>,
  categoryNames: string[]
): string {
  const categoryList = categoryNames.join(", ");

  const transactionLines = transactions
    .map((t) => {
      const merchant = t.merchant ? ` (merchant: ${t.merchant})` : "";
      const amountDollars = (Math.abs(t.amount) / 100).toFixed(2);
      return `- ID ${t.id}: "${t.name}"${merchant}, $${amountDollars}`;
    })
    .join("\n");

  return `You are a personal finance categorization assistant. Classify each transaction into exactly one of these categories:
${categoryList}

If none fit well, use the closest match.

Transactions to classify:
${transactionLines}

Respond with a JSON array of objects, each with "id" (the transaction ID) and "category" (the chosen category name exactly as listed above).
Example: [{"id": 1, "category": "Groceries"}, {"id": 2, "category": "Eating Out"}]

Return ONLY the JSON array, no other text.`;
}

/**
 * Apply AI categorization results to transactions in the database.
 */
export async function applyCategorizationResults(
  database: DB,
  results: Array<{ id: number; category: string }>
): Promise<number> {
  let applied = 0;

  for (const result of results) {
    await database
      .update(schema.transactions)
      .set({ category: result.category })
      .where(eq(schema.transactions.id, result.id));
    applied++;
  }

  return applied;
}

/**
 * Get all transaction IDs that are uncategorized (category is null).
 */
export function getAllUncategorizedTransactionIds(database: DB): Promise<number[]> {
  return getAllUncategorizedTransactionIdsForWorkspace(database, undefined);
}

export function getAllUncategorizedTransactionIdsForWorkspace(
  database: DB,
  workspaceId?: number,
): Promise<number[]> {
  return database
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id)
    )
    .where(
      and(
        isNull(schema.transactions.category),
        workspaceId === undefined
          ? undefined
          : eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.isExcluded, false),
        notInArray(schema.accounts.type, [...INVESTMENT_LIKE_ACCOUNT_TYPES])
      )
    )
    .then((rows) => rows.map((r) => r.id));
}
