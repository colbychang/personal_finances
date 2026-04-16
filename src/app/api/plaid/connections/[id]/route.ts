import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { getConnectionById, deleteConnection } from "@/db/queries/connections";
import { decrypt } from "@/lib/encryption";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import { getPlaidClient } from "@/lib/plaid";

/**
 * DELETE /api/plaid/connections/[id]
 * Disconnects a Plaid connection, removes associated data, and removes the
 * Plaid item.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);

    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid connection ID" },
        { status: 400 }
      );
    }

    // Get connection to attempt Plaid item removal
    const connection = getConnectionById(db, id, workspace.workspaceId);
    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Try to remove the Plaid item (best-effort)
    if (connection.accessToken && connection.isEncrypted) {
      try {
        const accessToken = decrypt(connection.accessToken);
        const plaidClient = getPlaidClient();
        await plaidClient.itemRemove({ access_token: accessToken });
      } catch (plaidError) {
        // Log but don't fail the disconnect — we still want to clean up locally
        console.error("Failed to remove Plaid item:", plaidError);
      }
    }

    // Delete connection and all associated data from database
    const deleted = deleteConnection(db, id, workspace.workspaceId);
    if (!deleted) {
      return NextResponse.json(
        { error: "Failed to delete connection" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error disconnecting:", error);
    const message =
      error instanceof Error ? error.message : "Failed to disconnect";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
