import { NextResponse } from "next/server";
import { db } from "@/db/index";
import {
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getTransactionSplits,
} from "@/db/queries/transactions";
import {
  createOrUpdateMerchantRule,
  normalizeMerchantKey,
} from "@/db/queries/merchant-rules";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/transactions/[id] — get a single transaction with its splits
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const { id } = await context.params;
    const txnId = parseInt(id, 10);

    if (isNaN(txnId)) {
      return NextResponse.json({ error: "Invalid transaction ID" }, { status: 400 });
    }

    const transaction = getTransactionById(db, txnId, workspace.workspaceId);

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const splits = getTransactionSplits(db, txnId);

    return NextResponse.json({ transaction, splits });
  } catch (error) {
    console.error("GET /api/transactions/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transaction" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/transactions/[id] — update an existing transaction
 * Body: { date?, overrideMonth?, name?, amount?, accountId?, category?, notes?, isTransfer?, type? }
 * amount is in dollars (converted to cents). type is "expense" or "income".
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const { id } = await context.params;
    const txnId = parseInt(id, 10);

    if (isNaN(txnId)) {
      return NextResponse.json({ error: "Invalid transaction ID" }, { status: 400 });
    }

    const body = await request.json();
    const {
      date,
      overrideMonth,
      name,
      amount,
      accountId,
      category,
      notes,
      isTransfer,
      type,
    } = body;

    // Validation
    const errors: Record<string, string> = {};
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (date !== undefined) {
      if (typeof date !== "string" || !isoDateRegex.test(date)) {
        errors.date = "Date must be in YYYY-MM-DD format";
      } else {
        const parsed = new Date(date + "T00:00:00");
        if (isNaN(parsed.getTime())) {
          errors.date = "Invalid date";
        }
      }
    }

    if (
      overrideMonth !== undefined &&
      overrideMonth !== null &&
      overrideMonth !== "" &&
      (typeof overrideMonth !== "string" || !/^\d{4}-\d{2}$/.test(overrideMonth))
    ) {
      errors.overrideMonth = "Override month must be in YYYY-MM format";
    }

    if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
      errors.name = "Name cannot be empty";
    }

    if (amount !== undefined) {
      if (typeof amount !== "number" || isNaN(amount)) {
        errors.amount = "Amount must be a valid number";
      } else if (amount <= 0) {
        errors.amount = "Amount must be greater than zero";
      }
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    // Build update input
    const updates: Record<string, unknown> = {};
    if (date !== undefined) updates.postedAt = date;
    if (overrideMonth !== undefined) updates.overrideMonth = overrideMonth || null;
    if (name !== undefined) updates.name = name.trim();
    if (accountId !== undefined) updates.accountId = accountId;
    if (category !== undefined) updates.category = category || null;
    if (notes !== undefined) updates.notes = notes?.trim() || null;
    if (isTransfer !== undefined) updates.isTransfer = isTransfer;

    // Handle amount + type
    if (amount !== undefined) {
      const amountCents = Math.round(amount * 100);
      updates.amount = type === "income" ? -amountCents : amountCents;
    }

    // Get the current transaction before updating (for merchant rule auto-creation)
    const beforeUpdate = getTransactionById(db, txnId, workspace.workspaceId);
    if (!beforeUpdate) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const updated = updateTransaction(db, txnId, updates, workspace.workspaceId);

    if (!updated) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Auto-create/update merchant rule when category is manually changed
    if (category !== undefined && category && category !== beforeUpdate.category) {
      const merchantName = beforeUpdate.merchant || beforeUpdate.name;
      if (merchantName) {
        try {
          const key = normalizeMerchantKey(merchantName);
          createOrUpdateMerchantRule(db, {
            merchantKey: key,
            label: merchantName,
            category: category,
          }, workspace.workspaceId);
        } catch (ruleError) {
          // Non-critical: log but don't fail the transaction update
          console.error("Failed to create merchant rule:", ruleError);
        }
      }
    }

    return NextResponse.json({ transaction: updated });
  } catch (error) {
    console.error("PUT /api/transactions/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/transactions/[id] — delete a transaction and its splits
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const { id } = await context.params;
    const txnId = parseInt(id, 10);

    if (isNaN(txnId)) {
      return NextResponse.json({ error: "Invalid transaction ID" }, { status: 400 });
    }

    const deleted = deleteTransaction(db, txnId, workspace.workspaceId);

    if (!deleted) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/transactions/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete transaction" },
      { status: 500 }
    );
  }
}
