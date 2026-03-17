import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import {
  getSpendingByCategory,
  getMonthlySpendingTrends,
  getCategoryTransactions,
} from "@/db/queries/analytics";

/**
 * GET /api/analytics?period=month|3months|6months|year&category=X&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Returns analytics data based on the requested period.
 * If `category` is provided, returns drill-down transactions for that category.
 * Otherwise returns spending by category + monthly trends.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const period = searchParams.get("period") ?? "month";
    const category = searchParams.get("category");

    // Calculate date range based on period
    const { startDate, endDate } = getDateRange(period);

    // If category is specified, return drill-down transactions
    if (category) {
      const transactions = getCategoryTransactions(db, category, startDate, endDate);
      return NextResponse.json({ transactions });
    }

    // Return spending by category + monthly trends
    const spendingByCategory = getSpendingByCategory(db, startDate, endDate);
    const trendMonths = getTrendMonths(period);
    const monthlyTrends = getMonthlySpendingTrends(db, trendMonths);

    const totalSpending = spendingByCategory.reduce((sum, c) => sum + c.amount, 0);

    return NextResponse.json({
      period,
      startDate,
      endDate,
      totalSpending,
      spendingByCategory,
      monthlyTrends,
    });
  } catch (error) {
    console.error("GET /api/analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics data" },
      { status: 500 }
    );
  }
}

/**
 * Calculate start/end dates for the given period.
 * End date is always the first of next month (exclusive upper bound).
 */
function getDateRange(period: string): { startDate: string; endDate: string } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // End date: first of next month
  const endMonthDate = new Date(currentYear, currentMonth + 1, 1);
  const endDate = formatDateStr(endMonthDate);

  let startDate: string;

  switch (period) {
    case "3months": {
      const d = new Date(currentYear, currentMonth - 2, 1);
      startDate = formatDateStr(d);
      break;
    }
    case "6months": {
      const d = new Date(currentYear, currentMonth - 5, 1);
      startDate = formatDateStr(d);
      break;
    }
    case "year": {
      const d = new Date(currentYear, currentMonth - 11, 1);
      startDate = formatDateStr(d);
      break;
    }
    case "month":
    default: {
      const d = new Date(currentYear, currentMonth, 1);
      startDate = formatDateStr(d);
      break;
    }
  }

  return { startDate, endDate };
}

function getTrendMonths(period: string): number {
  switch (period) {
    case "year": return 12;
    case "6months": return 6;
    case "3months": return 3;
    default: return 6; // Default to 6 months of trends even for single month view
  }
}

function formatDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
