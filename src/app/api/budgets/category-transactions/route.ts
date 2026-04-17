import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { getBudgetCategoryTransactions } from "@/db/queries/budgets";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

export async function GET(request: NextRequest) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const { searchParams } = request.nextUrl;
    const month = searchParams.get("month");
    const category = searchParams.get("category");

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "month query parameter is required (YYYY-MM)" },
        { status: 400 },
      );
    }

    if (!category || category.trim() === "") {
      return NextResponse.json(
        { error: "category query parameter is required" },
        { status: 400 },
      );
    }

    const transactions = await getBudgetCategoryTransactions(
      db,
      month,
      category.trim(),
      workspace.workspaceId,
    );

    return NextResponse.json({ transactions });
  } catch (error) {
    console.error("GET /api/budgets/category-transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch budget category transactions" },
      { status: 500 },
    );
  }
}
