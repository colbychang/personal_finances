import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  createTransaction,
  getTransactions,
  getAccountsForFilter,
} from "@/db/queries/transactions";

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;

beforeAll(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder: "./drizzle" });
});

afterAll(() => {
  sqlite.close();
});

beforeEach(() => {
  db.run(sql`DELETE FROM transaction_splits`);
  db.run(sql`DELETE FROM transactions`);
  db.run(sql`DELETE FROM accounts`);
  db.run(sql`DELETE FROM institutions`);
});

// ─── Helpers ──────────────────────────────────────────────────────────

function seedInstitution() {
  db.insert(schema.institutions)
    .values({ name: "Test Bank", provider: "manual", status: "active" })
    .run();
  return db.select().from(schema.institutions).all()[0]!;
}

function seedAccountsAndTransactions() {
  const inst = seedInstitution();

  db.insert(schema.accounts)
    .values([
      {
        institutionId: inst.id,
        name: "Checking",
        type: "checking",
        balanceCurrent: 500000,
        isAsset: true,
        currency: "USD",
        source: "manual",
      },
      {
        institutionId: inst.id,
        name: "Credit Card",
        type: "credit",
        balanceCurrent: 250000,
        isAsset: false,
        currency: "USD",
        source: "manual",
      },
    ])
    .run();

  const accounts = db.select().from(schema.accounts).all();
  const checking = accounts.find((a) => a.type === "checking")!;
  const credit = accounts.find((a) => a.type === "credit")!;

  db.insert(schema.transactions)
    .values([
      {
        accountId: checking.id,
        postedAt: "2026-03-01",
        name: "Monthly Rent Payment",
        merchant: "Property Management Co",
        amount: 200000,
        category: "Rent/Home",
        pending: false,
        isTransfer: false,
        reviewState: "reviewed",
      },
      {
        accountId: checking.id,
        postedAt: "2026-03-03",
        name: "Whole Foods Market",
        merchant: "Whole Foods",
        amount: 12547,
        category: "Groceries",
        pending: false,
        isTransfer: false,
        reviewState: "reviewed",
      },
      {
        accountId: credit.id,
        postedAt: "2026-03-05",
        name: "Dinner at Olive Garden",
        merchant: "Olive Garden",
        amount: 6832,
        category: "Eating Out",
        pending: false,
        isTransfer: false,
        reviewState: "reviewed",
      },
      {
        accountId: credit.id,
        postedAt: "2026-03-07",
        name: "Bar Tab - The Tipsy Cow",
        merchant: "The Tipsy Cow",
        amount: 4500,
        category: "Bars/Clubs/Going Out",
        pending: false,
        isTransfer: false,
        reviewState: "reviewed",
      },
      {
        accountId: credit.id,
        postedAt: "2026-03-08",
        name: "Netflix Subscription",
        merchant: "Netflix",
        amount: 1599,
        category: "Subscriptions",
        pending: false,
        isTransfer: false,
        reviewState: "reviewed",
      },
      {
        accountId: checking.id,
        postedAt: "2026-03-10",
        name: "Trader Joe's",
        merchant: "Trader Joe's",
        amount: 6789,
        category: "Groceries",
        pending: false,
        isTransfer: false,
        reviewState: "reviewed",
        notes: "Weekly pantry restock",
      },
      {
        accountId: checking.id,
        postedAt: "2026-03-15",
        name: "Paycheck - Employer",
        merchant: "Employer Inc",
        amount: -500000,
        category: "Income",
        pending: false,
        isTransfer: false,
        reviewState: "reviewed",
        notes: "Bi-weekly paycheck",
      },
      {
        accountId: checking.id,
        postedAt: "2026-03-15",
        name: "Transfer to Savings",
        merchant: null,
        amount: 100000,
        pending: false,
        isTransfer: true,
        reviewState: "reviewed",
      },
    ])
    .run();

  return { checking, credit };
}

// ─── Tests: getTransactions ─────────────────────────────────────────

