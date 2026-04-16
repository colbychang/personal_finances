import { NextResponse } from "next/server";
import { db } from "@/db/index";
import { getSnapshotByMonth } from "@/db/queries/snapshots";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

/**
 * GET /api/snapshots/[month] — Return a specific snapshot with per-account balances.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ month: string }> }
) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const { month } = await params;

    // Validate month format YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "Invalid month format. Use YYYY-MM." },
        { status: 400 }
      );
    }

    const result = getSnapshotByMonth(db, month, workspace.workspaceId);

    if (!result) {
      return NextResponse.json(
        { error: "Snapshot not found for this month" },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch snapshot:", error);
    return NextResponse.json(
      { error: "Failed to fetch snapshot" },
      { status: 500 }
    );
  }
}
