import { NextResponse } from "next/server";
import { db } from "@/db/index";
import { getAllConnections } from "@/db/queries/connections";

/**
 * GET /api/plaid/connections
 * Returns all Plaid connections with their linked accounts.
 */
export async function GET() {
  try {
    const connections = getAllConnections(db);

    // Never expose access_token or sensitive data to the client
    const sanitized = connections.map((conn) => ({
      id: conn.id,
      institutionName: conn.institutionName,
      provider: conn.provider,
      createdAt: conn.createdAt,
      lastSyncAt: conn.lastSyncAt,
      lastSyncStatus: conn.lastSyncStatus,
      lastSyncError: conn.lastSyncError,
      accounts: conn.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        balanceCurrent: a.balanceCurrent / 100, // cents to dollars
      })),
    }));

    return NextResponse.json(sanitized);
  } catch (error) {
    console.error("Error fetching connections:", error);
    return NextResponse.json(
      { error: "Failed to fetch connections" },
      { status: 500 }
    );
  }
}
