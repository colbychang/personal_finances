import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";
import { seedCategories } from "@/db/seed";
import { getDashboardData } from "@/db/queries/dashboard";

function createTestDB() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return { db, sqlite };
}

function seedBaseData(db: ReturnType<typeof drizzle>) {
  seedCategories(db);

  // Create institutions
  db.insert(schema.institutions)
    .values([
      { name: "Test Bank", provider: "manual", status: "active" },
      { name: "Credit Co", provider: "manual", status: "active" },
    ])
    .run();

  const institutions = db.select().from(schema.institutions).all();
  const bank = institutions.find((i) => i.name === "Test Bank")!;
  const creditCo = institutions.find((i) => i.name === "Credit Co")!;

  // Create accounts
  db.insert(schema.accounts)
    .values([
      {
        institutionId: bank.id,
        name: "Checking",
        type: "checking",
        balanceCurrent: 800000, // $8,000.00
        isAsset: true,
        source: "manual",
      },
      {
        institutionId: bank.id,
        name: "Savings",
        type: "savings",
        balanceCurrent: 2000000, // $20,000.00
        isAsset: true,
        source: "manual",
      },
      {
        institutionId: creditCo.id,
        name: "Credit Card",
        type: "credit",
        balanceCurrent: 150000, // $1,500.00
        isAsset: false,
        source: "manual",
      },
    ])
    .run();

  const accounts = db.select().from(schema.accounts).all();
  return {
    checkingId: accounts.find((a) => a.type === "checking")!.id,
    savingsId: accounts.find((a) => a.type === "savings")!.id,
    creditId: accounts.find((a) => a.type === "credit")!.id,
  };
}

