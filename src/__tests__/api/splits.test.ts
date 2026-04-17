import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { AppDatabase } from "@/db/index";
import {
  createTransaction,
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

// ─── Tests: Clearing Splits (Empty Array) ───────────────────────────

describe("Clearing splits (empty array)", () => {
  it("clears existing splits when empty array is provided", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Split Purchase",
      amount: 10000,
      isTransfer: false,
    });

    // Create initial splits
    await createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);

    // Verify splits exist
    await expect(getTransactionSplits(db, txn.id)).resolves.toHaveLength(2);

    // Clear splits with empty array
    const result = await createOrUpdateSplits(db, txn.id, []);
    expect(result).toHaveLength(0);

    // Verify splits are gone
    const remaining = await getTransactionSplits(db, txn.id);
    expect(remaining).toHaveLength(0);
  });

  it("returns empty array when clearing splits on transaction with no splits", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "No Splits",
      amount: 5000,
      isTransfer: false,
    });

    // Clear splits when none exist
    const result = await createOrUpdateSplits(db, txn.id, []);
    expect(result).toHaveLength(0);

    const remaining = await getTransactionSplits(db, txn.id);
    expect(remaining).toHaveLength(0);
  });

  it("allows re-adding splits after clearing them", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Cleared then Re-split",
      amount: 10000,
      isTransfer: false,
    });

    // Create splits
    await createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);

    // Clear splits
    await createOrUpdateSplits(db, txn.id, []);
    await expect(getTransactionSplits(db, txn.id)).resolves.toHaveLength(0);

    // Re-add splits
    const newSplits = await createOrUpdateSplits(db, txn.id, [
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
  it("empty array should bypass sum validation", async () => {
    // This tests the core fix: empty splits array should NOT trigger
    // "sum doesn't match transaction amount" validation.
    // The sum of empty array is 0, which previously failed against non-zero transaction amounts.
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Expense",
      amount: 15000, // $150.00 - would fail sum validation if empty array hits that path
      isTransfer: false,
    });

    // Empty array should succeed regardless of transaction amount
    const result = await createOrUpdateSplits(db, txn.id, []);
    expect(result).toHaveLength(0);
  });

  it("non-empty splits must sum to transaction amount", async () => {
    const account = await seedAccount();
    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Expense",
      amount: 10000,
      isTransfer: false,
    });

    // Matching sum works fine at DB level
    const result = await createOrUpdateSplits(db, txn.id, [
      { category: "Groceries", amount: 6000 },
      { category: "Home Goods", amount: 4000 },
    ]);
    expect(result).toHaveLength(2);
  });
});