describe("getTransactions", () => {
  it("returns all transactions sorted by date (newest first) with defaults", () => {
    seedAccountsAndTransactions();

    const result = getTransactions(db);

    expect(result.transactions.length).toBe(7);
    expect(result.total).toBe(7);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(1);

    // Check newest first ordering
    for (let i = 0; i < result.transactions.length - 1; i++) {
      expect(result.transactions[i].postedAt >= result.transactions[i + 1].postedAt).toBe(true);
    }
  });

  it("includes account name with each transaction", () => {
    seedAccountsAndTransactions();

    const result = getTransactions(db);
    const rentTxn = result.transactions.find((t) => t.name === "Monthly Rent Payment")!;
    expect(rentTxn.accountName).toBe("Checking");

    const dinnerTxn = result.transactions.find((t) => t.name === "Dinner at Olive Garden")!;
    expect(dinnerTxn.accountName).toBe("Credit Card");
  });

  it("returns empty result when no transactions exist", () => {
    seedInstitution();

    const result = getTransactions(db);

    expect(result.transactions).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(1);
  });

  it("hides excluded passive-income transactions from the list", () => {
    const inst = seedInstitution();

    db.insert(schema.accounts)
      .values({
        institutionId: inst.id,
        name: "Savings",
        type: "savings",
        balanceCurrent: 500000,
        isAsset: true,
        currency: "USD",
        source: "manual",
      })
      .run();

    const account = db.select().from(schema.accounts).all()[0]!;

    db.insert(schema.transactions)
      .values([
        {
          accountId: account.id,
          postedAt: "2026-03-31",
          name: "Monthly Interest Paid",
          amount: -1254,
          pending: false,
          isTransfer: false,
          isExcluded: true,
          reviewState: "none",
        },
        {
          accountId: account.id,
          postedAt: "2026-03-30",
          name: "Groceries",
          amount: 4500,
          category: "Groceries",
          pending: false,
          isTransfer: false,
          reviewState: "none",
        },
      ])
      .run();

    const result = getTransactions(db);

    expect(result.total).toBe(1);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.name).toBe("Groceries");
  });

  it("hides income-category transactions from the list but keeps negative offsets in other categories", () => {
    const inst = seedInstitution();

    db.insert(schema.accounts)
      .values({
        institutionId: inst.id,
        name: "Checking",
        type: "checking",
        balanceCurrent: 500000,
        isAsset: true,
        currency: "USD",
        source: "manual",
      })
      .run();

    const account = db.select().from(schema.accounts).all()[0]!;

    db.insert(schema.transactions)
      .values([
        {
          accountId: account.id,
          postedAt: "2026-03-31",
          name: "Paycheck",
          amount: -500000,
          category: "Income",
          pending: false,
          isTransfer: false,
          reviewState: "none",
        },
        {
          accountId: account.id,
          postedAt: "2026-03-30",
          name: "Roommate reimbursement",
          amount: -120000,
          category: "Rent/Home",
          pending: false,
          isTransfer: false,
          reviewState: "none",
        },
      ])
      .run();

    const result = getTransactions(db);

    expect(result.total).toBe(1);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.name).toBe("Roommate reimbursement");
  });

  it("hides FOUNDATION ROBOT credits from the list as income-like transactions", () => {
    const inst = seedInstitution();

    db.insert(schema.accounts)
      .values({
        institutionId: inst.id,
        name: "Checking",
        type: "checking",
        balanceCurrent: 500000,
        isAsset: true,
        currency: "USD",
        source: "manual",
      })
      .run();

    const account = db.select().from(schema.accounts).all()[0]!;

    createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-31",
      name: "FOUNDATION ROBOT",
      amount: -427251,
      category: "Large Purchases",
      isTransfer: false,
    });

    createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-30",
      name: "Groceries",
      amount: 4500,
      category: "Groceries",
      isTransfer: false,
    });

    const result = getTransactions(db);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.name).toBe("Groceries");
  });

  // ─── Date Range Filters ─────────────────────────────────────────

  it("filters by dateFrom", () => {
    seedAccountsAndTransactions();

    const result = getTransactions(db, { dateFrom: "2026-03-10" });

    // Should get transactions from March 10 onwards
    expect(result.transactions.length).toBeGreaterThanOrEqual(1);
    result.transactions.forEach((t) => {
      expect(t.postedAt >= "2026-03-10").toBe(true);
    });
  });

  it("filters by dateTo", () => {
    seedAccountsAndTransactions();

    const result = getTransactions(db, { dateTo: "2026-03-05" });

    result.transactions.forEach((t) => {
      expect(t.postedAt <= "2026-03-05").toBe(true);
    });
  });

  it("filters by date range (dateFrom + dateTo)", () => {
    seedAccountsAndTransactions();

    const result = getTransactions(db, {
      dateFrom: "2026-03-03",
      dateTo: "2026-03-08",
    });

    result.transactions.forEach((t) => {
      expect(t.postedAt >= "2026-03-03").toBe(true);
      expect(t.postedAt <= "2026-03-08").toBe(true);
    });
    // Should include Whole Foods (3), Olive Garden (5), Tipsy Cow (7), Netflix (8)
    expect(result.transactions.length).toBe(4);
  });

  it("filters by effective month using override month when present", () => {
    const { checking } = seedAccountsAndTransactions();

    db.insert(schema.transactions)
      .values({
        accountId: checking.id,
        postedAt: "2026-03-28",
        overrideMonth: "2026-04",
        name: "April trip deposit",
        merchant: "Delta",
        amount: 25000,
        category: "Travel",
        pending: false,
        isTransfer: false,
        reviewState: "reviewed",
      })
      .run();

    const march = getTransactions(db, { effectiveMonth: "2026-03" });
    const april = getTransactions(db, { effectiveMonth: "2026-04" });

    expect(march.transactions.some((t) => t.name === "April trip deposit")).toBe(false);
    expect(april.transactions.some((t) => t.name === "April trip deposit")).toBe(true);

    const overrideTxn = april.transactions.find((t) => t.name === "April trip deposit");
    expect(overrideTxn?.overrideMonth).toBe("2026-04");
  });

  // ─── Category Filter ────────────────────────────────────────────

  it("filters by single category", () => {
    seedAccountsAndTransactions();

    const result = getTransactions(db, { category: "Groceries" });

    expect(result.transactions.length).toBe(2);
    result.transactions.forEach((t) => {
      expect(t.category).toBe("Groceries");
    });
  });

  it("filters by multiple categories", () => {
    seedAccountsAndTransactions();

    const result = getTransactions(db, {
      category: ["Groceries", "Eating Out"],
    });

    expect(result.transactions.length).toBe(3);
    result.transactions.forEach((t) => {
      expect(["Groceries", "Eating Out"]).toContain(t.category);
    });
  });

  // ─── Account Filter ─────────────────────────────────────────────

  it("filters by account", () => {
    const { checking, credit } = seedAccountsAndTransactions();

    const checkingResult = getTransactions(db, { accountId: checking.id });
    checkingResult.transactions.forEach((t) => {
      expect(t.accountId).toBe(checking.id);
      expect(t.accountName).toBe("Checking");
    });

    const creditResult = getTransactions(db, { accountId: credit.id });
    creditResult.transactions.forEach((t) => {
      expect(t.accountId).toBe(credit.id);
      expect(t.accountName).toBe("Credit Card");
    });
  });

  // ─── Search ──────────────────────────────────────────────────────

  it("searches by name (case-insensitive via LIKE)", () => {
    seedAccountsAndTransactions();

    const result = getTransactions(db, { search: "whole foods" });

    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].name).toBe("Whole Foods Market");
  });

  it("searches by merchant", () => {
    seedAccountsAndTransactions();

    const result = getTransactions(db, { search: "Netflix" });

    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].merchant).toBe("Netflix");
  });

  it("searches by notes", () => {
    seedAccountsAndTransactions();

    const result = getTransactions(db, { search: "pantry" });

    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].notes).toBe("Weekly pantry restock");
  });

  it("returns empty for search with no match", () => {
    seedAccountsAndTransactions();

    const result = getTransactions(db, { search: "zzz_no_match" });

    expect(result.transactions).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  // ─── Combined Filters ───────────────────────────────────────────

  it("combines multiple filters", () => {
    const { checking } = seedAccountsAndTransactions();

    const result = getTransactions(db, {
      accountId: checking.id,
      category: "Groceries",
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
    });

    expect(result.transactions.length).toBe(2);
    result.transactions.forEach((t) => {
      expect(t.accountId).toBe(checking.id);
      expect(t.category).toBe("Groceries");
    });
  });

  it("combines search with category filter", () => {
    seedAccountsAndTransactions();

    const result = getTransactions(db, {
      category: "Groceries",
      search: "Trader",
    });

    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].merchant).toBe("Trader Joe's");
  });

  // ─── Pagination ──────────────────────────────────────────────────

  it("paginates results correctly", () => {
    seedAccountsAndTransactions();

    const page1 = getTransactions(db, { page: 1, limit: 3 });
    expect(page1.transactions.length).toBe(3);
    expect(page1.total).toBe(7);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(3);
    expect(page1.totalPages).toBe(3); // ceil(8/3) = 3

    const page2 = getTransactions(db, { page: 2, limit: 3 });
    expect(page2.transactions.length).toBe(3);
    expect(page2.page).toBe(2);

    const page3 = getTransactions(db, { page: 3, limit: 3 });
    expect(page3.transactions.length).toBe(1); // 7 - 3 - 3 = 1
    expect(page3.page).toBe(3);

    // No duplicate transactions across pages
    const allIds = [
      ...page1.transactions.map((t) => t.id),
      ...page2.transactions.map((t) => t.id),
      ...page3.transactions.map((t) => t.id),
    ];
    expect(new Set(allIds).size).toBe(7);
  });

  it("returns empty for page beyond total", () => {
    seedAccountsAndTransactions();

    const result = getTransactions(db, { page: 100, limit: 20 });

    expect(result.transactions).toHaveLength(0);
    expect(result.total).toBe(7);
    expect(result.page).toBe(100);
  });

  it("clamps limit to valid range (1-100)", () => {
    seedAccountsAndTransactions();

    const resultZero = getTransactions(db, { limit: 0 });
    expect(resultZero.limit).toBe(1);

    const resultHuge = getTransactions(db, { limit: 999 });
    expect(resultHuge.limit).toBe(100);
  });

  it("clamps page to minimum 1", () => {
    seedAccountsAndTransactions();

    const result = getTransactions(db, { page: -5 });
    expect(result.page).toBe(1);
  });
});

