import { NextResponse } from "next/server";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import {
  buildWorkspaceExport,
  buildWorkspaceExportFilename,
} from "@/lib/export/workspace-export";
import {
  getDurationMs,
  getRequestLogContext,
  logError,
  logInfo,
} from "@/lib/observability/logger";
import { checkWorkspaceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const context = getRequestLogContext(request, "/api/export");

  try {
    const { workspace } = await requireCurrentWorkspace();
    const rateLimit = checkWorkspaceRateLimit({
      workspaceId: workspace.workspaceId,
      scope: "workspace-export",
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, {
        route: "/api/export",
        message: "Too many backup exports. Please try again later.",
      });
    }

    const exportData = await buildWorkspaceExport(undefined, workspace);
    const filename = buildWorkspaceExportFilename(workspace.workspaceName, exportData.exportedAt);

    logInfo("workspace_export.success", {
      ...context,
      workspaceId: workspace.workspaceId,
      durationMs: getDurationMs(startedAt),
    });

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logError("workspace_export.failed", error, {
      ...context,
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json(
      { error: "Failed to export workspace backup" },
      { status: 500 },
    );
  }
}
