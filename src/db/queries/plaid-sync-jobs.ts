import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "@/db/schema";

type DB = AppDatabase;

export type PlaidSyncJob = typeof schema.plaidSyncJobs.$inferSelect;
export type PlaidSyncJobSource = "webhook" | "cron" | "manual";

const OPEN_JOB_STATUSES = ["pending", "running"] as const;

function nowIso() {
  return new Date().toISOString();
}

function backoffRunAfter(attempts: number) {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1) * 5);
  return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
}

export async function enqueuePlaidSyncJob(
  database: DB,
  input: {
    connectionId: number;
    workspaceId: number | null;
    source: PlaidSyncJobSource;
    runAfter?: string;
  },
): Promise<{ job: PlaidSyncJob; created: boolean }> {
  const [existing] = await database
    .select()
    .from(schema.plaidSyncJobs)
    .where(
      and(
        eq(schema.plaidSyncJobs.connectionId, input.connectionId),
        inArray(schema.plaidSyncJobs.status, [...OPEN_JOB_STATUSES]),
      ),
    )
    .orderBy(asc(schema.plaidSyncJobs.runAfter), asc(schema.plaidSyncJobs.id))
    .limit(1);

  if (existing) {
    return { job: existing, created: false };
  }

  const [job] = await database
    .insert(schema.plaidSyncJobs)
    .values({
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      source: input.source,
      runAfter: input.runAfter ?? nowIso(),
      status: "pending",
    })
    .returning();

  return { job: job!, created: true };
}

export async function claimDuePlaidSyncJobs(
  database: DB,
  {
    limit,
    now = nowIso(),
  }: {
    limit: number;
    now?: string;
  },
): Promise<PlaidSyncJob[]> {
  const dueJobs = await database
    .select()
    .from(schema.plaidSyncJobs)
    .where(and(eq(schema.plaidSyncJobs.status, "pending"), lte(schema.plaidSyncJobs.runAfter, now)))
    .orderBy(asc(schema.plaidSyncJobs.runAfter), asc(schema.plaidSyncJobs.id))
    .limit(limit);

  const claimed: PlaidSyncJob[] = [];
  for (const job of dueJobs) {
    const [updated] = await database
      .update(schema.plaidSyncJobs)
      .set({
        status: "running",
        attempts: sql`${schema.plaidSyncJobs.attempts} + 1`,
        startedAt: nowIso(),
        updatedAt: nowIso(),
      })
      .where(and(eq(schema.plaidSyncJobs.id, job.id), eq(schema.plaidSyncJobs.status, "pending")))
      .returning();

    if (updated) {
      claimed.push(updated);
    }
  }

  return claimed;
}

export async function completePlaidSyncJob(database: DB, jobId: number): Promise<void> {
  await database
    .update(schema.plaidSyncJobs)
    .set({
      status: "succeeded",
      lastError: null,
      finishedAt: nowIso(),
      updatedAt: nowIso(),
    })
    .where(eq(schema.plaidSyncJobs.id, jobId));
}

export async function failPlaidSyncJob(
  database: DB,
  job: PlaidSyncJob,
  {
    error,
    retry,
  }: {
    error: string;
    retry: boolean;
  },
): Promise<void> {
  await database
    .update(schema.plaidSyncJobs)
    .set({
      status: retry ? "pending" : "failed",
      runAfter: retry ? backoffRunAfter(job.attempts) : job.runAfter,
      lastError: error,
      finishedAt: retry ? null : nowIso(),
      updatedAt: nowIso(),
    })
    .where(eq(schema.plaidSyncJobs.id, job.id));
}

export async function getOpenPlaidSyncJobConnectionIds(database: DB): Promise<Set<number>> {
  const jobs = await database
    .select({ connectionId: schema.plaidSyncJobs.connectionId })
    .from(schema.plaidSyncJobs)
    .where(inArray(schema.plaidSyncJobs.status, [...OPEN_JOB_STATUSES]));

  return new Set(jobs.map((job) => job.connectionId));
}
