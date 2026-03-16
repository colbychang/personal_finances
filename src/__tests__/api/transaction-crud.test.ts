import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactionById,
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

function seedInstitution() {
  db.insert(schema.institutions)
    .values({ name: "Test Bank", provider: "manual", status: "active" })
    .run();
  return db.select().from(schema.institutions).all()[0]!;
}

function seedAccount() {
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
  return db.select().from(schema.accounts).all()[0]!;
}

// ─── Tests: createTransaction ───────────────────────────────────────

describe("createTransaction", () => {
  it("creates a new expense transaction with all fields", () => {
    const account = seedAccount();

    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Whole Foods",
      amount: 12500, // cents
      category: "Groceries",
      notes: "Weekly groceries",
      isTransfer: false,
    });

    expect(txn.id).toBeDefined();
    expect(txn.accountId).toBe(account.id);
    expect(txn.postedAt).toBe("2026-03-15");
    expect(txn.name).toBe("Whole Foods");
    expect(txn.amount).toBe(12500);
    expect(txn.category).toBe("Groceries");
    expect(txn.notes).toBe("Weekly groceries");
    expect(txn.isTransfer).toBe(false);
    expect(txn.pending).toBe(false);
  });

  it("creates an income transaction (negative amount)", () => {
    const account = seedAccount();

    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Paycheck",
      amount: -500000, // negative = income
      category: "Income",
      isTransfer: false,
    });

    expect(txn.amount).toBe(-500000);
    expect(txn.category).toBe("Income");
  });

  it("creates a transfer transaction", () => {
    const account = seedAccount();

    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Transfer to Savings",
      amount: 100000,
      isTransfer: true,
    });

    expect(txn.isTransfer).toBe(true);
  });

  it("creates transaction without optional fields", () => {
    const account = seedAccount();

    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Mystery Payment",
      amount: 5000,
      isTransfer: false,
    });

    expect(txn.category).toBeNull();
    expect(txn.notes).toBeNull();
  });
});

// ─── Tests: updateTransaction ───────────────────────────────────────

describe("updateTransaction", () => {
  it("updates transaction name and amount", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Old Name",
      amount: 5000,
      isTransfer: false,
    });

    const updated = updateTransaction(db, txn.id, {
      name: "New Name",
      amount: 7500,
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("New Name");
    expect(updated!.amount).toBe(7500);
  });

  it("updates category", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Purchase",
      amount: 5000,
      category: "Groceries",
      isTransfer: false,
    });

    const updated = updateTransaction(db, txn.id, {
      category: "Eating Out",
    });

    expect(updated!.category).toBe("Eating Out");
  });

  it("updates isTransfer flag", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Payment",
      amount: 5000,
      isTransfer: false,
    });

    const updated = updateTransaction(db, txn.id, { isTransfer: true });
    expect(updated!.isTransfer).toBe(true);
  });

  it("updates notes", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Purchase",
      amount: 5000,
      isTransfer: false,
    });

    const updated = updateTransaction(db, txn.id, { notes: "Added a note" });
    expect(updated!.notes).toBe("Added a note");
  });

  it("returns null for non-existent transaction", () => {
    const result = updateTransaction(db, 99999, { name: "No Exist" });
    expect(result).toBeNull();
  });
});

// ─── Tests: deleteTransaction ───────────────────────────────────────

describe("deleteTransaction", () => {
  it("deletes a transaction", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "To Delete",
      amount: 5000,
      isTransfer: false,
    });

    const deleted = deleteTransaction(db, txn.id);
    expect(deleted).toBe(true);

    // Verify it's gone
    const found = getTransactionById(db, txn.id);
    expect(found).toBeNull();
  });

  it("also deletes associated splits", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Split Purchase",
      amount: 10000,
      isTransfer: false,
    });

    // Add splits
    createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);

    const deleted = deleteTransaction(db, txn.id);
    expect(deleted).toBe(true);

    // Verify splits are also gone
    const splits = getTransactionSplits(db, txn.id);
    expect(splits).toHaveLength(0);
  });

  it("returns false for non-existent transaction", () => {
    const deleted = deleteTransaction(db, 99999);
    expect(deleted).toBe(false);
  });
});

// ─── Tests: getTransactionById ──────────────────────────────────────

describe("getTransactionById", () => {
  it("returns transaction with account name", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Test Txn",
      amount: 5000,
      category: "Groceries",
      isTransfer: false,
    });

    const found = getTransactionById(db, txn.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(txn.id);
    expect(found!.accountName).toBe("Checking");
    expect(found!.category).toBe("Groceries");
  });

  it("returns null for non-existent id", () => {
    const found = getTransactionById(db, 99999);
    expect(found).toBeNull();
  });
});

// ─── Tests: Transaction Splits ──────────────────────────────────────

describe("createOrUpdateSplits", () => {
  it("creates splits for a transaction", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Split Purchase",
      amount: 10000,
      isTransfer: false,
    });

    const splits = createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);

    expect(splits).toHaveLength(2);
    expect(splits[0].category).toBe("Groceries");
    expect(splits[0].amount).toBe(6000);
    expect(splits[1].category).toBe("Home Goods");
    expect(splits[1].amount).toBe(4000);
  });

  it("replaces existing splits on update", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Split Purchase",
      amount: 10000,
      isTransfer: false,
    });

    // First set of splits
    createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);

    // Replace with new splits
    const newSplits = createOrUpdateSplits(db, txn.id, [
      { category: "Eating Out", amount: 5000 },
      { category: "Bars/Clubs/Going Out", amount: 3000 },
      { category: "Insurance", amount: 2000 },
    ]);

    expect(newSplits).toHaveLength(3);
    expect(newSplits[0].category).toBe("Eating Out");

    // Old splits should be gone
    const allSplits = getTransactionSplits(db, txn.id);
    expect(allSplits).toHaveLength(3);
  });

  it("clears splits when passed empty array", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Split Purchase",
      amount: 10000,
      isTransfer: false,
    });

    createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);

    // Clear splits
    const cleared = createOrUpdateSplits(db, txn.id, []);
    expect(cleared).toHaveLength(0);

    const remaining = getTransactionSplits(db, txn.id);
    expect(remaining).toHaveLength(0);
  });
});

describe("getTransactionSplits", () => {
  it("returns splits for a transaction", () => {
    const account = seedAccount();
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Split Purchase",
      amount: 10000,
      isTransfer: false,
    });

    createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);

    const splits = getTransactionSplits(db, txn.id);
    expect(splits).toHaveLength(2);
    expect(splits.map((s) => s.category)).toContain("Groceries");
    expect(splits.map((s) => s.category)).toContain("Home Goods");
  });

  it("returns empty array when no splits exist", () => {
    const splits = getTransactionSplits(db, 99999);
    expect(splits).toHaveLength(0);
  });
});
