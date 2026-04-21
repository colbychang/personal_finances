import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import { db } from "@/db/index";
import * as schema from "@/db/schema";
import { getConnectionById } from "@/db/queries/connections";
import {
  syncTransactionsFromPlaid,
  updateAccountBalances,
  updateConnectionSyncStatus,
  type PlaidSyncRemovedTransaction,
  type PlaidSyncTransaction,
} from "@/db/queries/sync";
import { decrypt } from "@/lib/encryption";
import { getPlaidClient } from "@/lib/plaid";
import { getDurationMs, logError, logInfo, logWarn } from "@/lib/observability/logger";

type PlaidConnection = typeof schema.connections.$inferSelect;

export interface PlaidSyncResult {
  success: true;
  connectionId: number;
  workspaceId: number | null;
  added: number;
  modified: number;
  removed: number;
  cursor: string;
}

export class PlaidConnectionSyncError extends Error {
  status: number;
  errorCode: string;
  retryable: boolean;
  userMessage: string;

  constructor(
    userMessage: string,
    {
      status = 500,
      errorCode = "UNKNOWN",
      retryable = false,
    }: {
      status?: number;
      errorCode?: string;
      retryable?: boolean;
    } = {},
  ) {
    super(userMessage);
    this.name = "PlaidConnectionSyncError";
    this.status = status;
    this.errorCode = errorCode;
    this.retryable = retryable;
    this.userMessage = userMessage;
  }
}

export function getUserFriendlyPlaidSyncError(errorCode: string): string {
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

function getPlaidErrorCode(error: unknown) {
  const plaidError = error as {
    response?: { data?: { error_code?: string; error_message?: string } };
  };
  return plaidError?.response?.data?.error_code;
}

function decryptAccessToken(connection: PlaidConnection) {
  if (!connection.accessToken) {
    throw new PlaidConnectionSyncError("Connection has no access token", {
      status: 400,
      errorCode: "MISSING_ACCESS_TOKEN",
    });
  }

  try {
    return connection.isEncrypted ? decrypt(connection.accessToken) : connection.accessToken;
  } catch {
    throw new PlaidConnectionSyncError(
      "Failed to decrypt access token. Please reconnect your account.",
      {
        status: 500,
        errorCode: "ACCESS_TOKEN_DECRYPTION_FAILED",
      },
    );
  }
}

async function getConnectionForSync(
  database: AppDatabase,
  connectionId: number,
  workspaceId?: number,
) {
  const connection = await getConnectionById(database, connectionId, workspaceId);
  if (!connection) {
    throw new PlaidConnectionSyncError("Connection not found", {
      status: 404,
      errorCode: "CONNECTION_NOT_FOUND",
    });
  }

  if (connection.provider !== "plaid") {
    throw new PlaidConnectionSyncError("Connection is not a Plaid connection", {
      status: 400,
      errorCode: "UNSUPPORTED_CONNECTION_PROVIDER",
    });
  }

  return connection;
}

export async function syncPlaidConnection({
  database = db,
  connectionId,
  workspaceId,
  source,
  requestId,
}: {
  database?: AppDatabase;
  connectionId: number;
  workspaceId?: number;
  source: "manual" | "cron" | "initial-link" | "webhook";
  requestId?: string;
}): Promise<PlaidSyncResult> {
  const startedAt = Date.now();
  const connection = await getConnectionForSync(database, connectionId, workspaceId);
  const logContext = {
    requestId,
    source,
    connectionId,
    workspaceId: connection.workspaceId,
    institutionName: connection.institutionName,
  };

  logInfo("plaid.sync.start", logContext);

  try {
    await updateConnectionSyncStatus(database, connectionId, {
      cursor: null,
      status: "syncing",
      error: null,
    });

    const accessToken = decryptAccessToken(connection);
    const plaidClient = getPlaidClient();

    let cursor = connection.transactionsCursor ?? "";
    const allAdded: PlaidSyncTransaction[] = [];
    const allModified: PlaidSyncTransaction[] = [];
    const allRemoved: PlaidSyncRemovedTransaction[] = [];
    let hasMore = true;

    try {
      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor,
          count: 500,
        });

        const data = response.data;

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

        if (data.accounts && data.accounts.length > 0) {
          await updateAccountBalances(
            database,
            data.accounts.map((acct) => ({
              account_id: acct.account_id,
              balances: {
                current: acct.balances.current,
                available: acct.balances.available,
              },
            })),
            connection.workspaceId ?? undefined,
          );
        }
      }
    } catch (error: unknown) {
      const errorCode = getPlaidErrorCode(error);

      if (errorCode === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") {
        throw new PlaidConnectionSyncError(getUserFriendlyPlaidSyncError(errorCode), {
          status: 503,
          errorCode,
          retryable: true,
        });
      }

      throw new PlaidConnectionSyncError(
        errorCode
          ? getUserFriendlyPlaidSyncError(errorCode)
          : "An unexpected error occurred while syncing transactions.",
        {
          status: 500,
          errorCode: errorCode ?? "UNKNOWN",
          retryable: errorCode === "PRODUCTS_NOT_READY",
        },
      );
    }

    const result = await syncTransactionsFromPlaid(database, connectionId, {
      added: allAdded,
      modified: allModified,
      removed: allRemoved,
    });

    await updateConnectionSyncStatus(database, connectionId, {
      cursor,
      status: "success",
      error: null,
    });

    const syncResult = {
      success: true,
      connectionId,
      workspaceId: connection.workspaceId,
      added: result.added,
      modified: result.modified,
      removed: result.removed,
      cursor,
    } satisfies PlaidSyncResult;

    logInfo("plaid.sync.success", {
      ...logContext,
      added: result.added,
      modified: result.modified,
      removed: result.removed,
      durationMs: getDurationMs(startedAt),
    });

    return syncResult;
  } catch (error) {
    const userMessage =
      error instanceof PlaidConnectionSyncError
        ? error.userMessage
        : "An unexpected error occurred while syncing transactions.";

    await updateConnectionSyncStatus(database, connectionId, {
      cursor: null,
      status: "error",
      error: userMessage,
    }).catch((statusError) => {
      logError("plaid.sync.status_update_failed", statusError, logContext);
    });

    logError("plaid.sync.failed", error, {
      ...logContext,
      durationMs: getDurationMs(startedAt),
    });

    throw error;
  }
}

