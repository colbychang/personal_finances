import { NextResponse } from "next/server";
import { db } from "@/db/index";
import { getConnectionByItemId } from "@/db/queries/connections";
import {
  PlaidConnectionSyncError,
  syncPlaidConnection,
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

type PlaidWebhookPayload = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  environment?: string;
  new_transactions?: number;
};

const TRANSACTION_SYNC_WEBHOOK_CODES = new Set([
  "SYNC_UPDATES_AVAILABLE",
  "DEFAULT_UPDATE",
  "INITIAL_UPDATE",
  "HISTORICAL_UPDATE",
]);

function isAuthorized(request: Request) {
  const expectedSecret = process.env.PLAID_WEBHOOK_SECRET;
  if (!expectedSecret && process.env.NODE_ENV !== "production") {
    return true;
  }

  if (!expectedSecret) {
    return false;
  }

  const url = new URL(request.url);
  return url.searchParams.get("secret") === expectedSecret;
}

function shouldSyncFromWebhook(payload: PlaidWebhookPayload) {
  return (
    payload.webhook_type === "TRANSACTIONS" &&
    Boolean(payload.item_id) &&
    TRANSACTION_SYNC_WEBHOOK_CODES.has(payload.webhook_code ?? "")
  );
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const context = getRequestLogContext(request, "/api/plaid/webhook");

  if (!isAuthorized(request)) {
    logWarn("plaid.webhook.unauthorized", context);
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: PlaidWebhookPayload;
  try {
    payload = (await request.json()) as PlaidWebhookPayload;
  } catch (error) {
    logError("plaid.webhook.parse_failed", error, context);
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  const logContext = {
    ...context,
    webhookType: payload.webhook_type,
    webhookCode: payload.webhook_code,
    itemId: payload.item_id,
    environment: payload.environment,
    newTransactions: payload.new_transactions,
  };

  logInfo("plaid.webhook.received", logContext);

  if (!shouldSyncFromWebhook(payload)) {
    logInfo("plaid.webhook.ignored", {
      ...logContext,
      durationMs: getDurationMs(startedAt),
    });
    return NextResponse.json({ ok: true, action: "ignored" });
  }

  const connection = await getConnectionByItemId(db, payload.item_id!);
  if (!connection) {
    logWarn("plaid.webhook.connection_not_found", {
      ...logContext,
      durationMs: getDurationMs(startedAt),
    });
    return NextResponse.json({ ok: true, action: "connection_not_found" });
  }

  try {
    const result = await syncPlaidConnection({
      connectionId: connection.id,
      workspaceId: connection.workspaceId ?? undefined,
      source: "webhook",
      requestId: context.requestId,
    });

    logInfo("plaid.webhook.synced", {
      ...logContext,
      connectionId: connection.id,
      workspaceId: connection.workspaceId,
      added: result.added,
      modified: result.modified,
      removed: result.removed,
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json({
      ok: true,
      action: "synced",
      connectionId: connection.id,
      added: result.added,
      modified: result.modified,
      removed: result.removed,
    });
  } catch (error) {
    logError("plaid.webhook.sync_failed", error, {
      ...logContext,
      connectionId: connection.id,
      workspaceId: connection.workspaceId,
      durationMs: getDurationMs(startedAt),
    });

    if (error instanceof PlaidConnectionSyncError && error.retryable) {
      return NextResponse.json(
        {
          ok: false,
          action: "retryable_sync_failed",
          error: error.userMessage,
          errorCode: error.errorCode,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: false,
      action: "sync_failed",
      error:
        error instanceof PlaidConnectionSyncError
          ? error.userMessage
          : "Plaid webhook sync failed",
    });
  }
}
