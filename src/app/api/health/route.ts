import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/index";
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
  const context = getRequestLogContext(request, "/api/health");

  try {
    await db.execute(sql`select 1`);
    const response = {
      ok: true,
      database: "ok",
      timestamp: new Date().toISOString(),
      durationMs: getDurationMs(startedAt),
    };
    logInfo("health.ok", { ...context, durationMs: response.durationMs });
    return NextResponse.json(response);
  } catch (error) {
    logError("health.failed", error, {
      ...context,
      durationMs: getDurationMs(startedAt),
    });
    return NextResponse.json(
      {
        ok: false,
        database: "error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
