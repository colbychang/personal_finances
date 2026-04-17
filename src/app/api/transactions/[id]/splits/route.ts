import { NextResponse } from "next/server";
import { db } from "@/db/index";
import {
  getTransactionById,
  createOrUpdateSplits,
  getTransactionSplits,
} from "@/db/queries/transactions";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/transactions/[id]/splits — get splits for a transaction
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const { id } = await context.params;
    const txnId = parseInt(id, 10);

    if (isNaN(txnId)) {
      return NextResponse.json({ error: "Invalid transaction ID" }, { status: 400 });
    }

    const transaction = await getTransactionById(db, txnId, workspace.workspaceId);
    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const splits = await getTransactionSplits(db, txnId);
    return NextResponse.json({ splits });
  } catch (error) {
    console.error("GET /api/transactions/[id]/splits error:", error);
    return NextResponse.json(
      { error: "Failed to fetch splits" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/transactions/[id]/splits — create or update splits
 * Body: { splits: [{ category: string, amount: number }] }
 * amount is in dollars (converted to cents).
 * Validates that split amounts sum to the transaction amount.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const { id } = await context.params;
    const txnId = parseInt(id, 10);

    if (isNaN(txnId)) {
      return NextResponse.json({ error: "Invalid transaction ID" }, { status: 400 });
    }

    // Verify transaction exists
    const transaction = await getTransactionById(db, txnId, workspace.workspaceId);
    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const body = await request.json();
    const { splits } = body;

    if (!Array.isArray(splits)) {
      return NextResponse.json(
        { error: "splits must be an array" },
        { status: 400 }
      );
    }

    // Empty array means "clear all splits"
    if (splits.length === 0) {
      await createOrUpdateSplits(db, txnId, []);
      return NextResponse.json({ splits: [] }, { status: 201 });
    }

    // Validate each split
    const errors: string[] = [];
    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      if (!split.category || typeof split.category !== "string") {
        errors.push(`Split ${i + 1}: category is required`);
      }
      if (split.amount === undefined || typeof split.amount !== "number" || split.amount <= 0) {
        errors.push(`Split ${i + 1}: amount must be a positive number`);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    // Convert amounts to cents
    const splitsCents = splits.map((s: { category: string; amount: number }) => ({
      category: s.category,
      amount: Math.round(s.amount * 100),
    }));

    // Validate sum equals transaction amount (use absolute value for comparison)
    const transactionAmountAbs = Math.abs(transaction.amount);
    const splitSum = splitsCents.reduce((sum: number, s: { amount: number }) => sum + s.amount, 0);

    if (splitSum !== transactionAmountAbs) {
      return NextResponse.json(
        {
          error: `Split amounts must sum to the transaction amount. Expected $${(transactionAmountAbs / 100).toFixed(2)}, got $${(splitSum / 100).toFixed(2)}`,
        },
        { status: 400 }
      );
    }

    const result = await createOrUpdateSplits(db, txnId, splitsCents);

    return NextResponse.json({ splits: result }, { status: 201 });
  } catch (error) {
    console.error("POST /api/transactions/[id]/splits error:", error);
    return NextResponse.json(
      { error: "Failed to save splits" },
      { status: 500 }
    );
  }
}
