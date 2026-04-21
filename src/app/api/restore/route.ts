import { NextRequest, NextResponse } from "next/server";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import {
  previewWorkspaceRestore,
  restoreWorkspaceBackup,
} from "@/lib/export/workspace-restore";
import {
  getDurationMs,
  getRequestLogContext,
  logError,
  logInfo,
} from "@/lib/observability/logger";
import { checkWorkspaceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const context = getRequestLogContext(request, "/api/restore");

  try {
    const { workspace } = await requireCurrentWorkspace();
    const body = await request.json();
    const backup = body?.backup;
    const dryRun = body?.dryRun !== false;

    const rateLimit = checkWorkspaceRateLimit({
      workspaceId: workspace.workspaceId,
      scope: dryRun ? "workspace-restore-preview" : "workspace-restore",
      limit: dryRun ? 20 : 3,
      windowMs: 60 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, {
        route: "/api/restore",
        message: dryRun
          ? "Too many backup previews. Please try again later."
          : "Too many restore attempts. Please try again later.",
      });
    }

    if (dryRun) {
      const preview = previewWorkspaceRestore(backup);
      logInfo("workspace_restore.preview", {
        ...context,
        workspaceId: workspace.workspaceId,
        durationMs: getDurationMs(startedAt),
      });

      return NextResponse.json(preview);
    }

    if (body?.confirm !== true) {
      return NextResponse.json(
        { error: "Restore confirmation is required." },
        { status: 400 },
      );
    }

    const result = await restoreWorkspaceBackup(undefined, workspace, backup);

    logInfo("workspace_restore.success", {
      ...context,
      workspaceId: workspace.workspaceId,
      restoredCounts: result.restoredCounts,
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json(result);
  } catch (error) {
    logError("workspace_restore.failed", error, {
      ...context,
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to restore workspace backup",
      },
      { status: 400 },
    );
  }
}