// ─── Tests: getAccountsForFilter ────────────────────────────────────

describe("getAccountsForFilter", () => {
  it("returns all accounts with id, name, and type", () => {
    const inst = seedInstitution();
    db.insert(schema.accounts)
      .values([
        {
          institutionId: inst.id,
          name: "Checking",
          type: "checking",
          balanceCurrent: 500000,
          isAsset: true,
          currency: "USD",
          source: "manual",
        },
        {
          institutionId: inst.id,
          name: "Savings",
          type: "savings",
          balanceCurrent: 1000000,
          isAsset: true,
          currency: "USD",
          source: "manual",
        },
      ])
      .run();

    const result = getAccountsForFilter(db);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("type");
  });

  it("returns empty array when no accounts exist", () => {
    const result = getAccountsForFilter(db);
    expect(result).toHaveLength(0);
  });

  it("returns accounts sorted by name", () => {
    const inst = seedInstitution();
    db.insert(schema.accounts)
      .values([
        {
          institutionId: inst.id,
          name: "Zebra Account",
          type: "checking",
          balanceCurrent: 100000,
          isAsset: true,
          currency: "USD",
          source: "manual",
        },
        {
          institutionId: inst.id,
          name: "Alpha Account",
          type: "savings",
          balanceCurrent: 200000,
          isAsset: true,
          currency: "USD",
          source: "manual",
        },
      ])
      .run();

    const result = getAccountsForFilter(db);
    expect(result[0].name).toBe("Alpha Account");
    expect(result[1].name).toBe("Zebra Account");
  });
});
