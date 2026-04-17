import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { applyBudgetTemplatesToMonth } from "@/db/queries/budgets";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

/**
 * POST /api/budgets/template/apply
 * Apply the default budget model to a target month.
 * Body: { month: "YYYY-MM" }
 */
export async function POST(request: NextRequest) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const body = await request.json();
    const { month } = body;

    if (!month || typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "month is required in YYYY-MM format" },
        { status: 400 }
      );
    }

    const count = await applyBudgetTemplatesToMonth(db, month, workspace.workspaceId);

    if (count === -1) {
      return NextResponse.json(
        { message: "No default budget model is saved yet", applied: 0 },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        message: `Applied ${count} default budget(s) to ${month}`,
        applied: count,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/budgets/template/apply error:", error);
    return NextResponse.json(
      { error: "Failed to apply default budget" },
      { status: 500 }
    );
  }
}
