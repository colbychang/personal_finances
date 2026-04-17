import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as schema from "@/db/schema";
import type { AppDatabase } from "@/db/index";
import {
  getExistingTransactionsForDuplicateCheck,
  importTransactions,
  type ImportTransactionInput,
} from "@/db/queries/imports";
import {
  closeTestDb,
  createTestDb,
  getInstitutionByName,
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

// ─── importTransactions ──────────────────────────────────────────────

describe("importTransactions", () => {
  it("imports transactions into the database", async () => {
    const account = await seedAccount();
    const txns: ImportTransactionInput[] = [
      { accountId: account.id, postedAt: "2026-01-15", name: "Grocery Store", amount: 4599, category: "Groceries" },
      { accountId: account.id, postedAt: "2026-01-16", name: "Gas Station", amount: 3500, category: null },
    ];

    const result = await importTransactions(db, txns);
    expect(result).toBe(2);

    const saved = await db.select().from(schema.transactions);
    expect(saved).toHaveLength(2);
    expect(saved[0].name).toBe("Grocery Store");
    expect(saved[0].amount).toBe(4599);
    expect(saved[0].accountId).toBe(account.id);
    expect(saved[0].category).toBe("Groceries");
    expect(saved[1].category).toBeNull();
  });

  it("handles empty array gracefully", async () => {
    const result = await importTransactions(db, []);
    expect(result).toBe(0);
  });

  it("stores correct date format", async () => {
    const account = await seedAccount();
    await importTransactions(db, [
      { accountId: account.id, postedAt: "2026-03-15", name: "Test", amount: 1000, category: null },
    ]);

    const saved = await db.select().from(schema.transactions);
    expect(saved[0].postedAt).toBe("2026-03-15");
  });
});

// ─── getExistingTransactionsForDuplicateCheck ────────────────────────

describe("getExistingTransactionsForDuplicateCheck", () => {
  it("returns transactions for the given account", async () => {
    const account = await seedAccount();
    await db.insert(schema.transactions)
      .values([
        { accountId: account.id, postedAt: "2026-01-15", name: "Store A", amount: 1000, pending: false, isTransfer: false, reviewState: "none" },
        { accountId: account.id, postedAt: "2026-01-16", name: "Store B", amount: 2000, pending: false, isTransfer: false, reviewState: "none" },
      ])
      .returning();

    const result = await getExistingTransactionsForDuplicateCheck(db, account.id);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("postedAt");
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("amount");
  });

  it("only returns transactions for the specified account", async () => {
    const account = await seedAccount();

    // Create a second account
    const inst = await getInstitutionByName(db, "Test Bank");
    const account2 = await seedManualAccount(db, {
      institutionId: inst!.id,
      name: "Savings",
      type: "savings",
      balanceCurrent: 100000,
      isAsset: true,
    });

    await db.insert(schema.transactions)
      .values([
        { accountId: account.id, postedAt: "2026-01-15", name: "Store A", amount: 1000, pending: false, isTransfer: false, reviewState: "none" },
        { accountId: account2.id, postedAt: "2026-01-16", name: "Store B", amount: 2000, pending: false, isTransfer: false, reviewState: "none" },
      ])
      .returning();

    const result = await getExistingTransactionsForDuplicateCheck(db, account.id);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Store A");
  });

  it("returns empty array if no transactions exist", async () => {
    const account = await seedAccount();
    const result = await getExistingTransactionsForDuplicateCheck(db, account.id);
    expect(result).toHaveLength(0);
  });
});
