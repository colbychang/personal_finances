import { count, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import { db } from "@/db/index";
import * as schema from "@/db/schema";

export type OperationsStatus = {
  ok: boolean;
  checkedAt: string;
  database: "ok";
  plaid: {
    totalConnections: number;
    successfulConnections: number;
    erroredConnections: number;
    syncingConnections: number;
    neverSyncedConnections: number;
    oldestLastSyncAt: string | null;
    newestLastSyncAt: string | null;
  };
  queuedSyncJobs: {
    pending: number;
    running: number;
    failed: number;
  };
};

function numberFromCount(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export async function getOperationsStatus(
  database: AppDatabase = db,
  workspaceId: number,
): Promise<OperationsStatus> {
  const connections = await database
    .select({
      lastSyncAt: schema.connections.lastSyncAt,
      lastSyncStatus: schema.connections.lastSyncStatus,
    })
    .from(schema.connections)
    .where(eq(schema.connections.workspaceId, workspaceId));

  const jobs = await database
    .select({
      status: schema.plaidSyncJobs.status,
      total: count(),
    })
    .from(schema.plaidSyncJobs)
    .where(eq(schema.plaidSyncJobs.workspaceId, workspaceId))
    .groupBy(schema.plaidSyncJobs.status);

  const syncDates = connections
    .map((connection) => connection.lastSyncAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  const jobsByStatus = new Map(
    jobs.map((job) => [job.status, numberFromCount(job.total)]),
  );

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    database: "ok",
    plaid: {
      totalConnections: connections.length,
      successfulConnections: connections.filter((connection) => connection.lastSyncStatus === "success").length,
      erroredConnections: connections.filter((connection) => connection.lastSyncStatus === "error").length,
      syncingConnections: connections.filter((connection) => connection.lastSyncStatus === "syncing").length,
      neverSyncedConnections: connections.filter((connection) => !connection.lastSyncAt).length,
      oldestLastSyncAt: syncDates[0] ?? null,
      newestLastSyncAt: syncDates[syncDates.length - 1] ?? null,
    },
    queuedSyncJobs: {
      pending: jobsByStatus.get("pending") ?? 0,
      running: jobsByStatus.get("running") ?? 0,
      failed: jobsByStatus.get("failed") ?? 0,
    },
  };
}
