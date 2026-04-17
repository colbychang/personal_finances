import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "@/db/schema";
import { seedCategories } from "@/db/seed";
import {
  applyBudgetTemplatesToMonth,
  copyBudgetsFromMonth,
  deleteBudget,
  getBudgetsForMonth,
  getBudgetTemplates,
  replaceBudgetTemplates,
  replaceBudgetTemplatesFromMonth,
  upsertBudget,
  upsertBudgetForWorkspace,
} from "@/db/queries/budgets";
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
  await seedCategories(db);
});

async function seedCheckingAccount(workspaceId?: number) {
  const institution = await seedManualInstitution(db, "Test Bank", workspaceId);
  const account = await seedManualAccount(db, {
    institutionId: institution.id,
    name: "Checking",
    type: "checking",
    balanceCurrent: 500_000,
    isAsset: true,
    workspaceId,
  });

  return account;
}

describe("upsertBudget", () => {
  it("creates and updates a budget row", async () => {
    const created = await upsertBudget(db, {
      month: "2026-03",
      category: "Groceries",
      amount: 50_000,
    });

    expect(created.month).toBe("2026-03");
    expect(created.category).toBe("Groceries");
    expect(created.amount).toBe(50_000);

    const updated = await upsertBudget(db, {
      month: "2026-03",
      category: "Groceries",
      amount: 75_000,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.amount).toBe(75_000);

    const rows = await db.select().from(schema.budgets);
    expect(rows).toHaveLength(1);
  });

  it("keeps budgets separate across categories and months", async () => {
    await upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50_000 });
    await upsertBudget(db, { month: "2026-03", category: "Travel", amount: 120_000 });
    await upsertBudget(db, { month: "2026-04", category: "Groceries", amount: 60_000 });

    const rows = await db.select().from(schema.budgets);
    expect(rows).toHaveLength(3);
  });
});

describe("copyBudgetsFromMonth", () => {
  it("copies budgets into a target month and overwrites existing rows", async () => {
    await upsertBudget(db, { month: "2026-02", category: "Groceries", amount: 50_000 });
    await upsertBudget(db, { month: "2026-02", category: "Eating Out", amount: 30_000 });
    await upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 10_000 });

    const copied = await copyBudgetsFromMonth(db, "2026-02", "2026-03");
    expect(copied).toBe(2);

    const march = await db
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.month, "2026-03"));

    expect(march).toHaveLength(2);
    expect(march.find((row) => row.category === "Groceries")?.amount).toBe(50_000);
    expect(march.find((row) => row.category === "Eating Out")?.amount).toBe(30_000);
  });

  it("returns -1 when the source month has no budgets", async () => {
    await expect(copyBudgetsFromMonth(db, "2026-01", "2026-02")).resolves.toBe(-1);
  });
});

describe("budget templates", () => {
  it("inherits the default template when a month has no explicit budgets", async () => {
    await replaceBudgetTemplates(db, [
      { category: "Groceries", amount: 50_000 },
      { category: "Travel", amount: 120_000 },
    ]);

    const april = await getBudgetsForMonth(db, "2026-04");

    expect(april.budgets).toHaveLength(2);
    expect(april.budgets.find((budget) => budget.category === "Groceries")?.budgeted).toBe(50_000);
    expect(
      april.budgets.find((budget) => budget.category === "Groceries")?.isInheritedDefault,
    ).toBe(true);
  });

  it("lets explicit month budgets override inherited template values", async () => {
    await replaceBudgetTemplates(db, [
      { category: "Groceries", amount: 50_000 },
      { category: "Travel", amount: 120_000 },
    ]);
    await upsertBudget(db, { month: "2026-04", category: "Groceries", amount: 65_000 });

    const april = await getBudgetsForMonth(db, "2026-04");

    expect(april.budgets.find((budget) => budget.category === "Groceries")?.budgeted).toBe(65_000);
    expect(
      april.budgets.find((budget) => budget.category === "Groceries")?.isInheritedDefault,
    ).toBe(false);
    expect(april.budgets.find((budget) => budget.category === "Travel")?.budgeted).toBe(120_000);
  });

  it("saves the visible month model as the new default template", async () => {
    await replaceBudgetTemplates(db, [
      { category: "Groceries", amount: 50_000 },
      { category: "Travel", amount: 120_000 },
    ]);
    await upsertBudget(db, { month: "2026-04", category: "Groceries", amount: 70_000 });

    const saved = await replaceBudgetTemplatesFromMonth(db, "2026-04");
    expect(saved).toBe(2);

    const templates = await getBudgetTemplates(db);
    expect(templates.find((template) => template.category === "Groceries")?.amount).toBe(70_000);
    expect(templates.find((template) => template.category === "Travel")?.amount).toBe(120_000);
  });

  it("applies the current default template to a month", async () => {
    await replaceBudgetTemplates(db, [
      { category: "Groceries", amount: 50_000 },
      { category: "Travel", amount: 120_000 },
    ]);

    const applied = await applyBudgetTemplatesToMonth(db, "2026-06");
    expect(applied).toBe(2);

    const june = await getBudgetsForMonth(db, "2026-06");
    expect(june.budgets.find((budget) => budget.category === "Groceries")?.budgeted).toBe(50_000);
    expect(
      june.budgets.find((budget) => budget.category === "Groceries")?.isInheritedDefault,
    ).toBe(false);
  });

  it("returns -1 when applying or saving a missing template model", async () => {
    await expect(applyBudgetTemplatesToMonth(db, "2026-06")).resolves.toBe(-1);
    await expect(replaceBudgetTemplatesFromMonth(db, "2026-06")).resolves.toBe(-1);
  });
});

