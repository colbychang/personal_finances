import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { createSnapshot, getAllSnapshots } from "@/db/queries/snapshots";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

/**
 * GET /api/snapshots — Return all snapshots sorted by month.
 */
export async function GET() {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const snapshots = getAllSnapshots(db, workspace.workspaceId);
    return NextResponse.json({ snapshots });
  } catch (error) {
    console.error("Failed to fetch snapshots:", error);
    return NextResponse.json(
      { error: "Failed to fetch snapshots" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/snapshots — Create a new snapshot for a given month.
 * Body: { month?: string } — defaults to current month (YYYY-MM).
 */
export async function POST(request: NextRequest) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const body = await request.json().catch(() => ({}));

    // Default to current month if not provided
    let month = body.month;
    if (!month) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      month = `${y}-${m}`;
    }

    // Validate month format YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "Invalid month format. Use YYYY-MM." },
        { status: 400 }
      );
    }

    const snapshot = createSnapshot(db, month, workspace.workspaceId);
    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (error) {
    console.error("Failed to create snapshot:", error);
    return NextResponse.json(
      { error: "Failed to create snapshot" },
      { status: 500 }
    );
  }
}
