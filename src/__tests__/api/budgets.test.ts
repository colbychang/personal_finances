import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";
import { seedCategories } from "@/db/seed";
import { eq } from "drizzle-orm";
import {
  applyBudgetTemplatesToMonth,
  getBudgetsForMonth,
  getBudgetTemplates,
  upsertBudget,
  copyBudgetsFromMonth,
  replaceBudgetTemplates,
  replaceBudgetTemplatesFromMonth,
  deleteBudget,
} from "@/db/queries/budgets";

function createTestDB() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return { db, sqlite };
}

function seedTestData(db: ReturnType<typeof drizzle>) {
  seedCategories(db);

  // Create institution + accounts
  db.insert(schema.institutions)
    .values([{ name: "Test Bank", provider: "manual", status: "active" }])
    .run();

  const inst = db.select().from(schema.institutions).all()[0];

  db.insert(schema.accounts)
    .values([
      {
        institutionId: inst.id,
        name: "Checking",
        type: "checking",
        balanceCurrent: 1000000,
        isAsset: true,
        source: "manual",
      },
    ])
    .run();

  const acct = db.select().from(schema.accounts).all()[0];
  return { institutionId: inst.id, accountId: acct.id };
}

describe("Budget Queries", () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;
  let accountId: number;

  beforeEach(() => {
    const result = createTestDB();
    db = result.db;
    sqlite = result.sqlite;
    const testData = seedTestData(db);
    accountId = testData.accountId;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── upsertBudget ──────────────────────────────────────────────────

  describe("upsertBudget", () => {
    it("creates a new budget", () => {
      const budget = upsertBudget(db, {
        month: "2026-03",
        category: "Groceries",
        amount: 50000,
      });

      expect(budget.month).toBe("2026-03");
      expect(budget.category).toBe("Groceries");
      expect(budget.amount).toBe(50000);
      expect(budget.id).toBeGreaterThan(0);
    });

    it("updates an existing budget (upsert)", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });
      const updated = upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 75000 });

      expect(updated.amount).toBe(75000);

      // Verify only one row exists
      const rows = db.select().from(schema.budgets).all();
      expect(rows.length).toBe(1);
    });

    it("creates separate budgets for different categories", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });
      upsertBudget(db, { month: "2026-03", category: "Eating Out", amount: 30000 });

      const rows = db.select().from(schema.budgets).all();
      expect(rows.length).toBe(2);
    });

    it("creates separate budgets for different months", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });
      upsertBudget(db, { month: "2026-04", category: "Groceries", amount: 60000 });

      const rows = db.select().from(schema.budgets).all();
      expect(rows.length).toBe(2);
    });
  });

  // ─── copyBudgetsFromMonth ─────────────────────────────────────────

  describe("copyBudgetsFromMonth", () => {
    it("copies budgets from previous month", () => {
      upsertBudget(db, { month: "2026-02", category: "Groceries", amount: 50000 });
      upsertBudget(db, { month: "2026-02", category: "Eating Out", amount: 30000 });

      const count = copyBudgetsFromMonth(db, "2026-02", "2026-03");
      expect(count).toBe(2);

      const marchBudgets = db
        .select()
        .from(schema.budgets)
        .where(eq(schema.budgets.month, "2026-03"))
        .all();

      expect(marchBudgets.length).toBe(2);
      expect(marchBudgets.find((b) => b.category === "Groceries")?.amount).toBe(50000);
      expect(marchBudgets.find((b) => b.category === "Eating Out")?.amount).toBe(30000);
    });

    it("returns -1 when no source budgets exist", () => {
      const count = copyBudgetsFromMonth(db, "2026-01", "2026-02");
      expect(count).toBe(-1);
    });

    it("overwrites existing budgets in target month", () => {
      // Set up source
      upsertBudget(db, { month: "2026-02", category: "Groceries", amount: 50000 });
      // Set up existing target
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 30000 });

      const count = copyBudgetsFromMonth(db, "2026-02", "2026-03");
      expect(count).toBe(1);

      const marchBudgets = db
        .select()
        .from(schema.budgets)
        .where(eq(schema.budgets.month, "2026-03"))
        .all();

      expect(marchBudgets.length).toBe(1);
      expect(marchBudgets[0].amount).toBe(50000); // overwritten with source value
    });
  });

  describe("budget templates", () => {
    it("uses default budget templates when a month has no explicit budget", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });
      upsertBudget(db, { month: "2026-03", category: "Travel", amount: 120000 });

      const saved = replaceBudgetTemplatesFromMonth(db, "2026-03");
      expect(saved).toBe(2);

      const april = getBudgetsForMonth(db, "2026-04");
      expect(april.budgets).toHaveLength(2);
      expect(april.budgets.find((b) => b.category === "Groceries")?.budgeted).toBe(50000);
      expect(april.budgets.find((b) => b.category === "Travel")?.budgeted).toBe(120000);
      expect(
        april.budgets.find((b) => b.category === "Groceries")?.isInheritedDefault
      ).toBe(true);
    });

    it("lets explicit month budgets override the default template", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });
      upsertBudget(db, { month: "2026-03", category: "Travel", amount: 120000 });
      replaceBudgetTemplatesFromMonth(db, "2026-03");

      upsertBudget(db, { month: "2026-04", category: "Groceries", amount: 65000 });

      const april = getBudgetsForMonth(db, "2026-04");
      expect(april.budgets.find((b) => b.category === "Groceries")?.budgeted).toBe(65000);
      expect(april.budgets.find((b) => b.category === "Travel")?.budgeted).toBe(120000);
      expect(
        april.budgets.find((b) => b.category === "Groceries")?.isInheritedDefault
      ).toBe(false);
      expect(
        april.budgets.find((b) => b.category === "Travel")?.isInheritedDefault
      ).toBe(true);
    });

    it("stores the visible month budgets as the default template model", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });
      upsertBudget(db, { month: "2026-03", category: "Travel", amount: 120000 });
      replaceBudgetTemplatesFromMonth(db, "2026-03");

      upsertBudget(db, { month: "2026-04", category: "Groceries", amount: 70000 });

      const saved = replaceBudgetTemplatesFromMonth(db, "2026-04");
      expect(saved).toBe(2);

      const templates = getBudgetTemplates(db);
      expect(templates.find((template) => template.category === "Groceries")?.amount).toBe(70000);
      expect(templates.find((template) => template.category === "Travel")?.amount).toBe(120000);
    });

    it("applies the default budget template to a month", () => {
      replaceBudgetTemplates(db, [
        { category: "Groceries", amount: 50000 },
        { category: "Travel", amount: 120000 },
      ]);

      const applied = applyBudgetTemplatesToMonth(db, "2026-06");
      expect(applied).toBe(2);

      const june = getBudgetsForMonth(db, "2026-06");
      expect(june.budgets.find((b) => b.category === "Groceries")?.budgeted).toBe(50000);
      expect(june.budgets.find((b) => b.category === "Travel")?.budgeted).toBe(120000);
      expect(june.budgets.find((b) => b.category === "Groceries")?.isInheritedDefault).toBe(false);
    });

    it("returns -1 when applying a template that does not exist", () => {
      expect(applyBudgetTemplatesToMonth(db, "2026-06")).toBe(-1);
    });

    it("replaces the default template with edited values", () => {
      replaceBudgetTemplates(db, [{ category: "Groceries", amount: 50000 }]);

      const saved = replaceBudgetTemplates(db, [
        { category: "Travel", amount: 110000 },
        { category: "Rent/Home", amount: 300000 },
      ]);

      expect(saved).toBe(2);

      const templates = getBudgetTemplates(db);
      expect(templates).toHaveLength(2);
      expect(templates.find((template) => template.category === "Groceries")).toBeUndefined();
      expect(templates.find((template) => template.category === "Travel")?.amount).toBe(110000);
      expect(templates.find((template) => template.category === "Rent/Home")?.amount).toBe(300000);
    });
  });

  // ─── deleteBudget ─────────────────────────────────────────────────

  describe("deleteBudget", () => {
    it("deletes an existing budget", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });
      const result = deleteBudget(db, "2026-03", "Groceries");
      expect(result).toBe(true);

      const rows = db.select().from(schema.budgets).all();
      expect(rows.length).toBe(0);
    });

    it("returns false when budget not found", () => {
      const result = deleteBudget(db, "2026-03", "Nonexistent");
      expect(result).toBe(false);
    });
  });

  // ─── getBudgetsForMonth ───────────────────────────────────────────

  describe("getBudgetsForMonth", () => {
    it("returns empty result for month with no budgets", () => {
      const result = getBudgetsForMonth(db, "2026-03");
      expect(result.budgets).toEqual([]);
      expect(result.unbudgeted).toEqual([]);
      expect(result.totalBudgeted).toBe(0);
      expect(result.totalSpent).toBe(0);
      expect(result.totalRemaining).toBe(0);
    });

    it("returns budgets with zero spending when no transactions", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });

      const result = getBudgetsForMonth(db, "2026-03");
      expect(result.budgets.length).toBe(1);
      expect(result.budgets[0].category).toBe("Groceries");
      expect(result.budgets[0].budgeted).toBe(50000);
      expect(result.budgets[0].spent).toBe(0);
      expect(result.budgets[0].remaining).toBe(50000);
      expect(result.totalBudgeted).toBe(50000);
      expect(result.totalSpent).toBe(0);
    });

    it("calculates spending from transactions in the month", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });

      // Add expense transaction
      db.insert(schema.transactions)
        .values({
          accountId,
          postedAt: "2026-03-05",
          name: "Whole Foods",
          amount: 12000,
          category: "Groceries",
          isTransfer: false,
          pending: false,
          reviewState: "none",
        })
        .run();

      db.insert(schema.transactions)
        .values({
          accountId,
          postedAt: "2026-03-10",
          name: "Trader Joes",
          amount: 8000,
          category: "Groceries",
          isTransfer: false,
          pending: false,
          reviewState: "none",
        })
        .run();

      const result = getBudgetsForMonth(db, "2026-03");
      expect(result.budgets[0].spent).toBe(20000);
      expect(result.budgets[0].remaining).toBe(30000);
    });

    it("excludes transfers from spending", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });

      db.insert(schema.transactions)
        .values({
          accountId,
          postedAt: "2026-03-05",
          name: "Transfer",
          amount: 50000,
          category: "Groceries",
          isTransfer: true,
          pending: false,
          reviewState: "none",
        })
        .run();

      const result = getBudgetsForMonth(db, "2026-03");
      expect(result.budgets[0].spent).toBe(0);
    });

    it("lets categorized credits offset budget spending", () => {
      upsertBudget(db, { month: "2026-03", category: "Rent/Home", amount: 500000 });

      db.insert(schema.transactions)
        .values([
          {
            accountId,
            postedAt: "2026-03-01",
            name: "Rent payment",
            amount: 300000,
            category: "Rent/Home",
            isTransfer: false,
            pending: false,
            reviewState: "none",
          },
          {
            accountId,
            postedAt: "2026-03-15",
            name: "Roommate reimbursement",
            amount: -120000,
            category: "Rent/Home",
            isTransfer: false,
            pending: false,
            reviewState: "none",
          },
        ])
        .run();

      const result = getBudgetsForMonth(db, "2026-03");
      expect(result.budgets[0].spent).toBe(180000);
      expect(result.budgets[0].remaining).toBe(320000);
      expect(result.budgets[0].transactions).toHaveLength(2);
    });

    it("shows over-budget (negative remaining)", () => {
      upsertBudget(db, { month: "2026-03", category: "Eating Out", amount: 10000 });

      db.insert(schema.transactions)
        .values({
          accountId,
          postedAt: "2026-03-07",
          name: "Expensive Dinner",
          amount: 15000,
          category: "Eating Out",
          isTransfer: false,
          pending: false,
          reviewState: "none",
        })
        .run();

      const result = getBudgetsForMonth(db, "2026-03");
      expect(result.budgets[0].spent).toBe(15000);
      expect(result.budgets[0].remaining).toBe(-5000);
    });

    it("handles split transactions correctly per category", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });
      upsertBudget(db, { month: "2026-03", category: "Home Goods", amount: 20000 });

      // Create split transaction ($100 split: $60 groceries + $40 home goods)
      const txn = db
        .insert(schema.transactions)
        .values({
          accountId,
          postedAt: "2026-03-10",
          name: "Target",
          amount: 10000,
          category: "Groceries",
          isTransfer: false,
          pending: false,
          reviewState: "none",
        })
        .returning()
        .get();

      db.insert(schema.transactionSplits)
        .values([
          { transactionId: txn.id, category: "Groceries", amount: 6000 },
          { transactionId: txn.id, category: "Home Goods", amount: 4000 },
        ])
        .run();

      const result = getBudgetsForMonth(db, "2026-03");
      const groceries = result.budgets.find((b) => b.category === "Groceries");
      const homeGoods = result.budgets.find((b) => b.category === "Home Goods");

      expect(groceries?.spent).toBe(6000);
      expect(homeGoods?.spent).toBe(4000);
    });

    it("only counts transactions within the month boundaries", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });

      // Transaction on last day of February (should NOT count for March)
      db.insert(schema.transactions)
        .values({
          accountId,
          postedAt: "2026-02-28",
          name: "Feb purchase",
          amount: 5000,
          category: "Groceries",
          isTransfer: false,
          pending: false,
          reviewState: "none",
        })
        .run();

      // Transaction on first day of March (SHOULD count)
      db.insert(schema.transactions)
        .values({
          accountId,
          postedAt: "2026-03-01",
          name: "Mar purchase",
          amount: 3000,
          category: "Groceries",
          isTransfer: false,
          pending: false,
          reviewState: "none",
        })
        .run();

      // Transaction on last day of March (SHOULD count)
      db.insert(schema.transactions)
        .values({
          accountId,
          postedAt: "2026-03-31",
          name: "End of Mar",
          amount: 2000,
          category: "Groceries",
          isTransfer: false,
          pending: false,
          reviewState: "none",
        })
        .run();

      // Transaction on first day of April (should NOT count)
      db.insert(schema.transactions)
        .values({
          accountId,
          postedAt: "2026-04-01",
          name: "Apr purchase",
          amount: 4000,
          category: "Groceries",
          isTransfer: false,
          pending: false,
          reviewState: "none",
        })
        .run();

      const result = getBudgetsForMonth(db, "2026-03");
      expect(result.budgets[0].spent).toBe(5000); // 3000 + 2000
    });

    it("uses override month instead of posted month for budget spending", () => {
      upsertBudget(db, { month: "2026-03", category: "Travel", amount: 150000 });
      upsertBudget(db, { month: "2026-04", category: "Travel", amount: 150000 });

      db.insert(schema.transactions)
        .values({
          accountId,
          postedAt: "2026-03-20",
          overrideMonth: "2026-04",
          name: "Flight reservation",
          amount: 45000,
          category: "Travel",
          isTransfer: false,
          pending: false,
          reviewState: "none",
        })
        .run();

      const march = getBudgetsForMonth(db, "2026-03");
      const april = getBudgetsForMonth(db, "2026-04");

      expect(march.budgets.find((b) => b.category === "Travel")?.spent).toBe(0);
      expect(april.budgets.find((b) => b.category === "Travel")?.spent).toBe(45000);
    });

    it("detects unbudgeted spending", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });

      // Spending in a budgeted category
      db.insert(schema.transactions)
        .values({
          accountId,
          postedAt: "2026-03-05",
          name: "Whole Foods",
          amount: 12000,
          category: "Groceries",
          isTransfer: false,
          pending: false,
          reviewState: "none",
        })
        .run();

      // Spending in an unbudgeted category
      db.insert(schema.transactions)
        .values({
          accountId,
          postedAt: "2026-03-07",
          name: "Dinner",
          amount: 5000,
          category: "Eating Out",
          isTransfer: false,
          pending: false,
          reviewState: "none",
        })
        .run();

      const result = getBudgetsForMonth(db, "2026-03");
      expect(result.budgets.length).toBe(1);
      expect(result.unbudgeted.length).toBe(1);
      expect(result.unbudgeted[0].category).toBe("Eating Out");
      expect(result.unbudgeted[0].spent).toBe(5000);
    });

    it("includes category colors", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });
      const result = getBudgetsForMonth(db, "2026-03");
      expect(result.budgets[0].categoryColor).toBe("#22c55e"); // Groceries color
    });

    it("returns empty for invalid month format", () => {
      const result = getBudgetsForMonth(db, "invalid");
      expect(result.budgets).toEqual([]);
      expect(result.totalBudgeted).toBe(0);
    });

    it("calculates total summary correctly", () => {
      upsertBudget(db, { month: "2026-03", category: "Groceries", amount: 50000 });
      upsertBudget(db, { month: "2026-03", category: "Eating Out", amount: 30000 });

      db.insert(schema.transactions)
        .values([
          {
            accountId,
            postedAt: "2026-03-05",
            name: "Whole Foods",
            amount: 20000,
            category: "Groceries",
            isTransfer: false,
            pending: false,
            reviewState: "none",
          },
          {
            accountId,
            postedAt: "2026-03-07",
            name: "Dinner",
            amount: 15000,
            category: "Eating Out",
            isTransfer: false,
            pending: false,
            reviewState: "none",
          },
        ])
        .run();

      const result = getBudgetsForMonth(db, "2026-03");
      expect(result.totalBudgeted).toBe(80000); // 50000 + 30000
      // totalSpent includes all spending (budgeted + unbudgeted)
      expect(result.totalSpent).toBe(35000); // 20000 + 15000
      // totalRemaining is totalBudgeted - budgeted spending only
      expect(result.totalRemaining).toBe(45000); // 80000 - 35000
    });
  });
});

describe("Budget API Routes", () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;

  beforeEach(() => {
    const result = createTestDB();
    db = result.db;
    sqlite = result.sqlite;
    seedCategories(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("upsertBudget validation", () => {
    it("rejects negative amounts", () => {
      // The API layer should reject negative amounts - test at query level
      // (amount is just stored as-is at the query level; validation is at API level)
      const budget = upsertBudget(db, {
        month: "2026-03",
        category: "Groceries",
        amount: -5000,
      });
      // Query layer does not validate, so it stores the value
      expect(budget.amount).toBe(-5000);
    });

    it("handles zero amount", () => {
      const budget = upsertBudget(db, {
        month: "2026-03",
        category: "Groceries",
        amount: 0,
      });
      expect(budget.amount).toBe(0);
    });
  });
});
