import { NextRequest, NextResponse } from "next/server";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import {
  PlaidConnectionSyncError,
  syncPlaidConnection,
} from "@/lib/plaid/sync";
import {
  getDurationMs,
  getRequestLogContext,
  logError,
  logInfo,
} from "@/lib/observability/logger";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const PLAID_SYNC_RATE_LIMIT = {
  limit: 6,
  windowMs: 15 * 60 * 1000,
};

/**
 * POST /api/plaid/sync
 * Triggers a transaction sync for a given connection.
 * Body: { connectionId: number }
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const context = getRequestLogContext(request, "/api/plaid/sync");

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

    const rateLimit = checkRateLimit({
      key: `workspace:${workspace.workspaceId}:plaid-sync:${connectionId}`,
      ...PLAID_SYNC_RATE_LIMIT,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, {
        route: "/api/plaid/sync",
        message: "This bank connection has been synced several times recently. Please try again soon.",
      });
    }

    const result = await syncPlaidConnection({
      connectionId,
      workspaceId: workspace.workspaceId,
      source: "manual",
      requestId: context.requestId,
    });

    logInfo("api.plaid_sync.success", {
      ...context,
      connectionId,
      workspaceId: workspace.workspaceId,
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json(result);
  } catch (error) {
    logError("api.plaid_sync.failed", error, {
      ...context,
      durationMs: getDurationMs(startedAt),
    });

    if (error instanceof PlaidConnectionSyncError) {
      return NextResponse.json(
        {
          error: error.userMessage,
          errorCode: error.errorCode,
          retryable: error.retryable,
        },
        { status: error.status },
      );
    }

    const message = error instanceof Error ? error.message : "Failed to sync transactions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
