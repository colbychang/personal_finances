import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as schema from "@/db/schema";
import type { AppDatabase } from "@/db/index";
import { seedCategories } from "@/db/seed";
import {
  getSpendingByCategory,
  getMonthlySpendingTrends,
  getCategoryTransactions,
} from "@/db/queries/analytics";
import {
  closeTestDb,
  createTestDb,
  resetTestDb,
  seedManualAccount,
  seedManualInstitution,
  type TestDb,
} from "@/__tests__/helpers/test-db";

async function seedBaseData(db: AppDatabase) {
  await seedCategories(db);

  const bank = await seedManualInstitution(db, "Test Bank");
  const creditCo = await seedManualInstitution(db, "Credit Co");
  const checking = await seedManualAccount(db, {
    institutionId: bank.id,
    name: "Checking",
    type: "checking",
    balanceCurrent: 800000,
    isAsset: true,
  });
  const credit = await seedManualAccount(db, {
    institutionId: creditCo.id,
    name: "Credit Card",
    type: "credit",
    balanceCurrent: 150000,
    isAsset: false,
  });

  return {
    checkingId: checking.id,
    creditId: credit.id,
  };
}

describe("Analytics Queries", () => {
  let testDb: TestDb;
  let db: AppDatabase;
  let checkingId: number;
  let creditId: number;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T12:00:00Z"));
    testDb = await createTestDb();
    db = testDb.db;
    const seedResult = await seedBaseData(db);
    checkingId = seedResult.checkingId;
    creditId = seedResult.creditId;
  });

  afterEach(async () => {
    await closeTestDb(testDb);
    vi.useRealTimers();
  });

  // ─── Spending by Category ──────────────────────────────────────────

  describe("getSpendingByCategory", () => {
    it("returns spending aggregated by category for a single month", async () => {
      await db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2026-03-05", name: "Grocery 1", amount: 5000, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2026-03-10", name: "Grocery 2", amount: 7500, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2026-03-15", name: "Dinner", amount: 3000, category: "Eating Out", isTransfer: false, reviewState: "none" },
      ]).returning();

      const result = await getSpendingByCategory(db, "2026-03-01", "2026-04-01");

      expect(result.length).toBe(3);
      // Sorted descending by amount
      expect(result[0].category).toBe("Rent/Home");
      expect(result[0].amount).toBe(200000);
      expect(result[1].category).toBe("Groceries");
      expect(result[1].amount).toBe(12500);
      expect(result[2].category).toBe("Eating Out");
      expect(result[2].amount).toBe(3000);
    });

    it("excludes transfers from spending", async () => {
      await db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-15", name: "Transfer", amount: 100000, isTransfer: true, reviewState: "none" },
      ]).returning();

      const result = await getSpendingByCategory(db, "2026-03-01", "2026-04-01");

      expect(result.length).toBe(1);
      expect(result[0].category).toBe("Rent/Home");
      expect(result[0].amount).toBe(200000);
    });

    it("excludes income (negative amounts) from spending", async () => {
      await db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-15", name: "Paycheck", amount: -500000, category: "Income", isTransfer: false, reviewState: "none" },
      ]).returning();

      const result = await getSpendingByCategory(db, "2026-03-01", "2026-04-01");

      expect(result.length).toBe(1);
      expect(result[0].category).toBe("Rent/Home");
    });

    it("handles transaction splits correctly", async () => {
      await db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Target", amount: 10000, category: "Home Goods", isTransfer: false, reviewState: "none" },
      ]).returning();

      const [txn] = await db.select().from(schema.transactions).limit(1);
      await db.insert(schema.transactionSplits).values([
        { transactionId: txn.id, category: "Home Goods", amount: 6000 },
        { transactionId: txn.id, category: "Groceries", amount: 4000 },
      ]).returning();

      const result = await getSpendingByCategory(db, "2026-03-01", "2026-04-01");

      const homeGoods = result.find((r) => r.category === "Home Goods");
      const groceries = result.find((r) => r.category === "Groceries");
      expect(homeGoods?.amount).toBe(6000);
      expect(groceries?.amount).toBe(4000);
    });

    it("aggregates across multiple months in a date range", async () => {
      await db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-01-15", name: "Jan Grocery", amount: 10000, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-02-15", name: "Feb Grocery", amount: 15000, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-15", name: "Mar Grocery", amount: 12000, category: "Groceries", isTransfer: false, reviewState: "none" },
      ]).returning();

      // Last 3 months: Jan, Feb, Mar
      const result = await getSpendingByCategory(db, "2026-01-01", "2026-04-01");

      expect(result.length).toBe(1);
      expect(result[0].category).toBe("Groceries");
      expect(result[0].amount).toBe(37000);
    });

    it("returns empty array when no spending data", async () => {
      const result = await getSpendingByCategory(db, "2026-03-01", "2026-04-01");
      expect(result).toEqual([]);
    });

    it("includes category colors from the categories table", async () => {
      await db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
      ]).returning();

      const result = await getSpendingByCategory(db, "2026-03-01", "2026-04-01");

      expect(result[0].color).toBe("#8b5cf6"); // Rent/Home color
    });
  });

  // ─── Monthly Spending Trends ──────────────────────────────────────

  describe("getMonthlySpendingTrends", () => {
    it("returns total spending per month over the given range", async () => {
      await db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2025-10-01", name: "Oct Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2025-10-05", name: "Oct Grocery", amount: 15000, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2025-11-01", name: "Nov Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2025-12-01", name: "Dec Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2025-12-20", name: "Dec Gift", amount: 50000, category: "Large Purchases", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-01-01", name: "Jan Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-02-01", name: "Feb Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-01", name: "Mar Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
      ]).returning();

      const result = await getMonthlySpendingTrends(db, 6);

      // Should return 6 months sorted oldest first (for chart display)
      expect(result.length).toBe(6);
      expect(result[0].month).toBe("2025-10");
      expect(result[0].total).toBe(215000); // Rent + Grocery
      expect(result[5].month).toBe("2026-03");
      expect(result[5].total).toBe(200000);
    });

    it("excludes transfers and income from monthly totals", async () => {
      await db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-15", name: "Transfer", amount: 100000, isTransfer: true, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-15", name: "Paycheck", amount: -500000, category: "Income", isTransfer: false, reviewState: "none" },
      ]).returning();

      const result = await getMonthlySpendingTrends(db, 1);

      expect(result.length).toBe(1);
      expect(result[0].total).toBe(200000);
    });

    it("includes months with zero spending", async () => {
      // Only add data for one month
      await db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
      ]).returning();

      const result = await getMonthlySpendingTrends(db, 3);

      expect(result.length).toBe(3);
      // Months without spending should have 0
      const emptyMonths = result.filter((m) => m.total === 0);
      expect(emptyMonths.length).toBe(2);
    });

    it("returns spending sorted by month ascending (oldest first for chart display)", async () => {
      await db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-01-01", name: "Jan", amount: 100000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-02-01", name: "Feb", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-01", name: "Mar", amount: 150000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
      ]).returning();

      const result = await getMonthlySpendingTrends(db, 3);

      expect(result[0].month).toBe("2026-01");
      expect(result[1].month).toBe("2026-02");
      expect(result[2].month).toBe("2026-03");
    });
  });

  // ─── Category Drill-Down ──────────────────────────────────────────

  describe("getCategoryTransactions", () => {
    it("returns transactions for a specific category in the date range", async () => {
      await db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Grocery 1", amount: 5000, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-10", name: "Grocery 2", amount: 7500, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-15", name: "Dinner", amount: 3000, category: "Eating Out", isTransfer: false, reviewState: "none" },
      ]).returning();

      const result = await getCategoryTransactions(db, "Groceries", "2026-03-01", "2026-04-01");

      expect(result.length).toBe(2);
      expect(result[0].name).toBe("Grocery 2"); // Most recent first
      expect(result[1].name).toBe("Grocery 1");
    });

    it("includes transactions where the category appears in splits", async () => {
      await db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Target", amount: 10000, category: "Home Goods", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-05", name: "Pure Grocery", amount: 5000, category: "Groceries", isTransfer: false, reviewState: "none" },
      ]).returning();

      const txns = await db.select().from(schema.transactions);
      const targetTxn = txns.find((t) => t.name === "Target")!;

      await db.insert(schema.transactionSplits).values([
        { transactionId: targetTxn.id, category: "Home Goods", amount: 6000 },
        { transactionId: targetTxn.id, category: "Groceries", amount: 4000 },
      ]).returning();

      const result = await getCategoryTransactions(db, "Groceries", "2026-03-01", "2026-04-01");

      // Should return both the pure Grocery transaction and the split that contains Groceries
      expect(result.length).toBe(2);
      const names = result.map((t) => t.name);
      expect(names).toContain("Pure Grocery");
      expect(names).toContain("Target");
    });

    it("excludes transactions outside the date range", async () => {
      await db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-02-28", name: "Feb Grocery", amount: 5000, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-01", name: "Mar Grocery", amount: 7500, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-04-01", name: "Apr Grocery", amount: 6000, category: "Groceries", isTransfer: false, reviewState: "none" },
      ]).returning();

      const result = await getCategoryTransactions(db, "Groceries", "2026-03-01", "2026-04-01");

      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Mar Grocery");
    });

    it("returns empty array when no matching transactions", async () => {
      const result = await getCategoryTransactions(db, "Groceries", "2026-03-01", "2026-04-01");
      expect(result).toEqual([]);
    });

    it("includes account name with each transaction", async () => {
      await db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Grocery", amount: 5000, category: "Groceries", isTransfer: false, reviewState: "none" },
      ]).returning();

      const result = await getCategoryTransactions(db, "Groceries", "2026-03-01", "2026-04-01");

      expect(result[0].accountName).toBe("Checking");
    });
  });
});
