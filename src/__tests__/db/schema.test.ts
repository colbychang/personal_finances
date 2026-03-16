import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";

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
  // Clear all tables before each test (order matters for FK constraints)
  db.run(sql`DELETE FROM transaction_splits`);
  db.run(sql`DELETE FROM account_snapshots`);
  db.run(sql`DELETE FROM account_links`);
  db.run(sql`DELETE FROM merchant_rules`);
  db.run(sql`DELETE FROM transactions`);
  db.run(sql`DELETE FROM budgets`);
  db.run(sql`DELETE FROM snapshots`);
  db.run(sql`DELETE FROM accounts`);
  db.run(sql`DELETE FROM connections`);
  db.run(sql`DELETE FROM institutions`);
  db.run(sql`DELETE FROM categories`);
});

describe("Database Schema", () => {
  it("creates all expected tables", () => {
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name"
      )
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name).sort();

    expect(tableNames).toEqual([
      "account_links",
      "account_snapshots",
      "accounts",
      "budgets",
      "categories",
      "connections",
      "institutions",
      "merchant_rules",
      "snapshots",
      "transaction_splits",
      "transactions",
    ]);
  });

  it("stores money values as INTEGER (cents)", () => {
    // Insert an account with a balance in cents
    db.insert(schema.institutions).values({
      name: "Test Bank",
      provider: "manual",
      status: "active",
    }).run();

    const [inst] = db.select().from(schema.institutions).all();

    db.insert(schema.accounts)
      .values({
        institutionId: inst!.id,
        name: "Checking",
        type: "checking",
        balanceCurrent: 812543, // $8,125.43
        isAsset: true,
        currency: "USD",
        source: "manual",
      })
      .run();

    const [account] = db.select().from(schema.accounts).all();
    expect(account!.balanceCurrent).toBe(812543);
    expect(typeof account!.balanceCurrent).toBe("number");

    // Verify it's stored as integer in SQLite
    const raw = sqlite
      .prepare("SELECT typeof(balance_current) as t FROM accounts LIMIT 1")
      .get() as { t: string };
    expect(raw.t).toBe("integer");
  });

  it("enforces foreign key constraints on accounts -> institutions", () => {
    expect(() => {
      db.insert(schema.accounts)
        .values({
          institutionId: 99999, // non-existent
          name: "Bad Account",
          type: "checking",
          balanceCurrent: 0,
          isAsset: true,
          currency: "USD",
          source: "manual",
        })
        .run();
    }).toThrow();
  });

  it("enforces foreign key constraints on transactions -> accounts", () => {
    expect(() => {
      db.insert(schema.transactions)
        .values({
          accountId: 99999, // non-existent
          postedAt: "2026-03-16",
          name: "Bad Transaction",
          amount: 1000,
          pending: false,
          isTransfer: false,
          reviewState: "none",
        })
        .run();
    }).toThrow();
  });

  it("enforces unique constraint on budgets (month + category)", () => {
    db.insert(schema.budgets)
      .values({ month: "2026-03", category: "Groceries", amount: 50000 })
      .run();

    expect(() => {
      db.insert(schema.budgets)
        .values({ month: "2026-03", category: "Groceries", amount: 60000 })
        .run();
    }).toThrow();
  });

  it("enforces unique constraint on snapshots (month)", () => {
    db.insert(schema.snapshots)
      .values({ month: "2026-03", assets: 100000, liabilities: 50000, netWorth: 50000 })
      .run();

    expect(() => {
      db.insert(schema.snapshots)
        .values({ month: "2026-03", assets: 200000, liabilities: 60000, netWorth: 140000 })
        .run();
    }).toThrow();
  });

  it("enforces unique constraint on categories (name)", () => {
    db.insert(schema.categories)
      .values({ name: "Test Category", color: "#ff0000", icon: "star", isPredefined: false, sortOrder: 100 })
      .run();

    expect(() => {
      db.insert(schema.categories)
        .values({ name: "Test Category", color: "#00ff00", icon: "heart", isPredefined: false, sortOrder: 101 })
        .run();
    }).toThrow();
  });

  it("enforces unique constraint on merchant_rules (merchant_key)", () => {
    db.insert(schema.merchantRules)
      .values({ merchantKey: "starbucks", label: "Starbucks", category: "Eating Out", isTransfer: false })
      .run();

    expect(() => {
      db.insert(schema.merchantRules)
        .values({ merchantKey: "starbucks", label: "Starbucks v2", category: "Groceries", isTransfer: false })
        .run();
    }).toThrow();
  });

  it("enforces unique constraint on account_snapshots (account_id + day)", () => {
    db.insert(schema.institutions).values({
      name: "Test Bank",
      provider: "manual",
      status: "active",
    }).run();
    const [inst] = db.select().from(schema.institutions).all();

    db.insert(schema.accounts)
      .values({
        institutionId: inst!.id,
        name: "Checking",
        type: "checking",
        balanceCurrent: 100000,
        isAsset: true,
        currency: "USD",
        source: "manual",
      })
      .run();
    const [acct] = db.select().from(schema.accounts).all();

    db.insert(schema.accountSnapshots)
      .values({ accountId: acct!.id, day: "2026-03-16", balanceCurrent: 100000, isAsset: true })
      .run();

    expect(() => {
      db.insert(schema.accountSnapshots)
        .values({ accountId: acct!.id, day: "2026-03-16", balanceCurrent: 200000, isAsset: true })
        .run();
    }).toThrow();
  });

  it("enforces unique constraint on account_links (external_key)", () => {
    db.insert(schema.institutions).values({
      name: "Test Bank",
      provider: "manual",
      status: "active",
    }).run();
    const [inst] = db.select().from(schema.institutions).all();

    db.insert(schema.accounts)
      .values({
        institutionId: inst!.id,
        name: "Checking",
        type: "checking",
        balanceCurrent: 100000,
        isAsset: true,
        currency: "USD",
        source: "manual",
      })
      .run();
    const [acct] = db.select().from(schema.accounts).all();

    db.insert(schema.accountLinks)
      .values({ provider: "plaid", externalKey: "plaid-123", accountId: acct!.id, institutionName: "Test", displayName: "Checking" })
      .run();

    expect(() => {
      db.insert(schema.accountLinks)
        .values({ provider: "plaid", externalKey: "plaid-123", accountId: acct!.id, institutionName: "Test 2", displayName: "Savings" })
        .run();
    }).toThrow();
  });

  it("enforces foreign key on transaction_splits -> transactions", () => {
    expect(() => {
      db.insert(schema.transactionSplits)
        .values({ transactionId: 99999, category: "Groceries", amount: 5000 })
        .run();
    }).toThrow();
  });

  it("allows boolean columns to store true/false", () => {
    db.insert(schema.categories)
      .values({ name: "Predefined Cat", color: "#000", icon: "star", isPredefined: true, sortOrder: 1 })
      .run();
    db.insert(schema.categories)
      .values({ name: "Custom Cat", color: "#fff", icon: "circle", isPredefined: false, sortOrder: 2 })
      .run();

    const cats = db.select().from(schema.categories).all();
    const predefined = cats.find((c) => c.name === "Predefined Cat");
    const custom = cats.find((c) => c.name === "Custom Cat");

    expect(predefined!.isPredefined).toBe(true);
    expect(custom!.isPredefined).toBe(false);
  });

  it("stores dates as TEXT", () => {
    db.insert(schema.institutions).values({
      name: "Test Bank",
      provider: "manual",
      status: "active",
    }).run();
    const [inst] = db.select().from(schema.institutions).all();

    db.insert(schema.accounts)
      .values({
        institutionId: inst!.id,
        name: "Checking",
        type: "checking",
        balanceCurrent: 0,
        isAsset: true,
        currency: "USD",
        source: "manual",
      })
      .run();
    const [acct] = db.select().from(schema.accounts).all();

    db.insert(schema.transactions)
      .values({
        accountId: acct!.id,
        postedAt: "2026-03-16",
        name: "Test Txn",
        amount: 5000,
        pending: false,
        isTransfer: false,
        reviewState: "none",
      })
      .run();

    const [txn] = db.select().from(schema.transactions).all();
    expect(txn!.postedAt).toBe("2026-03-16");

    const raw = sqlite
      .prepare("SELECT typeof(posted_at) as t FROM transactions LIMIT 1")
      .get() as { t: string };
    expect(raw.t).toBe("text");
  });
});

