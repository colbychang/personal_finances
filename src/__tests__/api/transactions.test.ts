import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { AppDatabase } from "@/db/index";
import * as schema from "@/db/schema";
import { createTransaction, getAccountsForFilter, getTransactions } from "@/db/queries/transactions";
import {
  closeTestDb,
  createTestDb,
  resetTestDb,
  seedManualAccount,
  seedManualInstitution,
  seedWorkspace,
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

async function seedInstitution() {
  return seedManualInstitution(db, "Test Bank");
}

async function seedAccountsAndTransactions() {
  const institution = await seedInstitution();
  const checking = await seedManualAccount(db, {
    institutionId: institution.id,
    name: "Checking",
    type: "checking",
    balanceCurrent: 500_000,
    isAsset: true,
  });
  const credit = await seedManualAccount(db, {
    institutionId: institution.id,
    name: "Credit Card",
    type: "credit",
    balanceCurrent: 250_000,
    isAsset: false,
  });

  await db.insert(schema.transactions).values([
    {
      accountId: checking.id,
      postedAt: "2026-03-01",
      name: "Monthly Rent Payment",
      merchant: "Property Management Co",
      amount: 200_000,
      category: "Rent/Home",
      pending: false,
      isTransfer: false,
      isExcluded: false,
      reviewState: "reviewed",
    },
    {
      accountId: checking.id,
      postedAt: "2026-03-03",
      name: "Whole Foods Market",
      merchant: "Whole Foods",
      amount: 12_547,
      category: "Groceries",
      pending: false,
      isTransfer: false,
      isExcluded: false,
      reviewState: "reviewed",
    },
    {
      accountId: credit.id,
      postedAt: "2026-03-05",
      name: "Dinner at Olive Garden",
      merchant: "Olive Garden",
      amount: 6_832,
      category: "Eating Out",
      pending: false,
      isTransfer: false,
      isExcluded: false,
      reviewState: "reviewed",
    },
    {
      accountId: credit.id,
      postedAt: "2026-03-07",
      name: "Bar Tab - The Tipsy Cow",
      merchant: "The Tipsy Cow",
      amount: 4_500,
      category: "Bars/Clubs/Going Out",
      pending: false,
      isTransfer: false,
      isExcluded: false,
      reviewState: "reviewed",
    },
    {
      accountId: credit.id,
      postedAt: "2026-03-08",
      name: "Netflix Subscription",
      merchant: "Netflix",
      amount: 1_599,
      category: "Subscriptions",
      pending: false,
      isTransfer: false,
      isExcluded: false,
      reviewState: "reviewed",
    },
    {
      accountId: checking.id,
      postedAt: "2026-03-10",
      name: "Trader Joe's",
      merchant: "Trader Joe's",
      amount: 6_789,
      category: "Groceries",
      pending: false,
      isTransfer: false,
      isExcluded: false,
      reviewState: "reviewed",
      notes: "Weekly pantry restock",
    },
    {
      accountId: checking.id,
      postedAt: "2026-03-15",
      name: "Paycheck - Employer",
      merchant: "Employer Inc",
      amount: -500_000,
      category: "Income",
      pending: false,
      isTransfer: false,
      isExcluded: false,
      reviewState: "reviewed",
    },
    {
      accountId: checking.id,
      postedAt: "2026-03-15",
      name: "Transfer to Savings",
      merchant: null,
      amount: 100_000,
      category: null,
      pending: false,
      isTransfer: true,
      isExcluded: false,
      reviewState: "reviewed",
    },
  ]);

  return { checking, credit };
}

describe("getTransactions", () => {
  it("returns visible transactions sorted newest-first with pagination metadata", async () => {
    await seedAccountsAndTransactions();

    const result = await getTransactions(db);

    expect(result.transactions).toHaveLength(7);
    expect(result.total).toBe(7);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(1);

    for (let index = 0; index < result.transactions.length - 1; index += 1) {
      expect(result.transactions[index]!.postedAt >= result.transactions[index + 1]!.postedAt).toBe(
        true,
      );
    }
  });

  it("joins account names onto each transaction", async () => {
    await seedAccountsAndTransactions();

    const result = await getTransactions(db);
    expect(result.transactions.find((txn) => txn.name === "Monthly Rent Payment")?.accountName).toBe(
      "Checking",
    );
    expect(
      result.transactions.find((txn) => txn.name === "Dinner at Olive Garden")?.accountName,
    ).toBe("Credit Card");
  });

  it("filters by date range, category, account, search, and effective month", async () => {
    const { checking } = await seedAccountsAndTransactions();
    await db.insert(schema.transactions).values({
      accountId: checking.id,
      postedAt: "2026-03-28",
      overrideMonth: "2026-04",
      name: "April trip deposit",
      merchant: "Delta",
      amount: 25_000,
      category: "Travel",
      pending: false,
      isTransfer: false,
      isExcluded: false,
      reviewState: "reviewed",
    });

    const dateRange = await getTransactions(db, {
      dateFrom: "2026-03-03",
      dateTo: "2026-03-08",
    });
    expect(dateRange.transactions.map((txn) => txn.name)).toEqual([
      "Netflix Subscription",
      "Bar Tab - The Tipsy Cow",
      "Dinner at Olive Garden",
      "Whole Foods Market",
    ]);

    const groceries = await getTransactions(db, { category: "Groceries" });
    expect(groceries.transactions.map((txn) => txn.name)).toEqual([
      "Trader Joe's",
      "Whole Foods Market",
    ]);

    const foodAndDining = await getTransactions(db, {
      category: ["Groceries", "Eating Out"],
    });
    expect(foodAndDining.transactions).toHaveLength(3);

    const checkingOnly = await getTransactions(db, { accountId: checking.id });
    expect(checkingOnly.transactions.every((txn) => txn.accountId === checking.id)).toBe(true);

    const searchByMerchant = await getTransactions(db, { search: "Netflix" });
    expect(searchByMerchant.transactions.map((txn) => txn.name)).toEqual(["Netflix Subscription"]);

    const searchByNotes = await getTransactions(db, { search: "pantry" });
    expect(searchByNotes.transactions.map((txn) => txn.name)).toEqual(["Trader Joe's"]);

    const march = await getTransactions(db, { effectiveMonth: "2026-03" });
    const april = await getTransactions(db, { effectiveMonth: "2026-04" });
    expect(march.transactions.some((txn) => txn.name === "April trip deposit")).toBe(false);
    expect(april.transactions.map((txn) => txn.name)).toEqual(["April trip deposit"]);
  });

  it("surfaces only positive uncategorized spend for needs review", async () => {
    const { checking } = await seedAccountsAndTransactions();
    await db.insert(schema.transactions).values([
      {
        accountId: checking.id,
        postedAt: "2026-03-16",
        name: "Mystery expense",
        amount: 4_200,
        category: null,
        pending: false,
        isTransfer: false,
        isExcluded: false,
        reviewState: "none",
      },
      {
        accountId: checking.id,
        postedAt: "2026-03-17",
        name: "Mystery refund",
        amount: -4_200,
        category: null,
        pending: false,
        isTransfer: false,
        isExcluded: false,
        reviewState: "none",
      },
    ]);

    const result = await getTransactions(db, { needsReview: true });
    expect(result.transactions.map((txn) => txn.name)).toEqual(["Mystery expense"]);
  });

  it("hides passive income, income-category rows, investment accounts, and income-like FOUNDATION ROBOT credits", async () => {
    const institution = await seedInstitution();
    const checking = await seedManualAccount(db, {
      institutionId: institution.id,
      name: "Checking",
      type: "checking",
      balanceCurrent: 500_000,
      isAsset: true,
    });
    const investment = await seedManualAccount(db, {
      institutionId: institution.id,
      name: "Brokerage",
      type: "investment",
      balanceCurrent: 1_000_000,
      isAsset: true,
    });

    await createTransaction(db, {
      accountId: checking.id,
      postedAt: "2026-03-30",
      name: "Groceries",
      amount: 4_500,
      category: "Groceries",
      isTransfer: false,
    });
    await db.insert(schema.transactions).values([
      {
        accountId: checking.id,
        postedAt: "2026-03-31",
        name: "Monthly Interest Paid",
        amount: -1_254,
        category: null,
        pending: false,
        isTransfer: false,
        isExcluded: true,
        reviewState: "none",
      },
      {
        accountId: checking.id,
        postedAt: "2026-03-31",
        name: "Paycheck",
        amount: -500_000,
        category: "Income",
        pending: false,
        isTransfer: false,
        isExcluded: false,
        reviewState: "none",
      },
      {
        accountId: checking.id,
        postedAt: "2026-03-31",
        name: "FOUNDATION ROBOT",
        amount: -427_251,
        category: "Large Purchases",
        pending: false,
        isTransfer: false,
        isExcluded: true,
        reviewState: "none",
      },
      {
        accountId: investment.id,
        postedAt: "2026-03-31",
        name: "Dividend",
        amount: -2_500,
        category: null,
        pending: false,
        isTransfer: false,
        isExcluded: false,
        reviewState: "none",
      },
      {
        accountId: checking.id,
        postedAt: "2026-03-30",
        name: "Roommate reimbursement",
        amount: -120_000,
        category: "Rent/Home",
        pending: false,
        isTransfer: false,
        isExcluded: false,
        reviewState: "none",
      },
    ]);

    const result = await getTransactions(db);
    expect(result.transactions.map((txn) => txn.name)).toEqual([
      "Roommate reimbursement",
      "Groceries",
    ]);
  });

  it("paginates and clamps page and limit values", async () => {
    await seedAccountsAndTransactions();

    const page1 = await getTransactions(db, { page: 1, limit: 3 });
    const page2 = await getTransactions(db, { page: 2, limit: 3 });
    const page3 = await getTransactions(db, { page: 3, limit: 3 });

    expect(page1.transactions).toHaveLength(3);
    expect(page2.transactions).toHaveLength(3);
    expect(page3.transactions).toHaveLength(1);
    expect(page1.totalPages).toBe(3);

    const hugeLimit = await getTransactions(db, { limit: 999 });
    const zeroLimit = await getTransactions(db, { limit: 0 });
    const negativePage = await getTransactions(db, { page: -5 });

    expect(hugeLimit.limit).toBe(100);
    expect(zeroLimit.limit).toBe(1);
    expect(negativePage.page).toBe(1);
  });
});

describe("getAccountsForFilter", () => {
  it("returns accounts sorted by name", async () => {
    const institution = await seedInstitution();
    await seedManualAccount(db, {
      institutionId: institution.id,
      name: "Zebra Account",
      type: "checking",
      balanceCurrent: 100_000,
      isAsset: true,
    });
    await seedManualAccount(db, {
      institutionId: institution.id,
      name: "Alpha Account",
      type: "savings",
      balanceCurrent: 200_000,
      isAsset: true,
    });

    const result = await getAccountsForFilter(db);
    expect(result.map((account) => account.name)).toEqual(["Alpha Account", "Zebra Account"]);
  });

  it("scopes filter accounts by workspace when requested", async () => {
    const alpha = await seedWorkspace(db, { name: "Alpha", slug: "alpha-filter" });
    const beta = await seedWorkspace(db, { name: "Beta", slug: "beta-filter" });

    const alphaInstitution = await seedManualInstitution(db, "Alpha Bank", alpha.id);
    const betaInstitution = await seedManualInstitution(db, "Beta Bank", beta.id);

    await seedManualAccount(db, {
      institutionId: alphaInstitution.id,
      name: "Alpha Checking",
      type: "checking",
      balanceCurrent: 100_000,
      isAsset: true,
      workspaceId: alpha.id,
    });
    await seedManualAccount(db, {
      institutionId: betaInstitution.id,
      name: "Beta Checking",
      type: "checking",
      balanceCurrent: 100_000,
      isAsset: true,
      workspaceId: beta.id,
    });

    const alphaAccounts = await getAccountsForFilter(db, alpha.id);
    expect(alphaAccounts.map((account) => account.name)).toEqual(["Alpha Checking"]);
  });
});
