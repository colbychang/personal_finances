import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import {
  updateMerchantRule,
  deleteMerchantRuleForWorkspace,
} from "@/db/queries/merchant-rules";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT /api/merchant-rules/[id] — update a merchant rule
 * Body: { category?: string, label?: string, isTransfer?: boolean }
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const { id } = await context.params;
    const ruleId = parseInt(id, 10);

    if (isNaN(ruleId)) {
      return NextResponse.json({ error: "Invalid rule ID" }, { status: 400 });
    }

    const body = await request.json();
    const { category, label, isTransfer } = body;

    // Validation: at least one field required
    if (category === undefined && label === undefined && isTransfer === undefined) {
      return NextResponse.json(
        { error: "At least one field (category, label, isTransfer) is required" },
        { status: 400 }
      );
    }

    if (category !== undefined && (typeof category !== "string" || category.trim() === "")) {
      return NextResponse.json(
        { errors: { category: "Category cannot be empty" } },
        { status: 400 }
      );
    }

    const updated = updateMerchantRule(db, ruleId, {
      category: category?.trim(),
      label: label?.trim(),
      isTransfer,
    }, workspace.workspaceId);

    if (!updated) {
      return NextResponse.json({ error: "Merchant rule not found" }, { status: 404 });
    }

    return NextResponse.json({ rule: updated });
  } catch (error) {
    console.error("PUT /api/merchant-rules/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update merchant rule" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/merchant-rules/[id] — delete a merchant rule
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const { id } = await context.params;
    const ruleId = parseInt(id, 10);

    if (isNaN(ruleId)) {
      return NextResponse.json({ error: "Invalid rule ID" }, { status: 400 });
    }

    const deleted = deleteMerchantRuleForWorkspace(db, ruleId, workspace.workspaceId);

    if (!deleted) {
      return NextResponse.json({ error: "Merchant rule not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/merchant-rules/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete merchant rule" },
      { status: 500 }
    );
  }
}
