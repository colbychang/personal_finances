import { NextRequest, NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/encryption";
import { db } from "@/db/index";
import { getConnectionById } from "@/db/queries/connections";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import {
  syncTransactionsFromPlaid,
  updateConnectionSyncStatus,
  updateAccountBalances,
  type PlaidSyncTransaction,
  type PlaidSyncRemovedTransaction,
} from "@/db/queries/sync";

/**
 * Map Plaid error codes to user-friendly messages.
 */
function getUserFriendlyError(errorCode: string): string {
  switch (errorCode) {
    case "ITEM_LOGIN_REQUIRED":
      return "Your bank requires you to re-authenticate. Please reconnect your account.";
    case "ITEM_LOCKED":
      return "Your bank account access is locked. Please contact your bank to unlock it.";
    case "ITEM_NOT_SUPPORTED":
      return "This bank is no longer supported. Please try a different institution.";
    case "INVALID_ACCESS_TOKEN":
      return "The connection to your bank has expired. Please reconnect your account.";
    case "PRODUCTS_NOT_READY":
      return "Transactions are still being loaded. Please try again in a few minutes.";
    case "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION":
      return "Transaction data was updated during sync. Please try again.";
    default:
      return "An error occurred while syncing transactions. Please try again later.";
  }
}

/**
 * POST /api/plaid/sync
 * Triggers a transaction sync for a given connection.
 * Body: { connectionId: number }
 */
export async function POST(request: NextRequest) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const body = await request.json();
    const connectionId = body.connectionId;

    if (!connectionId || typeof connectionId !== "number") {
      return NextResponse.json(
        { error: "connectionId (number) is required" },
        { status: 400 }
      );
    }

    // Get connection
    const connection = await getConnectionById(db, connectionId, workspace.workspaceId);
    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    if (!connection.accessToken) {
      return NextResponse.json(
        { error: "Connection has no access token" },
        { status: 400 }
      );
    }

    // Mark as syncing
    await updateConnectionSyncStatus(db, connectionId, {
      cursor: null,
      status: "syncing",
      error: null,
    });

    // Decrypt access token
    let accessToken: string;
    try {
      accessToken = connection.isEncrypted
        ? decrypt(connection.accessToken)
        : connection.accessToken;
    } catch {
      await updateConnectionSyncStatus(db, connectionId, {
        cursor: null,
        status: "error",
        error: "Failed to decrypt access token. Please reconnect your account.",
      });
      return NextResponse.json(
        { error: "Failed to decrypt access token" },
        { status: 500 }
      );
    }

    const plaidClient = getPlaidClient();

    // Cursor-based sync with pagination
    let cursor = connection.transactionsCursor ?? "";
    const allAdded: PlaidSyncTransaction[] = [];
    const allModified: PlaidSyncTransaction[] = [];
    const allRemoved: PlaidSyncRemovedTransaction[] = [];
    let hasMore = true;

    try {
      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor: cursor,
          count: 500,
        });

        const data = response.data;

        // Collect transactions
        for (const txn of data.added) {
          allAdded.push({
            transaction_id: txn.transaction_id,
            account_id: txn.account_id,
            amount: txn.amount,
            date: txn.date,
            name: txn.name,
            merchant_name: txn.merchant_name ?? null,
            pending: txn.pending,
          });
        }

        for (const txn of data.modified) {
          allModified.push({
            transaction_id: txn.transaction_id,
            account_id: txn.account_id,
            amount: txn.amount,
            date: txn.date,
            name: txn.name,
            merchant_name: txn.merchant_name ?? null,
            pending: txn.pending,
          });
        }

        for (const txn of data.removed) {
          allRemoved.push({
            transaction_id: txn.transaction_id!,
          });
        }

        hasMore = data.has_more;
        cursor = data.next_cursor;

        // Update account balances from the sync response
        if (data.accounts && data.accounts.length > 0) {
          await updateAccountBalances(
            db,
            data.accounts.map((acct) => ({
              account_id: acct.account_id,
              balances: {
                current: acct.balances.current,
                available: acct.balances.available,
              },
            })),
            workspace.workspaceId,
          );
        }
      }
    } catch (error: unknown) {
      // Handle Plaid-specific errors
      const plaidError = error as {
        response?: { data?: { error_code?: string; error_message?: string } };
      };
      const errorCode = plaidError?.response?.data?.error_code;

      // Handle pagination mutation error — restart from beginning
      if (errorCode === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") {
        // Don't update the cursor — keep the old one for retry
        await updateConnectionSyncStatus(db, connectionId, {
          cursor: null,
          status: "error",
          error: getUserFriendlyError(errorCode),
        });
        return NextResponse.json(
          {
            error: getUserFriendlyError(errorCode),
            errorCode,
            retryable: true,
          },
          { status: 503 }
        );
      }

      const userMessage = errorCode
        ? getUserFriendlyError(errorCode)
        : "An unexpected error occurred while syncing transactions.";

      await updateConnectionSyncStatus(db, connectionId, {
        cursor: null,
        status: "error",
        error: userMessage,
      });

      return NextResponse.json(
        {
          error: userMessage,
          errorCode: errorCode ?? "UNKNOWN",
          retryable: errorCode === "PRODUCTS_NOT_READY",
        },
        { status: 500 }
      );
    }

    // Apply all collected transaction updates to database
    const result = await syncTransactionsFromPlaid(db, connectionId, {
      added: allAdded,
      modified: allModified,
      removed: allRemoved,
    });

    // Update connection sync status and cursor
    await updateConnectionSyncStatus(db, connectionId, {
      cursor,
      status: "success",
      error: null,
    });

    return NextResponse.json({
      success: true,
      added: result.added,
      modified: result.modified,
      removed: result.removed,
      cursor,
    });
  } catch (error) {
    console.error("Error syncing transactions:", error);
    const message =
      error instanceof Error ? error.message : "Failed to sync transactions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
