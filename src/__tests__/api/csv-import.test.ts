import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  getExistingTransactionsForDuplicateCheck,
  importTransactions,
  type ImportTransactionInput,
} from "@/db/queries/imports";

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

// ─── importTransactions ──────────────────────────────────────────────

describe("importTransactions", () => {
  it("imports transactions into the database", () => {
    const account = seedAccount();
    const txns: ImportTransactionInput[] = [
      { accountId: account.id, postedAt: "2026-01-15", name: "Grocery Store", amount: 4599, category: "Groceries" },
      { accountId: account.id, postedAt: "2026-01-16", name: "Gas Station", amount: 3500, category: null },
    ];

    const result = importTransactions(db, txns);
    expect(result).toBe(2);

    const saved = db.select().from(schema.transactions).all();
    expect(saved).toHaveLength(2);
    expect(saved[0].name).toBe("Grocery Store");
    expect(saved[0].amount).toBe(4599);
    expect(saved[0].accountId).toBe(account.id);
    expect(saved[0].category).toBe("Groceries");
    expect(saved[1].category).toBeNull();
  });

  it("handles empty array gracefully", () => {
    const result = importTransactions(db, []);
    expect(result).toBe(0);
  });

  it("stores correct date format", () => {
    const account = seedAccount();
    importTransactions(db, [
      { accountId: account.id, postedAt: "2026-03-15", name: "Test", amount: 1000, category: null },
    ]);

    const saved = db.select().from(schema.transactions).all();
    expect(saved[0].postedAt).toBe("2026-03-15");
  });
});

// ─── getExistingTransactionsForDuplicateCheck ────────────────────────

describe("getExistingTransactionsForDuplicateCheck", () => {
  it("returns transactions for the given account", () => {
    const account = seedAccount();
    db.insert(schema.transactions)
      .values([
        { accountId: account.id, postedAt: "2026-01-15", name: "Store A", amount: 1000, pending: false, isTransfer: false, reviewState: "none" },
        { accountId: account.id, postedAt: "2026-01-16", name: "Store B", amount: 2000, pending: false, isTransfer: false, reviewState: "none" },
      ])
      .run();

    const result = getExistingTransactionsForDuplicateCheck(db, account.id);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("postedAt");
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("amount");
  });

  it("only returns transactions for the specified account", () => {
    const account = seedAccount();

    // Create a second account
    const inst = db.select().from(schema.institutions).all()[0]!;
    db.insert(schema.accounts)
      .values({
        institutionId: inst.id,
        name: "Savings",
        type: "savings",
        balanceCurrent: 100000,
        isAsset: true,
        currency: "USD",
        source: "manual",
      })
      .run();
    const accounts = db.select().from(schema.accounts).all();
    const account2 = accounts[1]!;

    db.insert(schema.transactions)
      .values([
        { accountId: account.id, postedAt: "2026-01-15", name: "Store A", amount: 1000, pending: false, isTransfer: false, reviewState: "none" },
        { accountId: account2.id, postedAt: "2026-01-16", name: "Store B", amount: 2000, pending: false, isTransfer: false, reviewState: "none" },
      ])
      .run();

    const result = getExistingTransactionsForDuplicateCheck(db, account.id);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Store A");
  });

  it("returns empty array if no transactions exist", () => {
    const account = seedAccount();
    const result = getExistingTransactionsForDuplicateCheck(db, account.id);
    expect(result).toHaveLength(0);
  });
});
