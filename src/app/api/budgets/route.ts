import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { getBudgetsForMonth, upsertBudget } from "@/db/queries/budgets";

/**
 * GET /api/budgets?month=YYYY-MM
 * Returns budgets for a month with actual spending calculated from transactions.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const month = searchParams.get("month");

    if (!month) {
      return NextResponse.json(
        { error: "month query parameter is required (YYYY-MM)" },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "month must be in YYYY-MM format" },
        { status: 400 }
      );
    }

    const result = getBudgetsForMonth(db, month);
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/budgets error:", error);
    return NextResponse.json(
      { error: "Failed to fetch budgets" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/budgets
 * Set a budget amount (upsert by month+category).
 * Body: { month: "YYYY-MM", category: string, amount: number (dollars) }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { month, category, amount } = body;

    // Validation
    const errors: Record<string, string> = {};

    if (!month || typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
      errors.month = "Month is required in YYYY-MM format";
    }

    if (!category || typeof category !== "string" || category.trim() === "") {
      errors.category = "Category is required";
    }

    if (amount === undefined || amount === null || amount === "") {
      errors.amount = "Amount is required";
    } else if (typeof amount !== "number" || isNaN(amount)) {
      errors.amount = "Amount must be a valid number";
    } else if (amount < 0) {
      errors.amount = "Amount must not be negative";
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    // Convert dollars to cents
    const amountCents = Math.round(amount * 100);

    const budget = upsertBudget(db, {
      month,
      category: category.trim(),
      amount: amountCents,
    });

    return NextResponse.json({ budget }, { status: 200 });
  } catch (error) {
    console.error("POST /api/budgets error:", error);
    return NextResponse.json(
      { error: "Failed to save budget" },
      { status: 500 }
    );
  }
}
