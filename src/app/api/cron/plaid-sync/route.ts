import { NextResponse } from "next/server";
import {
  getPlaidConnectionsDueForSync,
  syncPlaidConnection,
  PlaidConnectionSyncError,
} from "@/lib/plaid/sync";
import {
  getDurationMs,
  getRequestLogContext,
  logError,
  logInfo,
  logWarn,
} from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV !== "production") {
    return true;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const context = getRequestLogContext(request, "/api/cron/plaid-sync");

  if (!isAuthorized(request)) {
    logWarn("plaid.background_sync.unauthorized", context);
    return new Response("Unauthorized", { status: 401 });
  }

  const staleAfterHours = getPositiveInteger(
    process.env.PLAID_BACKGROUND_SYNC_STALE_HOURS,
    12,
  );
  const limit = getPositiveInteger(process.env.PLAID_BACKGROUND_SYNC_LIMIT, 10);
  const staleAfterMs = staleAfterHours * 60 * 60 * 1000;

  logInfo("plaid.background_sync.start", {
    ...context,
    staleAfterHours,
    limit,
  });

  try {
    const dueConnections = await getPlaidConnectionsDueForSync({
      staleAfterMs,
      limit,
    });

    const synced: Array<{
      connectionId: number;
      workspaceId: number | null;
      institutionName: string;
      added: number;
      modified: number;
      removed: number;
    }> = [];
    const failed: Array<{
      connectionId: number;
      workspaceId: number | null;
      institutionName: string;
      error: string;
      errorCode: string;
      retryable: boolean;
    }> = [];

    for (const connection of dueConnections) {
      try {
        const result = await syncPlaidConnection({
          connectionId: connection.id,
          workspaceId: connection.workspaceId ?? undefined,
          source: "cron",
          requestId: context.requestId,
        });
        synced.push({
          connectionId: connection.id,
          workspaceId: connection.workspaceId,
          institutionName: connection.institutionName,
          added: result.added,
          modified: result.modified,
          removed: result.removed,
        });
      } catch (error) {
        failed.push({
          connectionId: connection.id,
          workspaceId: connection.workspaceId,
          institutionName: connection.institutionName,
          error:
            error instanceof PlaidConnectionSyncError
              ? error.userMessage
              : "Unknown Plaid sync failure",
          errorCode:
            error instanceof PlaidConnectionSyncError ? error.errorCode : "UNKNOWN",
          retryable:
            error instanceof PlaidConnectionSyncError ? error.retryable : false,
        });
      }
    }

    const response = {
      ok: failed.length === 0,
      checked: dueConnections.length,
      synced,
      failed,
      durationMs: getDurationMs(startedAt),
    };

    logInfo("plaid.background_sync.done", response);

    return NextResponse.json(response, {
      status: failed.length > 0 ? 207 : 200,
    });
  } catch (error) {
    logError("plaid.background_sync.failed", error, {
      ...context,
      durationMs: getDurationMs(startedAt),
    });
    return NextResponse.json(
      { ok: false, error: "Background Plaid sync failed" },
      { status: 500 },
    );
  }
}
