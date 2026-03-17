import { NextResponse } from "next/server";
import { db } from "@/db/index";
import { getAccountBalanceHistory } from "@/db/queries/snapshots";

/**
 * GET /api/snapshots/history — Return per-account balance history across all snapshots.
 */
export async function GET() {
  try {
    const history = getAccountBalanceHistory(db);
    return NextResponse.json({ history });
  } catch (error) {
    console.error("Failed to fetch account balance history:", error);
    return NextResponse.json(
      { error: "Failed to fetch account balance history" },
      { status: 500 }
    );
  }
}
