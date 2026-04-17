import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AppDatabase } from "@/db/index";
import {
  getAllAccountsGrouped,
  createAccount,
  updateAccount,
  deleteAccountWithTransactions,
  getAccountById,
} from "@/db/queries/accounts";
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

async function seedInstitution() {
  return seedManualInstitution(db, "Test Bank");
}

async function seedAccounts(institutionId: number) {
  await db.insert(schema.accounts).values([
    {
      institutionId,
      name: "My Checking",
      type: "checking",
      balanceCurrent: 500000,
      isAsset: true,
      currency: "USD",
      source: "manual",
    },
    {
      institutionId,
      name: "My Savings",
      type: "savings",
      balanceCurrent: 1000000,
      isAsset: true,
      currency: "USD",
      source: "manual",
    },
    {
      institutionId,
      name: "Credit Card",
      type: "credit",
      balanceCurrent: 250000,
      isAsset: false,
      currency: "USD",
      source: "manual",
    },
    {
      institutionId,
      name: "401k",
      type: "retirement",
      balanceCurrent: 5000000,
      isAsset: true,
      currency: "USD",
      source: "manual",
    },
    {
      institutionId,
      name: "Brokerage",
      type: "investment",
      balanceCurrent: 3000000,
      isAsset: true,
      currency: "USD",
      source: "manual",
    },
  ]).returning();

  return db.select().from(schema.accounts);
}

describe("getAllAccountsGrouped", () => {
  it("returns accounts grouped by type sections", async () => {
    const inst = await seedInstitution();
    await seedAccounts(inst.id);

    const grouped = await getAllAccountsGrouped(db);

    expect(grouped).toHaveLength(3);

    const sectionNames = grouped.map((g) => g.section);
    expect(sectionNames).toContain("Checking & Savings");
    expect(sectionNames).toContain("Credit Cards");
    expect(sectionNames).toContain("Investments & Retirement");
  });

  it("computes correct subtotals per section", async () => {
    const inst = await seedInstitution();
    await seedAccounts(inst.id);

    const grouped = await getAllAccountsGrouped(db);

    const checkingSavings = grouped.find((g) => g.section === "Checking & Savings")!;
    expect(checkingSavings.subtotal).toBe(1500000);

    const creditCards = grouped.find((g) => g.section === "Credit Cards")!;
    expect(creditCards.subtotal).toBe(250000);

    const investments = grouped.find((g) => g.section === "Investments & Retirement")!;
    expect(investments.subtotal).toBe(8000000);
  });

  it("includes institution name in account data", async () => {
    const inst = await seedInstitution();
    await seedAccounts(inst.id);

    const grouped = await getAllAccountsGrouped(db);
    const allAccounts = grouped.flatMap((g) => g.accounts);
    allAccounts.forEach((a) => {
      expect(a.institutionName).toBe("Test Bank");
    });
  });

  it("returns empty array when no accounts exist", async () => {
    const grouped = await getAllAccountsGrouped(db);
    expect(grouped).toHaveLength(0);
  });

  it("omits sections that have no accounts", async () => {
    const inst = await seedInstitution();
    await db.insert(schema.accounts).values({
      institutionId: inst.id,
      name: "Only Checking",
      type: "checking",
      balanceCurrent: 100000,
      isAsset: true,
      currency: "USD",
      source: "manual",
    }).returning();

    const grouped = await getAllAccountsGrouped(db);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].section).toBe("Checking & Savings");
  });
});

describe("createAccount", () => {
  it("creates a new account with correct values", async () => {
    await seedInstitution();

    const account = await createAccount(db, {
      name: "New Checking",
      institution: "Test Bank",
      type: "checking",
      balance: 150000,
    });

    expect(account.name).toBe("New Checking");
    expect(account.type).toBe("checking");
    expect(account.balanceCurrent).toBe(150000);
    expect(account.isAsset).toBe(true);
  });

  it("creates a credit card account with isAsset=false", async () => {
    await seedInstitution();

    const account = await createAccount(db, {
      name: "New Credit Card",
      institution: "Test Bank",
      type: "credit",
      balance: 300000,
    });

    expect(account.isAsset).toBe(false);
  });

  it("creates institution if it does not exist", async () => {
    const account = await createAccount(db, {
      name: "New Account",
      institution: "Brand New Bank",
      type: "checking",
      balance: 100000,
    });

    expect(account).toBeDefined();
    const institutions = await db.select().from(schema.institutions);
    expect(institutions.some((i) => i.name === "Brand New Bank")).toBe(true);
  });

  it("reuses existing institution by name", async () => {
    await seedInstitution();

    await createAccount(db, {
      name: "Account 1",
      institution: "Test Bank",
      type: "checking",
      balance: 100000,
    });

    await createAccount(db, {
      name: "Account 2",
      institution: "Test Bank",
      type: "savings",
      balance: 200000,
    });

    const institutions = await db.select().from(schema.institutions);
    const testBanks = institutions.filter((i) => i.name === "Test Bank");
    expect(testBanks).toHaveLength(1);
  });
});