export interface PlaidConnectionDueForSync {
  id: number;
  workspaceId: number | null;
  institutionName: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
}

function isRecentSyncInProgress(connection: PlaidConnectionDueForSync, now: number) {
  if (connection.lastSyncStatus !== "syncing" || !connection.lastSyncAt) {
    return false;
  }

  const lastSync = new Date(connection.lastSyncAt).getTime();
  if (Number.isNaN(lastSync)) {
    return false;
  }

  return now - lastSync < 30 * 60 * 1000;
}

function getLastSyncTimestamp(connection: PlaidConnectionDueForSync) {
  if (!connection.lastSyncAt) {
    return 0;
  }

  const timestamp = new Date(connection.lastSyncAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export async function getPlaidConnectionsDueForSync({
  database = db,
  staleAfterMs,
  limit,
}: {
  database?: AppDatabase;
  staleAfterMs: number;
  limit: number;
}): Promise<PlaidConnectionDueForSync[]> {
  const now = Date.now();
  const connections = await database
    .select({
      id: schema.connections.id,
      workspaceId: schema.connections.workspaceId,
      institutionName: schema.connections.institutionName,
      lastSyncAt: schema.connections.lastSyncAt,
      lastSyncStatus: schema.connections.lastSyncStatus,
      accessToken: schema.connections.accessToken,
    })
    .from(schema.connections)
    .where(eq(schema.connections.provider, "plaid"));

  const dueConnections = connections
    .filter((connection) => Boolean(connection.accessToken))
    .filter((connection) => !isRecentSyncInProgress(connection, now))
    .filter((connection) => now - getLastSyncTimestamp(connection) >= staleAfterMs)
    .sort((left, right) => {
      const timestampDiff = getLastSyncTimestamp(left) - getLastSyncTimestamp(right);
      return timestampDiff !== 0 ? timestampDiff : left.id - right.id;
    })
    .slice(0, limit)
    .map((connection) => ({
      id: connection.id,
      workspaceId: connection.workspaceId,
      institutionName: connection.institutionName,
      lastSyncAt: connection.lastSyncAt,
      lastSyncStatus: connection.lastSyncStatus,
    }));

  if (connections.length > dueConnections.length) {
    logWarn("plaid.background_sync.skipped_connections", {
      checked: connections.length,
      due: dueConnections.length,
    });
  }

  return dueConnections;
}
