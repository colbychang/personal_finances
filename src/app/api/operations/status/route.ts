import { NextResponse } from "next/server";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import { getOperationsStatus } from "@/lib/operations/status";
import {
  getDurationMs,
  getRequestLogContext,
  logError,
  logInfo,
} from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const context = getRequestLogContext(request, "/api/operations/status");

  try {
    const { workspace } = await requireCurrentWorkspace();
    const status = await getOperationsStatus(undefined, workspace.workspaceId);

    logInfo("operations.status.ok", {
      ...context,
      workspaceId: workspace.workspaceId,
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json(status);
  } catch (error) {
    logError("operations.status.failed", error, {
      ...context,
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json(
      { ok: false, error: "Failed to load operations status" },
      { status: 500 },
    );
  }
}