describe("Seed Data", () => {
  it("seeds 11 predefined categories", async () => {
    const { seedCategories } = await import("@/db/seed");
    seedCategories(db);

    const cats = db.select().from(schema.categories).all();
    expect(cats).toHaveLength(11);

    const names = cats.map((c) => c.name).sort();
    expect(names).toEqual([
      "Bars/Clubs/Going Out",
      "Clothing",
      "Eating Out",
      "Groceries",
      "Home Goods",
      "Insurance",
      "Large Purchases",
      "Other Fun Activities",
      "Rent/Home",
      "Subscriptions",
      "Vacations",
    ]);

    // All predefined
    cats.forEach((c) => {
      expect(c.isPredefined).toBe(true);
      expect(c.color).toBeTruthy();
      expect(c.icon).toBeTruthy();
    });
  });

  it("seeds sample accounts", async () => {
    const { seedCategories, seedSampleData } = await import("@/db/seed");
    seedCategories(db);
    seedSampleData(db);

    const accts = db.select().from(schema.accounts).all();
    expect(accts.length).toBeGreaterThanOrEqual(4);

    const types = [...new Set(accts.map((a) => a.type))].sort();
    expect(types).toContain("checking");
    expect(types).toContain("savings");
    expect(types).toContain("credit");
    expect(types).toContain("investment");
  });

  it("seeds sample transactions", async () => {
    const { seedCategories, seedSampleData } = await import("@/db/seed");
    seedCategories(db);
    seedSampleData(db);

    const txns = db.select().from(schema.transactions).all();
    expect(txns.length).toBeGreaterThan(0);

    // All transactions should reference valid accounts
    const accountIds = db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .all()
      .map((a) => a.id);
    txns.forEach((t) => {
      expect(accountIds).toContain(t.accountId);
    });

    // Money values are integers
    txns.forEach((t) => {
      expect(Number.isInteger(t.amount)).toBe(true);
    });
  });

  it("seeds sample budgets", async () => {
    const { seedCategories, seedSampleData } = await import("@/db/seed");
    seedCategories(db);
    seedSampleData(db);

    const budgets = db.select().from(schema.budgets).all();
    expect(budgets.length).toBeGreaterThan(0);

    // Budget amounts are integers (cents)
    budgets.forEach((b) => {
      expect(Number.isInteger(b.amount)).toBe(true);
    });
  });

  it("seedCategories is idempotent (does not fail on re-run)", async () => {
    const { seedCategories } = await import("@/db/seed");
    seedCategories(db);
    // Running again should not throw
    expect(() => seedCategories(db)).not.toThrow();

    const cats = db.select().from(schema.categories).all();
    expect(cats).toHaveLength(11);
  });
});