describe("Dashboard Queries", () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;
  let checkingId: number;
  let creditId: number;

  beforeEach(() => {
    const result = createTestDB();
    db = result.db;
    sqlite = result.sqlite;
    const seedResult = seedBaseData(db);
    checkingId = seedResult.checkingId;
    creditId = seedResult.creditId;
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("Monthly Spending Summary", () => {
    it("calculates total spending for the month excluding transfers and income", () => {
      const month = "2026-03";

      // Add expense transactions
      db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2026-03-05", name: "Grocery", amount: 5000, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-10", name: "Paycheck", amount: -500000, category: "Income", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-15", name: "Transfer to Savings", amount: 100000, isTransfer: true, reviewState: "none" },
      ]).run();

      const data = getDashboardData(db, month);

      // Total spending should only include expenses: $2,000 + $50 = $2,050
      expect(data.totalSpending).toBe(205000);
    });

    it("returns top spending categories sorted by amount descending", () => {
      const month = "2026-03";

      db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2026-03-05", name: "Grocery 1", amount: 5000, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2026-03-06", name: "Grocery 2", amount: 7500, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2026-03-10", name: "Dinner", amount: 3000, category: "Eating Out", isTransfer: false, reviewState: "none" },
      ]).run();

      const data = getDashboardData(db, month);

      // Rent/Home: $2,000, Groceries: $125, Eating Out: $30
      expect(data.spendingByCategory.length).toBe(3);
      expect(data.spendingByCategory[0].category).toBe("Rent/Home");
      expect(data.spendingByCategory[0].amount).toBe(200000);
      expect(data.spendingByCategory[1].category).toBe("Groceries");
      expect(data.spendingByCategory[1].amount).toBe(12500);
      expect(data.spendingByCategory[2].category).toBe("Eating Out");
      expect(data.spendingByCategory[2].amount).toBe(3000);
    });

    it("includes split transaction categories in spending breakdown", () => {
      const month = "2026-03";

      db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Target", amount: 10000, category: "Home Goods", isTransfer: false, reviewState: "none" },
      ]).run();

      const txn = db.select().from(schema.transactions).all()[0];

      // Split: $60 Home Goods + $40 Groceries
      db.insert(schema.transactionSplits).values([
        { transactionId: txn.id, category: "Home Goods", amount: 6000 },
        { transactionId: txn.id, category: "Groceries", amount: 4000 },
      ]).run();

      const data = getDashboardData(db, month);

      expect(data.totalSpending).toBe(10000);

      const homeGoods = data.spendingByCategory.find((c) => c.category === "Home Goods");
      const groceries = data.spendingByCategory.find((c) => c.category === "Groceries");
      expect(homeGoods?.amount).toBe(6000);
      expect(groceries?.amount).toBe(4000);
    });
  });

  describe("Budget Status", () => {
    it("categorizes budgets into on-track, approaching, and over-budget", () => {
      const month = "2026-03";

      // Set up budgets
      db.insert(schema.budgets).values([
        { month, category: "Groceries", amount: 50000 },    // $500
        { month, category: "Eating Out", amount: 30000 },    // $300
        { month, category: "Rent/Home", amount: 200000 },    // $2,000
        { month, category: "Clothing", amount: 10000 },      // $100
      ]).run();

      // Spending: Groceries $250 (50% - on track), Eating Out $275 (91.7% - approaching),
      // Rent $2100 (105% - over), Clothing $0 (0% - on track)
      db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Grocery", amount: 25000, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2026-03-05", name: "Dinner", amount: 27500, category: "Eating Out", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-01", name: "Rent", amount: 210000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
      ]).run();

      const data = getDashboardData(db, month);

      expect(data.budgetStatus.onTrack).toBe(2);      // Groceries + Clothing
      expect(data.budgetStatus.approaching).toBe(1);   // Eating Out
      expect(data.budgetStatus.overBudget).toBe(1);     // Rent/Home
      expect(data.budgetStatus.total).toBe(4);
    });
  });

  describe("Recent Transactions", () => {
    it("returns the last 10 transactions sorted by date descending", () => {
      const txns = [];
      for (let i = 1; i <= 15; i++) {
        txns.push({
          accountId: checkingId,
          postedAt: `2026-03-${String(i).padStart(2, "0")}`,
          name: `Transaction ${i}`,
          amount: 1000 * i,
          category: "Groceries",
          isTransfer: false,
          reviewState: "none" as const,
        });
      }
      db.insert(schema.transactions).values(txns).run();

      const data = getDashboardData(db, "2026-03");

      expect(data.recentTransactions.length).toBe(10);
      expect(data.recentTransactions[0].name).toBe("Transaction 15");
      expect(data.recentTransactions[9].name).toBe("Transaction 6");
    });

    it("includes account name with each transaction", () => {
      db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Test Txn", amount: 5000, category: "Groceries", isTransfer: false, reviewState: "none" },
      ]).run();

      const data = getDashboardData(db, "2026-03");

      expect(data.recentTransactions.length).toBe(1);
      expect(data.recentTransactions[0].accountName).toBe("Checking");
    });
  });

  describe("Net Worth Trend", () => {
    it("returns current net worth from accounts", () => {
      // Accounts: Checking $8,000 + Savings $20,000 - Credit $1,500 = $26,500
      const data = getDashboardData(db, "2026-03");

      expect(data.netWorth.current).toBe(2650000); // $26,500 in cents
    });

    it("calculates change from previous month snapshot", () => {
      // Create a snapshot for the previous month
      db.insert(schema.snapshots).values({
        month: "2026-02",
        assets: 2500000,
        liabilities: 100000,
        netWorth: 2400000,
      }).run();

      const data = getDashboardData(db, "2026-03");

      // Current: $26,500, Previous: $24,000
      expect(data.netWorth.previous).toBe(2400000);
      expect(data.netWorth.change).toBe(250000); // +$2,500
    });

    it("handles no previous snapshot gracefully", () => {
      const data = getDashboardData(db, "2026-03");

      expect(data.netWorth.previous).toBeNull();
      expect(data.netWorth.change).toBeNull();
    });
  });

  describe("Month-over-Month Comparison", () => {
    it("compares category spending between current and previous month", () => {
      // Previous month transactions
      db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-02-01", name: "Rent Feb", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2026-02-05", name: "Grocery Feb", amount: 15000, category: "Groceries", isTransfer: false, reviewState: "none" },
      ]).run();

      // Current month transactions
      db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Rent Mar", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2026-03-05", name: "Grocery Mar", amount: 20000, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2026-03-10", name: "New shirt", amount: 5000, category: "Clothing", isTransfer: false, reviewState: "none" },
      ]).run();

      const data = getDashboardData(db, "2026-03");

      const rentComp = data.monthComparison.find((c) => c.category === "Rent/Home");
      expect(rentComp?.currentMonth).toBe(200000);
      expect(rentComp?.previousMonth).toBe(200000);
      expect(rentComp?.change).toBe(0);

      const grocComp = data.monthComparison.find((c) => c.category === "Groceries");
      expect(grocComp?.currentMonth).toBe(20000);
      expect(grocComp?.previousMonth).toBe(15000);
      expect(grocComp?.change).toBe(5000);

      const clothComp = data.monthComparison.find((c) => c.category === "Clothing");
      expect(clothComp?.currentMonth).toBe(5000);
      expect(clothComp?.previousMonth).toBe(0);
      expect(clothComp?.change).toBe(5000);
    });

    it("excludes transfers from comparison", () => {
      db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-02-15", name: "Transfer", amount: 100000, isTransfer: true, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-15", name: "Transfer", amount: 100000, isTransfer: true, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-01", name: "Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
      ]).run();

      const data = getDashboardData(db, "2026-03");

      // Only Rent should appear, not transfers
      expect(data.monthComparison.length).toBe(1);
      expect(data.monthComparison[0].category).toBe("Rent/Home");
    });
  });

  describe("Empty Data Handling", () => {
    it("handles no transactions for the month", () => {
      const data = getDashboardData(db, "2026-03");

      expect(data.totalSpending).toBe(0);
      expect(data.spendingByCategory).toEqual([]);
      expect(data.recentTransactions).toEqual([]);
      expect(data.monthComparison).toEqual([]);
    });

    it("handles no budgets for the month", () => {
      const data = getDashboardData(db, "2026-03");

      expect(data.budgetStatus.total).toBe(0);
      expect(data.budgetStatus.onTrack).toBe(0);
      expect(data.budgetStatus.approaching).toBe(0);
      expect(data.budgetStatus.overBudget).toBe(0);
    });
  });

  describe("Data Accuracy", () => {
    it("spending total matches sum of all category amounts", () => {
      db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2026-03-05", name: "Grocery", amount: 12500, category: "Groceries", isTransfer: false, reviewState: "none" },
        { accountId: creditId, postedAt: "2026-03-10", name: "Dinner", amount: 6832, category: "Eating Out", isTransfer: false, reviewState: "none" },
      ]).run();

      const data = getDashboardData(db, "2026-03");

      const categorySum = data.spendingByCategory.reduce((sum, c) => sum + c.amount, 0);
      expect(data.totalSpending).toBe(categorySum);
      expect(data.totalSpending).toBe(219332);
    });

    it("excludes income (negative amounts) from spending", () => {
      db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Rent", amount: 200000, category: "Rent/Home", isTransfer: false, reviewState: "none" },
        { accountId: checkingId, postedAt: "2026-03-15", name: "Paycheck", amount: -500000, category: "Income", isTransfer: false, reviewState: "none" },
      ]).run();

      const data = getDashboardData(db, "2026-03");

      expect(data.totalSpending).toBe(200000);
      // Income should not appear in category breakdown
      expect(data.spendingByCategory.find((c) => c.category === "Income")).toBeUndefined();
    });

    it("budget status items include spending amounts", () => {
      const month = "2026-03";

      db.insert(schema.budgets).values([
        { month, category: "Groceries", amount: 50000 },
      ]).run();

      db.insert(schema.transactions).values([
        { accountId: checkingId, postedAt: "2026-03-01", name: "Grocery", amount: 25000, category: "Groceries", isTransfer: false, reviewState: "none" },
      ]).run();

      const data = getDashboardData(db, month);

      expect(data.budgetStatus.items.length).toBe(1);
      expect(data.budgetStatus.items[0].category).toBe("Groceries");
      expect(data.budgetStatus.items[0].budgeted).toBe(50000);
      expect(data.budgetStatus.items[0].spent).toBe(25000);
      expect(data.budgetStatus.items[0].percentage).toBe(50);
    });
  });
});
