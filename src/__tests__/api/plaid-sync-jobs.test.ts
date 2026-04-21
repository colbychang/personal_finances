import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { AppDatabase } from "@/db/index";
import { createConnection } from "@/db/queries/connections";
import {
  claimDuePlaidSyncJobs,
  completePlaidSyncJob,
  enqueuePlaidSyncJob,
  failPlaidSyncJob,
  getOpenPlaidSyncJobConnectionIds,
} from "@/db/queries/plaid-sync-jobs";
import {
  closeTestDb,
  createTestDb,
  resetTestDb,
  type TestDb,
} from "@/__tests__/helpers/test-db";

let testDb: TestDb;
let db: AppDatabase;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
});

afterAll(async () => {
  await closeTestDb(testDb);
});

beforeEach(async () => {
  await resetTestDb(db);
});

async function setupPlaidConnection() {
  return createConnection(db, {
    institutionName: "Queued Bank",
    provider: "plaid",
    accessToken: "token",
    itemId: "queued-item",
    isEncrypted: false,
  });
}

describe("Plaid sync jobs", () => {
  it("deduplicates open jobs for the same connection", async () => {
    const connection = await setupPlaidConnection();

    const first = await enqueuePlaidSyncJob(db, {
      connectionId: connection.id,
      workspaceId: connection.workspaceId,
      source: "webhook",
    });
    const second = await enqueuePlaidSyncJob(db, {
      connectionId: connection.id,
      workspaceId: connection.workspaceId,
      source: "webhook",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
  });

  it("claims only due pending jobs and increments attempts", async () => {
    const connection = await setupPlaidConnection();
    const futureRunAfter = new Date(Date.now() + 60_000).toISOString();

    const due = await enqueuePlaidSyncJob(db, {
      connectionId: connection.id,
      workspaceId: connection.workspaceId,
      source: "webhook",
      runAfter: new Date(Date.now() - 60_000).toISOString(),
    });
    const otherConnection = await createConnection(db, {
      institutionName: "Future Bank",
      provider: "plaid",
      accessToken: "token-2",
      itemId: "future-item",
      isEncrypted: false,
    });
    await enqueuePlaidSyncJob(db, {
      connectionId: otherConnection.id,
      workspaceId: otherConnection.workspaceId,
      source: "webhook",
      runAfter: futureRunAfter,
    });

    const claimed = await claimDuePlaidSyncJobs(db, {
      limit: 5,
      now: new Date().toISOString(),
    });

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.id).toBe(due.job.id);
    expect(claimed[0]?.status).toBe("running");
    expect(claimed[0]?.attempts).toBe(1);
  });

  it("marks completed jobs closed and allows a new job later", async () => {
    const connection = await setupPlaidConnection();
    const { job } = await enqueuePlaidSyncJob(db, {
      connectionId: connection.id,
      workspaceId: connection.workspaceId,
      source: "webhook",
    });
    const [claimed] = await claimDuePlaidSyncJobs(db, { limit: 1 });

    await completePlaidSyncJob(db, claimed!.id);
    const openIds = await getOpenPlaidSyncJobConnectionIds(db);
    const next = await enqueuePlaidSyncJob(db, {
      connectionId: connection.id,
      workspaceId: connection.workspaceId,
      source: "webhook",
    });

    expect(openIds.has(connection.id)).toBe(false);
    expect(next.created).toBe(true);
    expect(next.job.id).not.toBe(job.id);
  });

  it("requeues retryable failures with backoff", async () => {
    const connection = await setupPlaidConnection();
    await enqueuePlaidSyncJob(db, {
      connectionId: connection.id,
      workspaceId: connection.workspaceId,
      source: "webhook",
    });
    const [claimed] = await claimDuePlaidSyncJobs(db, { limit: 1 });

    await failPlaidSyncJob(db, claimed!, {
      error: "Plaid was not ready",
      retry: true,
    });

    const openIds = await getOpenPlaidSyncJobConnectionIds(db);
    const reclaimed = await claimDuePlaidSyncJobs(db, {
      limit: 1,
      now: new Date().toISOString(),
    });

    expect(openIds.has(connection.id)).toBe(true);
    expect(reclaimed).toHaveLength(0);
  });
});
