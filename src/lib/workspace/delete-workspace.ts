import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import { db } from "@/db/index";
import * as schema from "@/db/schema";
import { getAllConnections } from "@/db/queries/connections";
import {
  clearWorkspaceMembershipCache,
  type WorkspaceMembership,
} from "@/db/queries/workspaces";
import { decrypt } from "@/lib/encryption";
import { clearWorkspaceFinanceData } from "@/lib/export/workspace-restore";
import { logError, logInfo, logWarn } from "@/lib/observability/logger";
import { getPlaidClient } from "@/lib/plaid";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type DeleteWorkspaceResult = {
  workspaceDeleted: boolean;
  authUserDeleted: boolean;
  plaidItemsRemoved: number;
  plaidRemovalFailures: number;
};

async function removePlaidItems(database: AppDatabase, workspaceId: number) {
  const connections = await getAllConnections(database, workspaceId);
  let removed = 0;
  let failed = 0;

  for (const connectionSummary of connections) {
    const [connection] = await database
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.id, connectionSummary.id))
      .limit(1);

    if (!connection?.accessToken || !connection.isEncrypted) {
      continue;
    }

    try {
      const accessToken = decrypt(connection.accessToken);
      await getPlaidClient().itemRemove({ access_token: accessToken });
      removed += 1;
    } catch (error) {
      failed += 1;
      logWarn("workspace_delete.plaid_item_remove_failed", {
        workspaceId,
        connectionId: connection.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { removed, failed };
}

export async function deleteWorkspaceAndMaybeAuthUser({
  database = db,
  membership,
  deleteAuthUser = true,
}: {
  database?: AppDatabase;
  membership: WorkspaceMembership;
  deleteAuthUser?: boolean;
}): Promise<DeleteWorkspaceResult> {
  const plaid = await removePlaidItems(database, membership.workspaceId);

  await database.transaction(async (transaction) => {
    const tx = transaction as AppDatabase;
    await clearWorkspaceFinanceData(tx, membership.workspaceId);
    await tx
      .delete(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.workspaceId, membership.workspaceId));
    await tx
      .delete(schema.workspaces)
      .where(eq(schema.workspaces.id, membership.workspaceId));
  });

  clearWorkspaceMembershipCache(membership.authUserId);

  let authUserDeleted = false;
  if (deleteAuthUser) {
    const admin = createSupabaseAdminClient();
    if (!admin) {
      logWarn("workspace_delete.auth_user_delete_skipped", {
        workspaceId: membership.workspaceId,
        reason: "SUPABASE_SERVICE_ROLE_KEY is not configured",
      });
    } else {
      const { error } = await admin.auth.admin.deleteUser(membership.authUserId);
      if (error) {
        logError("workspace_delete.auth_user_delete_failed", error, {
          workspaceId: membership.workspaceId,
          authUserId: membership.authUserId,
        });
      } else {
        authUserDeleted = true;
      }
    }
  }

  logInfo("workspace_delete.completed", {
    workspaceId: membership.workspaceId,
    authUserDeleted,
    plaidItemsRemoved: plaid.removed,
    plaidRemovalFailures: plaid.failed,
  });

  return {
    workspaceDeleted: true,
    authUserDeleted,
    plaidItemsRemoved: plaid.removed,
    plaidRemovalFailures: plaid.failed,
  };
}
