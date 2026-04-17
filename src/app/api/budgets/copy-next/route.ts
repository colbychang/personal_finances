import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { copyBudgetsFromMonth } from "@/db/queries/budgets";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

/**
 * POST /api/budgets/copy-next
 * Copy all budgets from the next month into the provided month.
 * Body: { month: "YYYY-MM" } — the target month to copy INTO.
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

    const [year, monthNum] = month.split("-").map(Number);
    const nextMonth =
      monthNum === 12
        ? `${year + 1}-01`
        : `${year}-${String(monthNum + 1).padStart(2, "0")}`;

    const count = await copyBudgetsFromMonth(db, nextMonth, month, workspace.workspaceId);

    if (count === -1) {
      return NextResponse.json(
        { message: "No budgets found for the next month", copied: 0 },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { message: `Copied ${count} budget(s) from ${nextMonth}`, copied: count },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/budgets/copy-next error:", error);
    return NextResponse.json(
      { error: "Failed to copy budgets" },
      { status: 500 }
    );
  }
}
