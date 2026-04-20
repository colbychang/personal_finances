import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { getDashboardData } from "@/db/queries/dashboard";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

/**
 * GET /api/dashboard?month=YYYY-MM
 * Returns all dashboard widget data for a given month.
 * Defaults to current month if no month parameter provided.
 */
export async function GET(request: NextRequest) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const { searchParams } = request.nextUrl;
    let month = searchParams.get("month");

    if (!month) {
      month = new Date().toISOString().slice(0, 7);
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "month must be in YYYY-MM format" },
        { status: 400 }
      );
    }

    const data = await getDashboardData(db, month, workspace.workspaceId);
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
