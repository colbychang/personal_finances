import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { copyBudgetsFromMonth } from "@/db/queries/budgets";

/**
 * POST /api/budgets/copy-previous
 * Copy all budgets from the previous month to the target month.
 * Body: { month: "YYYY-MM" } — the target month to copy INTO.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { month } = body;

    if (!month || typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "month is required in YYYY-MM format" },
        { status: 400 }
      );
    }

    // Calculate previous month
    const [year, monthNum] = month.split("-").map(Number);
    const prevMonth =
      monthNum === 1
        ? `${year - 1}-12`
        : `${year}-${String(monthNum - 1).padStart(2, "0")}`;

    const count = copyBudgetsFromMonth(db, prevMonth, month);

    if (count === -1) {
      return NextResponse.json(
        { message: "No budgets found for the previous month", copied: 0 },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { message: `Copied ${count} budget(s) from ${prevMonth}`, copied: count },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/budgets/copy-previous error:", error);
    return NextResponse.json(
      { error: "Failed to copy budgets" },
      { status: 500 }
    );
  }
}
