import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { AppDatabase } from "@/db/index";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactionById,
  createOrUpdateSplits,
  getTransactionSplits,
} from "@/db/queries/transactions";
import {
  closeTestDb,
  createTestDb,
  resetTestDb,
  seedManualAccount,
  seedManualInstitution,
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

// ─── Helpers ──────────────────────────────────────────────────────────

async function seedAccount() {
  const inst = await seedManualInstitution(db, "Test Bank");
  return seedManualAccount(db, {
    institutionId: inst.id,
    name: "Checking",
    type: "checking",
    balanceCurrent: 500000,
    isAsset: true,
  });
}

// ─── Tests: createTransaction ───────────────────────────────────────

describe("createTransaction", () => {
  it("creates a new expense transaction with all fields", async () => {
    const account = await seedAccount();

    const txn = await createTransaction(db, {
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

  it("creates an income transaction (negative amount)", async () => {
    const account = await seedAccount();

    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Paycheck",
      amount: -500000, // negative = income
      category: "Income",
      isTransfer: false,
    });

    expect(txn.amount).toBe(-500000);
    expect(txn.category).toBe("Income");
    expect(txn.isExcluded).toBe(true);
  });

  it("creates FOUNDATION ROBOT credits as excluded income-like transactions", async () => {
    const account = await seedAccount();

    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-31",
      name: "FOUNDATION ROBOT",
      amount: -427251,
      category: "Large Purchases",
      isTransfer: false,
    });

    expect(txn.isExcluded).toBe(true);
  });

  it("creates a transfer transaction", async () => {
    const account = await seedAccount();

    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Transfer to Savings",
      amount: 100000,
      isTransfer: true,
    });

    expect(txn.isTransfer).toBe(true);
  });

  it("creates transaction without optional fields", async () => {
    const account = await seedAccount();

    const txn = await createTransaction(db, {
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
  it("updates transaction name and amount", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Old Name",
      amount: 5000,
      isTransfer: false,
    });

    const updated = await updateTransaction(db, txn.id, {
      name: "New Name",
      amount: 7500,
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("New Name");
    expect(updated!.amount).toBe(7500);
  });

  it("updates category", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Purchase",
      amount: 5000,
      category: "Groceries",
      isTransfer: false,
    });

    const updated = await updateTransaction(db, txn.id, {
      category: "Eating Out",
    });

    expect(updated!.category).toBe("Eating Out");
  });

  it("updates isTransfer flag", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Payment",
      amount: 5000,
      isTransfer: false,
    });

    const updated = await updateTransaction(db, txn.id, { isTransfer: true });
    expect(updated!.isTransfer).toBe(true);
  });

  it("updates notes", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Purchase",
      amount: 5000,
      isTransfer: false,
    });

    const updated = await updateTransaction(db, txn.id, { notes: "Added a note" });
    expect(updated!.notes).toBe("Added a note");
  });

  it("returns null for non-existent transaction", async () => {
    const result = await updateTransaction(db, 99999, { name: "No Exist" });
    expect(result).toBeNull();
  });
});

// ─── Tests: deleteTransaction ───────────────────────────────────────

describe("deleteTransaction", () => {
  it("deletes a transaction", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "To Delete",
      amount: 5000,
      isTransfer: false,
    });

    const deleted = await deleteTransaction(db, txn.id);
    expect(deleted).toBe(true);

    // Verify it's gone
    const found = await getTransactionById(db, txn.id);
    expect(found).toBeNull();
  });

  it("also deletes associated splits", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Split Purchase",
      amount: 10000,
      isTransfer: false,
    });

    // Add splits
    await createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);

    const deleted = await deleteTransaction(db, txn.id);
    expect(deleted).toBe(true);

    // Verify splits are also gone
    const splits = await getTransactionSplits(db, txn.id);
    expect(splits).toHaveLength(0);
  });

  it("returns false for non-existent transaction", async () => {
    const deleted = await deleteTransaction(db, 99999);
    expect(deleted).toBe(false);
  });
});

// ─── Tests: getTransactionById ──────────────────────────────────────

describe("getTransactionById", () => {
  it("returns transaction with account name", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Test Txn",
      amount: 5000,
      category: "Groceries",
      isTransfer: false,
    });

    const found = await getTransactionById(db, txn.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(txn.id);
    expect(found!.accountName).toBe("Checking");
    expect(found!.category).toBe("Groceries");
  });

  it("returns null for non-existent id", async () => {
    const found = await getTransactionById(db, 99999);
    expect(found).toBeNull();
  });
});

// ─── Tests: Transaction Splits ──────────────────────────────────────

describe("createOrUpdateSplits", () => {
  it("creates splits for a transaction", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Split Purchase",
      amount: 10000,
      isTransfer: false,
    });

    const splits = await createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);

    expect(splits).toHaveLength(2);
    expect(splits[0].category).toBe("Groceries");
    expect(splits[0].amount).toBe(6000);
    expect(splits[1].category).toBe("Home Goods");
    expect(splits[1].amount).toBe(4000);
  });

  it("replaces existing splits on update", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Split Purchase",
      amount: 10000,
      isTransfer: false,
    });

    // First set of splits
    await createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);

    // Replace with new splits
    const newSplits = await createOrUpdateSplits(db, txn.id, [
      { category: "Eating Out", amount: 5000 },
      { category: "Bars/Clubs/Going Out", amount: 3000 },
      { category: "Insurance", amount: 2000 },
    ]);

    expect(newSplits).toHaveLength(3);
    expect(newSplits[0].category).toBe("Eating Out");

    // Old splits should be gone
    const allSplits = await getTransactionSplits(db, txn.id);
    expect(allSplits).toHaveLength(3);
  });

  it("clears splits when passed empty array", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Split Purchase",
      amount: 10000,
      isTransfer: false,
    });

    await createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);

    // Clear splits
    const cleared = await createOrUpdateSplits(db, txn.id, []);
    expect(cleared).toHaveLength(0);

    const remaining = await getTransactionSplits(db, txn.id);
    expect(remaining).toHaveLength(0);
  });
});

describe("getTransactionSplits", () => {
  it("returns splits for a transaction", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Split Purchase",
      amount: 10000,
      isTransfer: false,
    });

    await createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);

    const splits = await getTransactionSplits(db, txn.id);
    expect(splits).toHaveLength(2);
    expect(splits.map((s) => s.category)).toContain("Groceries");
    expect(splits.map((s) => s.category)).toContain("Home Goods");
  });

  it("returns empty array when no splits exist", async () => {
    const splits = await getTransactionSplits(db, 99999);
    expect(splits).toHaveLength(0);
  });
});
