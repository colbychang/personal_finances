import { NextResponse } from "next/server";
import { db } from "@/db/index";
import {
  claimDuePlaidSyncJobs,
  completePlaidSyncJob,
  failPlaidSyncJob,
  getOpenPlaidSyncJobConnectionIds,
  type PlaidSyncJob,
} from "@/db/queries/plaid-sync-jobs";
import {
  getPlaidConnectionsDueForSync,
  syncPlaidConnection,
  PlaidConnectionSyncError,
} from "@/lib/plaid/sync";
import { updatePlaidItemWebhookForConnection } from "@/lib/plaid/webhook";
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

function getSyncErrorSummary(error: unknown) {
  if (error instanceof PlaidConnectionSyncError) {
    return {
      error: error.userMessage,
      errorCode: error.errorCode,
      retryable: error.retryable,
    };
  }

  return {
    error: error instanceof Error ? error.message : "Unknown Plaid sync failure",
    errorCode: "UNKNOWN",
    retryable: true,
  };
}

function shouldRetrySyncJob(error: unknown, job: PlaidSyncJob, maxAttempts: number) {
  if (job.attempts >= maxAttempts) {
    return false;
  }

  if (error instanceof PlaidConnectionSyncError) {
    return error.retryable;
  }

  return true;
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
  const jobLimit = getPositiveInteger(process.env.PLAID_SYNC_JOB_LIMIT, 10);
  const maxJobAttempts = getPositiveInteger(process.env.PLAID_SYNC_JOB_MAX_ATTEMPTS, 3);
  const staleAfterMs = staleAfterHours * 60 * 60 * 1000;

  logInfo("plaid.background_sync.start", {
    ...context,
    staleAfterHours,
    limit,
    jobLimit,
    maxJobAttempts,
  });

  try {
    const dueJobs = await claimDuePlaidSyncJobs(db, { limit: jobLimit });
    const jobResults: Array<{
      jobId: number;
      connectionId: number;
      workspaceId: number | null;
      status: "succeeded" | "retrying" | "failed";
      added?: number;
      modified?: number;
      removed?: number;
      error?: string;
      errorCode?: string;
    }> = [];

    for (const job of dueJobs) {
      try {
        const result = await syncPlaidConnection({
          connectionId: job.connectionId,
          workspaceId: job.workspaceId ?? undefined,
          source: "webhook",
          requestId: context.requestId,
        });

        await completePlaidSyncJob(db, job.id);
        jobResults.push({
          jobId: job.id,
          connectionId: job.connectionId,
          workspaceId: job.workspaceId,
          status: "succeeded",
          added: result.added,
          modified: result.modified,
          removed: result.removed,
        });
      } catch (error) {
        const summary = getSyncErrorSummary(error);
        const retry = shouldRetrySyncJob(error, job, maxJobAttempts);
        await failPlaidSyncJob(db, job, {
          error: summary.error,
          retry,
        });
        jobResults.push({
          jobId: job.id,
          connectionId: job.connectionId,
          workspaceId: job.workspaceId,
          status: retry ? "retrying" : "failed",
          error: summary.error,
          errorCode: summary.errorCode,
        });
      }
    }

    const openJobConnectionIds = await getOpenPlaidSyncJobConnectionIds(db);
    const dueConnections = await getPlaidConnectionsDueForSync({
      staleAfterMs,
      limit,
    }).then((connections) =>
      connections.filter((connection) => !openJobConnectionIds.has(connection.id)),
    );

    const synced: Array<{
      connectionId: number;
      workspaceId: number | null;
      institutionName: string;
      added: number;
      modified: number;
      removed: number;
      webhookUpdated: boolean;
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
      let webhookUpdated = false;
      try {
        const webhookResult = await updatePlaidItemWebhookForConnection({
          connectionId: connection.id,
          workspaceId: connection.workspaceId ?? undefined,
          source: "cron",
          requestId: context.requestId,
        });
        webhookUpdated = webhookResult.updated;

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
          webhookUpdated,
        });
      } catch (error) {
        const summary = getSyncErrorSummary(error);
        failed.push({
          connectionId: connection.id,
          workspaceId: connection.workspaceId,
          institutionName: connection.institutionName,
          ...summary,
        });
      }
    }

    const response = {
      ok: failed.length === 0 && jobResults.every((job) => job.status !== "failed"),
      queuedJobsChecked: dueJobs.length,
      queuedJobs: jobResults,
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