describe("updateAccount", () => {
  it("updates account name and balance", async () => {
    const inst = await seedInstitution();
    const accounts = await seedAccounts(inst.id);
    const account = accounts[0]!;

    const updated = await updateAccount(db, account.id, {
      name: "Updated Checking",
      balance: 600000,
    });

    expect(updated!.name).toBe("Updated Checking");
    expect(updated!.balanceCurrent).toBe(600000);
  });

  it("updates account type and adjusts isAsset", async () => {
    const inst = await seedInstitution();
    await seedManualAccount(db, {
      institutionId: inst.id,
      name: "Test Account",
      type: "checking",
      balanceCurrent: 100000,
      isAsset: true,
    });
    const [account] = await db.select().from(schema.accounts);

    const updated = await updateAccount(db, account!.id, {
      type: "credit",
    });

    expect(updated!.type).toBe("credit");
    expect(updated!.isAsset).toBe(false);
  });

  it("returns null for non-existent account", async () => {
    const result = await updateAccount(db, 99999, { name: "No exist" });
    expect(result).toBeNull();
  });

  it("updates institution when institution name changes", async () => {
    const inst = await seedInstitution();
    await seedManualAccount(db, {
      institutionId: inst.id,
      name: "Test Account",
      type: "checking",
      balanceCurrent: 100000,
      isAsset: true,
    });
    const [account] = await db.select().from(schema.accounts);

    const updated = await updateAccount(db, account!.id, {
      institution: "New Bank Name",
    });

    expect(updated).toBeDefined();
    const institutions = await db.select().from(schema.institutions);
    expect(institutions.some((i) => i.name === "New Bank Name")).toBe(true);
  });
});

describe("deleteAccountWithTransactions", () => {
  it("deletes account and its transactions", async () => {
    const inst = await seedInstitution();
    const accounts = await seedAccounts(inst.id);
    const account = accounts[0]!;

    await db.insert(schema.transactions).values({
      accountId: account.id,
      postedAt: "2026-03-01",
      name: "Test Transaction",
      amount: 5000,
      pending: false,
      isTransfer: false,
      reviewState: "none",
    }).returning();

    const deleted = await deleteAccountWithTransactions(db, account.id);
    expect(deleted).toBe(true);

    const accountsAfter = await db.select().from(schema.accounts).where(eq(schema.accounts.id, account.id));
    expect(accountsAfter).toHaveLength(0);

    const txns = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.accountId, account.id));
    expect(txns).toHaveLength(0);
  });

  it("deletes account with no transactions", async () => {
    const inst = await seedInstitution();
    await seedManualAccount(db, {
      institutionId: inst.id,
      name: "Empty Account",
      type: "checking",
      balanceCurrent: 0,
      isAsset: true,
    });
    const [account] = await db.select().from(schema.accounts);

    const deleted = await deleteAccountWithTransactions(db, account!.id);
    expect(deleted).toBe(true);
  });

  it("returns false for non-existent account", async () => {
    const deleted = await deleteAccountWithTransactions(db, 99999);
    expect(deleted).toBe(false);
  });

  it("also deletes transaction splits when deleting transactions", async () => {
    const inst = await seedInstitution();
    const account = await seedManualAccount(db, {
      institutionId: inst.id,
      name: "Account with splits",
      type: "checking",
      balanceCurrent: 100000,
      isAsset: true,
    });

    await db.insert(schema.transactions).values({
      accountId: account.id,
      postedAt: "2026-03-01",
      name: "Split Transaction",
      amount: 10000,
      pending: false,
      isTransfer: false,
      reviewState: "none",
    }).returning();
    const [txn] = await db.select().from(schema.transactions);

    await db.insert(schema.transactionSplits).values([
      { transactionId: txn!.id, category: "Groceries", amount: 6000 },
      { transactionId: txn!.id, category: "Home Goods", amount: 4000 },
    ]).returning();

    const deleted = await deleteAccountWithTransactions(db, account.id);
    expect(deleted).toBe(true);

    const splits = await db.select().from(schema.transactionSplits);
    expect(splits).toHaveLength(0);
  });
});

describe("getAccountById", () => {
  it("returns account with institution name", async () => {
    const inst = await seedInstitution();
    const accounts = await seedAccounts(inst.id);
    const account = accounts[0]!;

    const result = await getAccountById(db, account.id);
    expect(result).toBeDefined();
    expect(result!.id).toBe(account.id);
    expect(result!.institutionName).toBe("Test Bank");
  });

  it("returns null for non-existent id", async () => {
    const result = await getAccountById(db, 99999);
    expect(result).toBeNull();
  });
});
