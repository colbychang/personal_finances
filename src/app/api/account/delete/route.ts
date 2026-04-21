import { NextRequest, NextResponse } from "next/server";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import {
  getDurationMs,
  getRequestLogContext,
  logError,
  logWarn,
} from "@/lib/observability/logger";
import { checkWorkspaceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { deleteWorkspaceAndMaybeAuthUser } from "@/lib/workspace/delete-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const context = getRequestLogContext(request, "/api/account/delete");

  try {
    const { user, workspace } = await requireCurrentWorkspace();
    const rateLimit = checkWorkspaceRateLimit({
      workspaceId: workspace.workspaceId,
      scope: "account-delete",
      limit: 3,
      windowMs: 60 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, {
        route: "/api/account/delete",
        message: "Too many deletion attempts. Please try again later.",
      });
    }

    const body = await request.json();
    const confirmEmail = String(body?.confirmEmail ?? "").trim().toLowerCase();
    const expectedEmail = String(user.email ?? workspace.email).trim().toLowerCase();

    if (!expectedEmail || confirmEmail !== expectedEmail) {
      logWarn("account_delete.confirmation_failed", {
        ...context,
        workspaceId: workspace.workspaceId,
      });

      return NextResponse.json(
        { error: "Type your account email exactly to confirm deletion." },
        { status: 400 },
      );
    }

    const result = await deleteWorkspaceAndMaybeAuthUser({
      membership: workspace,
      deleteAuthUser: body?.deleteAuthUser !== false,
    });

    return NextResponse.json({
      ...result,
      durationMs: getDurationMs(startedAt),
    });
  } catch (error) {
    logError("account_delete.failed", error, {
      ...context,
      durationMs: getDurationMs(startedAt),
    });

    return NextResponse.json(
      { error: "Failed to delete account data." },
      { status: 500 },
    );
  }
}
