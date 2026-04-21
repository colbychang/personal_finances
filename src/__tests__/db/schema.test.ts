import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { AppDatabase } from "@/db/index";
import * as schema from "@/db/schema";
import { seedCategories } from "@/db/seed";
import {
  closeTestDb,
  createTestDb,
  resetTestDb,
  seedManualAccount,
  seedManualInstitution,
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

describe("Database Schema", () => {
  it("creates all expected application tables", async () => {
    const result = await testDb.client.query<{ table_name: string }>(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name not like '__drizzle%'
      order by table_name
    `);

    expect(result.rows.map((row) => row.table_name)).toEqual([
      "account_links",
      "account_snapshots",
      "accounts",
      "budget_templates",
      "budgets",
      "categories",
      "connections",
      "institutions",
      "merchant_rules",
      "plaid_sync_jobs",
      "snapshots",
      "transaction_splits",
      "transactions",
      "workspace_members",
      "workspaces",
    ]);
  });

  it("enables RLS on all public application tables", async () => {
    const result = await testDb.client.query<{ tablename: string; rowsecurity: boolean }>(`
      select tablename, rowsecurity
      from pg_tables
      where schemaname = 'public'
        and tablename not like '__drizzle%'
      order by tablename
    `);

    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tablename: "accounts", rowsecurity: true }),
        expect.objectContaining({ tablename: "transactions", rowsecurity: true }),
        expect.objectContaining({ tablename: "workspace_members", rowsecurity: true }),
        expect.objectContaining({ tablename: "workspaces", rowsecurity: true }),
      ]),
    );
    expect(result.rows.every((row) => row.rowsecurity)).toBe(true);
  });

  it("creates workspace-member RLS policies for exposed data tables", async () => {
    const result = await testDb.client.query<{ tablename: string; policyname: string }>(`
      select tablename, policyname
      from pg_policies
      where schemaname = 'public'
      order by tablename, policyname
    `);

    expect(result.rows).toEqual(
      expect.arrayContaining([
        {
          tablename: "accounts",
          policyname: "accounts_select_workspace_member",
        },
        {
          tablename: "transactions",
          policyname: "transactions_select_workspace_member",
        },
        {
          tablename: "workspace_members",
          policyname: "workspace_members_select_workspace_member",
        },
        {
          tablename: "workspaces",
          policyname: "workspaces_select_workspace_member",
        },
      ]),
    );
  });

  it("stores monetary values as integers", async () => {
    const workspace = await seedWorkspace(db);
    const institution = await seedManualInstitution(db, "Test Bank", workspace.id);
    await seedManualAccount(db, {
      institutionId: institution.id,
      name: "Checking",
      type: "checking",
      balanceCurrent: 812_543,
      isAsset: true,
      workspaceId: workspace.id,
    });

    const result = await testDb.client.query<{ value_type: string }>(`
      select pg_typeof(balance_current)::text as value_type
      from accounts
      limit 1
    `);

    expect(result.rows[0]?.value_type).toBe("integer");
  });

  it("enforces foreign key constraints", async () => {
    await expect(
      db.insert(schema.accounts).values({
        institutionId: 99_999,
        name: "Bad Account",
        type: "checking",
        balanceCurrent: 0,
        isAsset: true,
        currency: "USD",
        source: "manual",
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(schema.transactions).values({
        accountId: 99_999,
        postedAt: "2026-03-16",
        name: "Bad Transaction",
        amount: 1_000,
        pending: false,
        isTransfer: false,
        isExcluded: false,
        reviewState: "none",
      }),
    ).rejects.toThrow();
  });

  it("enforces workspace-scoped unique constraints for budgets, snapshots, merchant rules, accounts, and account links", async () => {
    const workspace = await seedWorkspace(db, { name: "Alpha", slug: "alpha-schema" });
    const institution = await seedManualInstitution(db, "Test Bank", workspace.id);
    const account = await seedManualAccount(db, {
      institutionId: institution.id,
      name: "Checking",
      type: "checking",
      balanceCurrent: 100_000,
      isAsset: true,
      workspaceId: workspace.id,
    });
    const [connection] = await db
      .insert(schema.connections)
      .values({
        workspaceId: workspace.id,
        institutionName: "Test Bank",
        provider: "plaid",
        accessToken: "enc-token",
        itemId: "item-test",
        isEncrypted: true,
      })
      .returning();

    await db.insert(schema.budgets).values({
      workspaceId: workspace.id,
      month: "2026-03",
      category: "Groceries",
      amount: 50_000,
    });
    await db.insert(schema.snapshots).values({
      workspaceId: workspace.id,
      month: "2026-03",
      assets: 100_000,
      liabilities: 50_000,
      netWorth: 50_000,
    });
    await db.insert(schema.merchantRules).values({
      workspaceId: workspace.id,
      merchantKey: "starbucks",
      label: "Starbucks",
      category: "Eating Out",
      isTransfer: false,
    });
    await db.insert(schema.accountLinks).values({
      workspaceId: workspace.id,
      provider: "plaid",
      externalKey: "plaid-123",
      connectionId: connection!.id,
      accountId: account.id,
      institutionName: "Test Bank",
      displayName: "Checking",
    });

    await expect(
      db.insert(schema.budgets).values({
        workspaceId: workspace.id,
        month: "2026-03",
        category: "Groceries",
        amount: 60_000,
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(schema.snapshots).values({
        workspaceId: workspace.id,
        month: "2026-03",
        assets: 200_000,
        liabilities: 60_000,
        netWorth: 140_000,
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(schema.merchantRules).values({
        workspaceId: workspace.id,
        merchantKey: "starbucks",
        label: "Starbucks v2",
        category: "Groceries",
        isTransfer: false,
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(schema.accountLinks).values({
        workspaceId: workspace.id,
        provider: "plaid",
        externalKey: "plaid-123",
        connectionId: connection!.id,
        accountId: account.id,
        institutionName: "Test Bank",
        displayName: "Savings",
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(schema.accounts).values({
        workspaceId: workspace.id,
        institutionId: institution.id,
        externalRef: "ext-123",
        name: "Extra Account",
        type: "checking",
        balanceCurrent: 0,
        isAsset: true,
        currency: "USD",
        source: "plaid",
      }),
    ).resolves.toBeDefined();

    await expect(
      db.insert(schema.accounts).values({
        workspaceId: workspace.id,
        institutionId: institution.id,
        externalRef: "ext-123",
        name: "Duplicate Ref",
        type: "checking",
        balanceCurrent: 0,
        isAsset: true,
        currency: "USD",
        source: "plaid",
      }),
    ).rejects.toThrow();
  });

  it("allows workspace-scoped duplicates across different workspaces", async () => {
    const alpha = await seedWorkspace(db, { name: "Alpha", slug: "alpha-dupes" });
    const beta = await seedWorkspace(db, { name: "Beta", slug: "beta-dupes" });

    await db.insert(schema.budgets).values({
      workspaceId: alpha.id,
      month: "2026-03",
      category: "Groceries",
      amount: 50_000,
    });

    await expect(
      db.insert(schema.budgets).values({
        workspaceId: beta.id,
        month: "2026-03",
        category: "Groceries",
        amount: 60_000,
      }),
    ).resolves.toBeDefined();
  });

  it("enforces workspace-scoped uniqueness for categories and account snapshot day uniqueness", async () => {
    const workspace = await seedWorkspace(db, { name: "Alpha", slug: "alpha-categories" });
    const otherWorkspace = await seedWorkspace(db, { name: "Beta", slug: "beta-categories" });
    const institution = await seedManualInstitution(db, "Test Bank", workspace.id);
    const account = await seedManualAccount(db, {
      institutionId: institution.id,
      name: "Checking",
      type: "checking",
      balanceCurrent: 100_000,
      isAsset: true,
      workspaceId: workspace.id,
    });

    await db.insert(schema.categories).values({
      workspaceId: workspace.id,
      name: "Test Category",
      color: "#ff0000",
      icon: "star",
      isPredefined: false,
      sortOrder: 100,
    });

    await expect(
      db.insert(schema.categories).values({
        workspaceId: workspace.id,
        name: "Test Category",
        color: "#00ff00",
        icon: "heart",
        isPredefined: false,
        sortOrder: 101,
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(schema.categories).values({
        workspaceId: otherWorkspace.id,
        name: "Test Category",
        color: "#00ff00",
        icon: "heart",
        isPredefined: false,
        sortOrder: 101,
      }),
    ).resolves.toBeDefined();

    await db.insert(schema.accountSnapshots).values({
      accountId: account.id,
      day: "2026-03-16",
      balanceCurrent: 100_000,
      isAsset: true,
    });

    await expect(
      db.insert(schema.accountSnapshots).values({
        accountId: account.id,
        day: "2026-03-16",
        balanceCurrent: 200_000,
        isAsset: true,
      }),
    ).rejects.toThrow();
  });

  it("seeds predefined categories idempotently", async () => {
    await seedCategories(db);
    await seedCategories(db);

    const categories = await db.select().from(schema.categories);
    expect(categories.length).toBeGreaterThan(5);
    expect(new Set(categories.map((category) => category.name)).size).toBe(categories.length);
    expect(categories.every((category) => category.isPredefined)).toBe(true);
  });
});
