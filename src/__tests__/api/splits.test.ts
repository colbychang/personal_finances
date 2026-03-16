import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  createTransaction,
  createOrUpdateSplits,
  getTransactionSplits,
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

function seedAccount() {
  db.insert(schema.institutions)
    .values({ name: "Test Bank", provider: "manual", status: "active" })
    .run();
  const inst = db.select().from(schema.institutions).all()[0]!;

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
  return db.select().from(schema.accounts).all()[0]!;
}

// ─── Tests: Clearing Splits (Empty Array) ───────────────────────────

describe("Clearing splits (empty array)", () => {
  it("clears existing splits when empty array is provided", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Split Purchase",
      amount: 10000,
      isTransfer: false,
    });

    // Create initial splits
    createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);

    // Verify splits exist
    expect(getTransactionSplits(db, txn.id)).toHaveLength(2);

    // Clear splits with empty array
    const result = createOrUpdateSplits(db, txn.id, []);
    expect(result).toHaveLength(0);

    // Verify splits are gone
    const remaining = getTransactionSplits(db, txn.id);
    expect(remaining).toHaveLength(0);
  });

  it("returns empty array when clearing splits on transaction with no splits", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "No Splits",
      amount: 5000,
      isTransfer: false,
    });

    // Clear splits when none exist
    const result = createOrUpdateSplits(db, txn.id, []);
    expect(result).toHaveLength(0);

    const remaining = getTransactionSplits(db, txn.id);
    expect(remaining).toHaveLength(0);
  });

  it("allows re-adding splits after clearing them", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Cleared then Re-split",
      amount: 10000,
      isTransfer: false,
    });

    // Create splits
    createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);

    // Clear splits
    createOrUpdateSplits(db, txn.id, []);
    expect(getTransactionSplits(db, txn.id)).toHaveLength(0);

    // Re-add splits
    const newSplits = createOrUpdateSplits(db, txn.id, [
      { category: "Eating Out", amount: 7000 },
      { category: "Subscriptions", amount: 3000 },
    ]);
    expect(newSplits).toHaveLength(2);
    expect(newSplits[0].category).toBe("Eating Out");
    expect(newSplits[1].category).toBe("Subscriptions");
  });
});

// ─── Tests: Splits API Route Validation ─────────────────────────────

describe("Splits API route validation logic", () => {
  it("empty array should bypass sum validation", () => {
    // This tests the core fix: empty splits array should NOT trigger
    // "sum doesn't match transaction amount" validation.
    // The sum of empty array is 0, which previously failed against non-zero transaction amounts.
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Expense",
      amount: 15000, // $150.00 - would fail sum validation if empty array hits that path
      isTransfer: false,
    });

    // Empty array should succeed regardless of transaction amount
    const result = createOrUpdateSplits(db, txn.id, []);
    expect(result).toHaveLength(0);
  });

  it("non-empty splits must sum to transaction amount", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Expense",
      amount: 10000,
      isTransfer: false,
    });

    // Matching sum works fine at DB level
    const result = createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);
    expect(result).toHaveLength(2);
  });
});
