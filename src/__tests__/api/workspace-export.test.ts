import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "@/db/schema";
import {
  createConnection,
  createPlaidAccount,
  findOrCreatePlaidInstitution,
} from "@/db/queries/connections";
import {
  buildWorkspaceExport,
  buildWorkspaceExportFilename,
} from "@/lib/export/workspace-export";
import { getOperationsStatus } from "@/lib/operations/status";
import {
  closeTestDb,
  createTestDb,
  resetTestDb,
  seedWorkspace,
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

describe("workspace export", () => {
  it("builds a sanitized workspace backup", async () => {
    const workspace = await seedWorkspace(db, {
      name: "Colby's Glacier",
      slug: "colby-glacier",
    });
    const institutionId = await findOrCreatePlaidInstitution(
      db,
      "Export Bank",
      "ins_export",
      workspace.id,
    );
    const connection = await createConnection(
      db,
      {
        institutionName: "Export Bank",
        provider: "plaid",
        accessToken: "secret-access-token",
        itemId: "item-export",
        isEncrypted: true,
      },
      workspace.id,
    );
    const account = await createPlaidAccount(
      db,
      {
        institutionId,
        externalRef: "export-account",
        name: "Checking",
        mask: "1234",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 50_000,
        balanceAvailable: 45_000,
        isAsset: true,
      },
      connection.id,
      "Export Bank",
      workspace.id,
    );
    const [transaction] = await db
      .insert(schema.transactions)
      .values({
        workspaceId: workspace.id,
        accountId: account.id,
        postedAt: "2026-04-01",
        name: "Coffee",
        amount: 500,
        category: "Coffee",
        pending: false,
        isTransfer: false,
        isExcluded: false,
        reviewState: "none",
      })
      .returning();
    await db.insert(schema.transactionSplits).values({
      transactionId: transaction!.id,
      category: "Coffee",
      amount: 500,
    });
    await db.insert(schema.categories).values({
      workspaceId: null,
      name: "Built In",
      isPredefined: true,
    });
    await db.insert(schema.categories).values({
      workspaceId: workspace.id,
      name: "Custom",
      isPredefined: false,
    });

    const exported = await buildWorkspaceExport(db, {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
    });

    expect(exported.workspace.slug).toBe("colby-glacier");
    expect(exported.data.accounts).toHaveLength(1);
    expect(exported.data.transactions).toHaveLength(1);
    expect(exported.data.transactionSplits).toHaveLength(1);
    expect(exported.data.categories.map((category) => category.name).sort()).toEqual([
      "Built In",
      "Custom",
    ]);
    expect(exported.data.connections).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain("secret-access-token");
    expect(exported.data.connections[0]).toMatchObject({
      id: connection.id,
      itemId: "item-export",
      provider: "plaid",
    });
  });

  it("builds stable backup filenames", () => {
    expect(
      buildWorkspaceExportFilename("Colby's Glacier!", "2026-04-21T12:00:00.000Z"),
    ).toBe("glacier-colby-s-glacier-backup-2026-04-21.json");
  });
});

describe("operations status", () => {
  it("summarizes Plaid connection and queue health", async () => {
    const workspace = await seedWorkspace(db, {
      name: "Ops",
      slug: "ops",
    });
    const connection = await createConnection(
      db,
      {
        institutionName: "Ops Bank",
        provider: "plaid",
        accessToken: "token",
        itemId: "item-ops",
        isEncrypted: false,
      },
      workspace.id,
    );
    await db
      .update(schema.connections)
      .set({
        lastSyncAt: "2026-04-20T00:00:00.000Z",
        lastSyncStatus: "error",
      })
      .where(eq(schema.connections.id, connection.id));
    await db.insert(schema.plaidSyncJobs).values({
      workspaceId: workspace.id,
      connectionId: connection.id,
      source: "webhook",
      status: "pending",
    });

    const status = await getOperationsStatus(db, workspace.id);

    expect(status.ok).toBe(true);
    expect(status.plaid.totalConnections).toBe(1);
    expect(status.plaid.erroredConnections).toBe(1);
    expect(status.queuedSyncJobs.pending).toBe(1);
  });
});