describe("getBudgetsForMonth", () => {
  it("computes spending, unbudgeted totals, and review summary", async () => {
    const account = await seedCheckingAccount();
    await upsertBudget(db, { month: "2026-04", category: "Groceries", amount: 60_000 });
    await upsertBudget(db, { month: "2026-04", category: "Rent/Home", amount: 200_000 });

    const [groceries, rent, review, hiddenTransfer, hiddenIncomeOffset] = await db
      .insert(schema.transactions)
      .values([
        {
          accountId: account.id,
          postedAt: "2026-04-05",
          name: "Whole Foods",
          amount: 12_500,
          category: "Groceries",
          pending: false,
          isTransfer: false,
          isExcluded: false,
          reviewState: "none",
        },
        {
          accountId: account.id,
          postedAt: "2026-04-06",
          name: "Rent",
          amount: 200_000,
          category: "Rent/Home",
          pending: false,
          isTransfer: false,
          isExcluded: false,
          reviewState: "none",
        },
        {
          accountId: account.id,
          postedAt: "2026-04-07",
          name: "Mystery charge",
          amount: 4_500,
          category: null,
          pending: false,
          isTransfer: false,
          isExcluded: false,
          reviewState: "none",
        },
        {
          accountId: account.id,
          postedAt: "2026-04-08",
          name: "Transfer to savings",
          amount: 100_000,
          category: null,
          pending: false,
          isTransfer: true,
          isExcluded: false,
          reviewState: "none",
        },
        {
          accountId: account.id,
          postedAt: "2026-04-09",
          name: "Roommate reimbursement",
          amount: -50_000,
          category: "Rent/Home",
          pending: false,
          isTransfer: false,
          isExcluded: false,
          reviewState: "none",
        },
      ])
      .returning();

    await db.insert(schema.transactionSplits).values([
      {
        transactionId: groceries.id,
        category: "Groceries",
        amount: 10_000,
      },
      {
        transactionId: groceries.id,
        category: "Eating Out",
        amount: 2_500,
      },
    ]);

    const summary = await getBudgetsForMonth(db, "2026-04");

    const groceriesBudget = summary.budgets.find((budget) => budget.category === "Groceries");
    const rentBudget = summary.budgets.find((budget) => budget.category === "Rent/Home");
    const eatingOut = summary.unbudgeted.find((budget) => budget.category === "Eating Out");

    expect(groceriesBudget?.spent).toBe(10_000);
    expect(groceriesBudget?.remaining).toBe(50_000);
    expect(rentBudget?.spent).toBe(150_000);
    expect(eatingOut?.spent).toBe(2_500);
    expect(summary.totalBudgeted).toBe(260_000);
    expect(summary.totalSpent).toBe(162_500);
    expect(summary.reviewSummary.uncategorizedCount).toBe(1);
    expect(summary.reviewSummary.uncategorizedAmount).toBe(4_500);
    expect(summary.reviewSummary.transactions[0]?.id).toBe(review.id);
    expect(summary.reviewSummary.transactions.some((txn) => txn.id === hiddenTransfer.id)).toBe(
      false,
    );
    expect(
      summary.budgets
        .flatMap((budget) => budget.transactions)
        .some((txn) => txn.id === hiddenIncomeOffset.id),
    ).toBe(true);
  });

  it("uses override month for budget calculations", async () => {
    const account = await seedCheckingAccount();
    await upsertBudget(db, { month: "2026-05", category: "Travel", amount: 80_000 });

    await db.insert(schema.transactions).values({
      accountId: account.id,
      postedAt: "2026-04-28",
      overrideMonth: "2026-05",
      name: "Flight deposit",
      amount: 25_000,
      category: "Travel",
      pending: false,
      isTransfer: false,
      isExcluded: false,
      reviewState: "none",
    });

    const april = await getBudgetsForMonth(db, "2026-04");
    const may = await getBudgetsForMonth(db, "2026-05");

    expect(april.budgets).toHaveLength(0);
    expect(may.budgets.find((budget) => budget.category === "Travel")?.spent).toBe(25_000);
  });

  it("scopes budgets and templates by workspace", async () => {
    const alpha = await seedWorkspace(db, { name: "Alpha", slug: "alpha" });
    const beta = await seedWorkspace(db, { name: "Beta", slug: "beta" });

    await upsertBudgetForWorkspace(
      db,
      { month: "2026-03", category: "Groceries", amount: 40_000 },
      alpha.id,
    );
    await replaceBudgetTemplates(db, [{ category: "Travel", amount: 90_000 }], beta.id);

    const alphaMarch = await getBudgetsForMonth(db, "2026-03", alpha.id);
    const betaMarch = await getBudgetsForMonth(db, "2026-03", beta.id);

    expect(alphaMarch.budgets.map((budget) => budget.category)).toEqual(["Groceries"]);
    expect(betaMarch.budgets.map((budget) => budget.category)).toEqual(["Travel"]);
  });
});

describe("deleteBudget", () => {
  it("deletes an existing budget row and returns false for missing rows", async () => {
    await upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50_000 });

    await expect(deleteBudget(db, "2026-03", "Groceries")).resolves.toBe(true);
    await expect(deleteBudget(db, "2026-03", "Groceries")).resolves.toBe(false);

    const rows = await db.select().from(schema.budgets);
    expect(rows).toHaveLength(0);
  });
});
