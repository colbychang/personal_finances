import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { getAllCategories } from "@/db/queries/categories";
import {
  applyMerchantRules,
  getUncategorizedTransactions,
  buildCategorizationPrompt,
  applyCategorizationResults,
  getAllUncategorizedTransactionIdsForWorkspace,
} from "@/lib/categorize";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import { classifyTransactionsWithAI } from "@/lib/openai";
import { checkWorkspaceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const AI_BATCH_SIZE = 40;
const CATEGORIZE_RATE_LIMIT = {
  limit: 20,
  windowMs: 60 * 60 * 1000,
};

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

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
    const { workspace } = await requireCurrentWorkspace();
    const rateLimit = checkWorkspaceRateLimit({
      workspaceId: workspace.workspaceId,
      scope: "categorize",
      ...CATEGORIZE_RATE_LIMIT,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, {
        route: "/api/categorize",
        message: "Too many categorization attempts. Please try again later.",
      });
    }

    const body = await request.json();
    const { transactionIds, all } = body;

    let idsToProcess: number[];

    if (all === true) {
      idsToProcess = await getAllUncategorizedTransactionIdsForWorkspace(
        db,
        workspace.workspaceId,
      );
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
    const { ruleApplied, remaining } = await applyMerchantRules(
      db,
      idsToProcess,
      workspace.workspaceId,
    );

    // Step 2: If there are remaining transactions, use AI
    let aiCategorized = 0;
    let aiError: string | null = null;

    if (remaining.length > 0) {
      // Get transaction details for AI
      const uncategorizedTxns = await getUncategorizedTransactions(
        db,
        remaining,
        workspace.workspaceId,
      );

      if (uncategorizedTxns.length > 0) {
        // Get full category list
        const categories = await getAllCategories(db, workspace.workspaceId);
        const categoryNames = categories.map((c) => c.name);
        const validCategorySet = new Set(categoryNames);

        for (const batch of chunkArray(uncategorizedTxns, AI_BATCH_SIZE)) {
          try {
            const prompt = buildCategorizationPrompt(batch, categoryNames);
            const results = await classifyTransactionsWithAI(prompt);

            // Filter results to only include valid categories
            const validResults = results.filter((r) =>
              validCategorySet.has(r.category)
            );

            aiCategorized += await applyCategorizationResults(db, validResults);
          } catch (error) {
            console.error("AI categorization batch error:", error);
            aiError =
              error instanceof Error
                ? error.message
                : "AI categorization failed. You can retry.";
            break;
          }
        }
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
