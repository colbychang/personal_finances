import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { getAllCategories } from "@/db/queries/categories";
import {
  applyMerchantRules,
  getUncategorizedTransactions,
  buildCategorizationPrompt,
  applyCategorizationResults,
} from "@/lib/categorize";
import { classifyTransactionsWithAI } from "@/lib/openai";
import { isNull } from "drizzle-orm";
import * as schema from "@/db/schema";

/**
 * POST /api/categorize — categorize transactions
 * Body: { transactionIds: number[] } or { all: true } to categorize all uncategorized
 *
 * Process:
 * 1. Check merchant rules first (apply without AI)
 * 2. Send remaining uncategorized to OpenAI GPT-4o-mini
 * 3. Store AI's category on each transaction
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionIds, all } = body;

    let idsToProcess: number[];

    if (all === true) {
      // Get all uncategorized transaction IDs
      const uncategorized = db
        .select({ id: schema.transactions.id })
        .from(schema.transactions)
        .where(isNull(schema.transactions.category))
        .all();
      idsToProcess = uncategorized.map((r) => r.id);
    } else if (Array.isArray(transactionIds) && transactionIds.length > 0) {
      idsToProcess = transactionIds.map((id: unknown) => Number(id)).filter((id) => !isNaN(id));
    } else {
      return NextResponse.json(
        { error: "Provide transactionIds array or set all: true" },
        { status: 400 }
      );
    }

    if (idsToProcess.length === 0) {
      return NextResponse.json({
        message: "No uncategorized transactions to process",
        ruleApplied: 0,
        aiCategorized: 0,
        total: 0,
      });
    }

    // Step 1: Apply merchant rules
    const { ruleApplied, remaining } = applyMerchantRules(db, idsToProcess);

    // Step 2: If there are remaining transactions, use AI
    let aiCategorized = 0;
    let aiError: string | null = null;

    if (remaining.length > 0) {
      try {
        // Get transaction details for AI
        const uncategorizedTxns = getUncategorizedTransactions(db, remaining);

        if (uncategorizedTxns.length > 0) {
          // Get full category list
          const categories = getAllCategories(db);
          const categoryNames = categories.map((c) => c.name);

          // Build prompt and call AI
          const prompt = buildCategorizationPrompt(uncategorizedTxns, categoryNames);
          const results = await classifyTransactionsWithAI(prompt);

          // Filter results to only include valid categories
          const validCategorySet = new Set(categoryNames);
          const validResults = results.filter((r) => validCategorySet.has(r.category));

          // Apply results
          aiCategorized = applyCategorizationResults(db, validResults);
        }
      } catch (error) {
        console.error("AI categorization error:", error);
        aiError =
          error instanceof Error
            ? error.message
            : "AI categorization failed. You can retry.";
      }
    }

    const response: Record<string, unknown> = {
      ruleApplied: ruleApplied.length,
      aiCategorized,
      total: ruleApplied.length + aiCategorized,
      remaining: remaining.length - aiCategorized,
    };

    if (aiError) {
      response.aiError = aiError;
      response.message =
        "Some transactions could not be categorized by AI. Merchant rules were applied successfully. You can retry.";
    } else {
      response.message = `Categorized ${ruleApplied.length + aiCategorized} transactions (${ruleApplied.length} by rules, ${aiCategorized} by AI)`;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("POST /api/categorize error:", error);
    return NextResponse.json(
      { error: "Failed to categorize transactions" },
      { status: 500 }
    );
  }
}
