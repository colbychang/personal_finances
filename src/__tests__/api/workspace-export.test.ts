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
import {
  previewWorkspaceRestore,
  restoreWorkspaceBackup,
} from "@/lib/export/workspace-restore";
import { getOperationsStatus } from "@/lib/operations/status";
import { deleteWorkspaceAndMaybeAuthUser } from "@/lib/workspace/delete-workspace";
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

  it("previews and restores a backup into a different workspace", async () => {
    const sourceWorkspace = await seedWorkspace(db, {
      name: "Source Glacier",
      slug: "source-glacier",
    });
    const targetWorkspace = await seedWorkspace(db, {
      name: "Target Glacier",
      slug: "target-glacier",
    });
    const sourceInstitutionId = await findOrCreatePlaidInstitution(
      db,
      "Restore Bank",
      "ins_restore",
      sourceWorkspace.id,
    );
    const sourceConnection = await createConnection(
      db,
      {
        institutionName: "Restore Bank",
        provider: "plaid",
        accessToken: "do-not-restore-me",
        itemId: "item-restore",
        isEncrypted: true,
      },
      sourceWorkspace.id,
    );
    const sourceAccount = await createPlaidAccount(
      db,
      {
        institutionId: sourceInstitutionId,
        externalRef: "restore-account",
        name: "Restore Checking",
        mask: "2222",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 90_000,
        balanceAvailable: 80_000,
        isAsset: true,
      },
      sourceConnection.id,
      "Restore Bank",
      sourceWorkspace.id,
    );
    const [sourceTransaction] = await db
      .insert(schema.transactions)
      .values({
        workspaceId: sourceWorkspace.id,
        accountId: sourceAccount.id,
        postedAt: "2026-04-02",
        name: "Restored Coffee",
        amount: 700,
        category: "Coffee",
        pending: false,
        isTransfer: false,
        isExcluded: false,
        reviewState: "none",
      })
      .returning();
    await db.insert(schema.transactionSplits).values({
      transactionId: sourceTransaction!.id,
      category: "Coffee",
      amount: 700,
    });
    await db.insert(schema.budgets).values({
      workspaceId: sourceWorkspace.id,
      month: "2026-04",
      category: "Coffee",
      amount: 10_000,
    });

    const targetInstitution = await findOrCreatePlaidInstitution(
      db,
      "Old Target Bank",
      "ins_old",
      targetWorkspace.id,
    );
    await createPlaidAccount(
      db,
      {
        institutionId: targetInstitution,
        externalRef: "old-target-account",
        name: "Old Target Checking",
        mask: "3333",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 10_000,
        balanceAvailable: 10_000,
        isAsset: true,
      },
      sourceConnection.id,
      "Old Target Bank",
      targetWorkspace.id,
    );

    const backup = await buildWorkspaceExport(db, {
      workspaceId: sourceWorkspace.id,
      workspaceName: sourceWorkspace.name,
      workspaceSlug: sourceWorkspace.slug,
    });
    const preview = previewWorkspaceRestore(backup);
    expect(preview.counts.transactions).toBe(1);

    const result = await restoreWorkspaceBackup(
      db,
      {
        workspaceId: targetWorkspace.id,
        workspaceName: targetWorkspace.name,
        workspaceSlug: targetWorkspace.slug,
      },
      backup,
    );

    expect(result.restoredCounts.accounts).toBe(1);
    expect(result.restoredCounts.transactions).toBe(1);
    expect(result.restoredCounts.transactionSplits).toBe(1);

    const restoredTransactions = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.workspaceId, targetWorkspace.id));
    expect(restoredTransactions).toHaveLength(1);
    expect(restoredTransactions[0]!.name).toBe("Restored Coffee");
    expect(restoredTransactions[0]!.id).not.toBe(sourceTransaction!.id);

    const restoredConnections = await db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.workspaceId, targetWorkspace.id));
    expect(restoredConnections).toHaveLength(1);
    expect(restoredConnections[0]!.accessToken).toBeNull();
    expect(restoredConnections[0]!.lastSyncStatus).toBe("restored");

    const oldTargetAccounts = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.externalRef, "old-target-account"));
    expect(oldTargetAccounts).toHaveLength(0);
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

describe("workspace deletion", () => {
  it("deletes workspace-scoped finance data and membership without deleting the auth user when disabled", async () => {
    const workspace = await seedWorkspace(db, {
      name: "Delete Me",
      slug: "delete-me",
    });
    await db.insert(schema.workspaceMembers).values({
      workspaceId: workspace.id,
      authUserId: "user-delete",
      email: "delete@example.com",
      role: "owner",
    });
    const institutionId = await findOrCreatePlaidInstitution(
      db,
      "Delete Bank",
      "ins_delete",
      workspace.id,
    );
    const connection = await createConnection(
      db,
      {
        institutionName: "Delete Bank",
        provider: "plaid",
        accessToken: "not-encrypted",
        itemId: "item-delete",
        isEncrypted: false,
      },
      workspace.id,
    );
    const account = await createPlaidAccount(
      db,
      {
        institutionId,
        externalRef: "delete-account",
        name: "Delete Checking",
        mask: "9999",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 1_000,
        balanceAvailable: 1_000,
        isAsset: true,
      },
      connection.id,
      "Delete Bank",
      workspace.id,
    );
    await db.insert(schema.transactions).values({
      workspaceId: workspace.id,
      accountId: account.id,
      postedAt: "2026-04-03",
      name: "Delete Transaction",
      amount: 1200,
      pending: false,
      isTransfer: false,
      isExcluded: false,
      reviewState: "none",
    });

    const result = await deleteWorkspaceAndMaybeAuthUser({
      database: db,
      membership: {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceSlug: workspace.slug,
        authUserId: "user-delete",
        email: "delete@example.com",
        role: "owner",
      },
      deleteAuthUser: false,
    });

    expect(result.workspaceDeleted).toBe(true);
    expect(result.authUserDeleted).toBe(false);
    await expect(
      db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspace.id)),
    ).resolves.toHaveLength(0);
    await expect(
      db.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.authUserId, "user-delete")),
    ).resolves.toHaveLength(0);
    await expect(
      db.select().from(schema.transactions).where(eq(schema.transactions.workspaceId, workspace.id)),
    ).resolves.toHaveLength(0);
    await expect(
      db.select().from(schema.accounts).where(eq(schema.accounts.workspaceId, workspace.id)),
    ).resolves.toHaveLength(0);
  });
});
