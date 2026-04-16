import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import {
  getAllMerchantRules,
  createOrUpdateMerchantRule,
  normalizeMerchantKey,
} from "@/db/queries/merchant-rules";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

/**
 * GET /api/merchant-rules — get all merchant rules
 */
export async function GET() {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const rules = getAllMerchantRules(db, workspace.workspaceId);
    return NextResponse.json({ rules });
  } catch (error) {
    console.error("GET /api/merchant-rules error:", error);
    return NextResponse.json(
      { error: "Failed to fetch merchant rules" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/merchant-rules — create a new merchant rule
 * Body: { merchant: string, category: string, isTransfer?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const body = await request.json();
    const { merchant, category, isTransfer } = body;

    // Validation
    const errors: Record<string, string> = {};

    if (!merchant || typeof merchant !== "string" || merchant.trim() === "") {
      errors.merchant = "Merchant name is required";
    }

    if (!category || typeof category !== "string" || category.trim() === "") {
      errors.category = "Category is required";
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const trimmedMerchant = merchant.trim();
    const merchantKey = normalizeMerchantKey(trimmedMerchant);

    const rule = createOrUpdateMerchantRule(db, {
      merchantKey,
      label: trimmedMerchant,
      category: category.trim(),
      isTransfer: isTransfer ?? false,
    }, workspace.workspaceId);

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error("POST /api/merchant-rules error:", error);
    return NextResponse.json(
      { error: "Failed to create merchant rule" },
      { status: 500 }
    );
  }
}
