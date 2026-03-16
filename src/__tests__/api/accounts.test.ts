import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  getAllAccountsGrouped,
  createAccount,
  updateAccount,
  deleteAccountWithTransactions,
  getAccountById,
} from "@/db/queries/accounts";

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
  db.run(sql`DELETE FROM account_snapshots`);
  db.run(sql`DELETE FROM account_links`);
  db.run(sql`DELETE FROM transactions`);
  db.run(sql`DELETE FROM accounts`);
  db.run(sql`DELETE FROM institutions`);
});

function seedInstitution() {
  db.insert(schema.institutions)
    .values({ name: "Test Bank", provider: "manual", status: "active" })
    .run();
  const [inst] = db.select().from(schema.institutions).all();
  return inst!;
}

function seedAccounts(institutionId: number) {
  db.insert(schema.accounts)
    .values([
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
    ])
    .run();
  return db.select().from(schema.accounts).all();
}

describe("getAllAccountsGrouped", () => {
  it("returns accounts grouped by type sections", () => {
    const inst = seedInstitution();
    seedAccounts(inst.id);

    const grouped = getAllAccountsGrouped(db);

    expect(grouped).toHaveLength(3); // 3 sections

    const sectionNames = grouped.map((g) => g.section);
    expect(sectionNames).toContain("Checking & Savings");
    expect(sectionNames).toContain("Credit Cards");
    expect(sectionNames).toContain("Investments & Retirement");
  });

  it("computes correct subtotals per section", () => {
    const inst = seedInstitution();
    seedAccounts(inst.id);

    const grouped = getAllAccountsGrouped(db);

    const checkingSavings = grouped.find((g) => g.section === "Checking & Savings")!;
    expect(checkingSavings.subtotal).toBe(1500000); // 500000 + 1000000

    const creditCards = grouped.find((g) => g.section === "Credit Cards")!;
    expect(creditCards.subtotal).toBe(250000);

    const investments = grouped.find((g) => g.section === "Investments & Retirement")!;
    expect(investments.subtotal).toBe(8000000); // 5000000 + 3000000
  });

  it("includes institution name in account data", () => {
    const inst = seedInstitution();
    seedAccounts(inst.id);

    const grouped = getAllAccountsGrouped(db);
    const allAccounts = grouped.flatMap((g) => g.accounts);
    allAccounts.forEach((a) => {
      expect(a.institutionName).toBe("Test Bank");
    });
  });

  it("returns empty array when no accounts exist", () => {
    const grouped = getAllAccountsGrouped(db);
    expect(grouped).toHaveLength(0);
  });

  it("omits sections that have no accounts", () => {
    const inst = seedInstitution();
    // Only add checking account
    db.insert(schema.accounts)
      .values({
        institutionId: inst.id,
        name: "Only Checking",
        type: "checking",
        balanceCurrent: 100000,
        isAsset: true,
        currency: "USD",
        source: "manual",
      })
      .run();

    const grouped = getAllAccountsGrouped(db);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].section).toBe("Checking & Savings");
  });
});

describe("createAccount", () => {
  it("creates a new account with correct values", () => {
    seedInstitution();

    const account = createAccount(db, {
      name: "New Checking",
      institution: "Test Bank",
      type: "checking",
      balance: 150000, // in cents
    });

    expect(account.name).toBe("New Checking");
    expect(account.type).toBe("checking");
    expect(account.balanceCurrent).toBe(150000);
    expect(account.isAsset).toBe(true);
  });

  it("creates a credit card account with isAsset=false", () => {
    seedInstitution();

    const account = createAccount(db, {
      name: "New Credit Card",
      institution: "Test Bank",
      type: "credit",
      balance: 300000,
    });

    expect(account.isAsset).toBe(false);
  });

  it("creates institution if it does not exist", () => {
    const account = createAccount(db, {
      name: "New Account",
      institution: "Brand New Bank",
      type: "checking",
      balance: 100000,
    });

    expect(account).toBeDefined();
    const institutions = db.select().from(schema.institutions).all();
    expect(institutions.some((i) => i.name === "Brand New Bank")).toBe(true);
  });

  it("reuses existing institution by name", () => {
    seedInstitution(); // Creates "Test Bank"

    createAccount(db, {
      name: "Account 1",
      institution: "Test Bank",
      type: "checking",
      balance: 100000,
    });

    createAccount(db, {
      name: "Account 2",
      institution: "Test Bank",
      type: "savings",
      balance: 200000,
    });

    const institutions = db.select().from(schema.institutions).all();
    const testBanks = institutions.filter((i) => i.name === "Test Bank");
    expect(testBanks).toHaveLength(1);
  });
});

describe("updateAccount", () => {
  it("updates account name and balance", () => {
    const inst = seedInstitution();
    seedAccounts(inst.id);
    const [account] = db.select().from(schema.accounts).all();

    const updated = updateAccount(db, account!.id, {
      name: "Updated Checking",
      balance: 600000,
    });

    expect(updated!.name).toBe("Updated Checking");
    expect(updated!.balanceCurrent).toBe(600000);
  });

  it("updates account type and adjusts isAsset", () => {
    const inst = seedInstitution();
    db.insert(schema.accounts)
      .values({
        institutionId: inst.id,
        name: "Test Account",
        type: "checking",
        balanceCurrent: 100000,
        isAsset: true,
        currency: "USD",
        source: "manual",
      })
      .run();
    const [account] = db.select().from(schema.accounts).all();

    const updated = updateAccount(db, account!.id, {
      type: "credit",
    });

    expect(updated!.type).toBe("credit");
    expect(updated!.isAsset).toBe(false);
  });

  it("returns null for non-existent account", () => {
    const result = updateAccount(db, 99999, { name: "No exist" });
    expect(result).toBeNull();
  });

  it("updates institution when institution name changes", () => {
    const inst = seedInstitution();
    db.insert(schema.accounts)
      .values({
        institutionId: inst.id,
        name: "Test Account",
        type: "checking",
        balanceCurrent: 100000,
        isAsset: true,
        currency: "USD",
        source: "manual",
      })
      .run();
    const [account] = db.select().from(schema.accounts).all();

    const updated = updateAccount(db, account!.id, {
      institution: "New Bank Name",
    });

    expect(updated).toBeDefined();
    // Verify institution was created/changed
    const institutions = db.select().from(schema.institutions).all();
    expect(institutions.some((i) => i.name === "New Bank Name")).toBe(true);
  });
});

describe("deleteAccountWithTransactions", () => {
  it("deletes account and its transactions", () => {
    const inst = seedInstitution();
    seedAccounts(inst.id);
    const [account] = db.select().from(schema.accounts).all();

    // Add a transaction to this account
    db.insert(schema.transactions)
      .values({
        accountId: account!.id,
        postedAt: "2026-03-01",
        name: "Test Transaction",
        amount: 5000,
        pending: false,
        isTransfer: false,
        reviewState: "none",
      })
      .run();

    const deleted = deleteAccountWithTransactions(db, account!.id);
    expect(deleted).toBe(true);

    // Account should be gone
    const accounts = db.select().from(schema.accounts).where(eq(schema.accounts.id, account!.id)).all();
    expect(accounts).toHaveLength(0);

    // Transactions should be gone
    const txns = db.select().from(schema.transactions).where(eq(schema.transactions.accountId, account!.id)).all();
    expect(txns).toHaveLength(0);
  });

  it("deletes account with no transactions", () => {
    const inst = seedInstitution();
    db.insert(schema.accounts)
      .values({
        institutionId: inst.id,
        name: "Empty Account",
        type: "checking",
        balanceCurrent: 0,
        isAsset: true,
        currency: "USD",
        source: "manual",
      })
      .run();
    const [account] = db.select().from(schema.accounts).all();

    const deleted = deleteAccountWithTransactions(db, account!.id);
    expect(deleted).toBe(true);
  });

  it("returns false for non-existent account", () => {
    const deleted = deleteAccountWithTransactions(db, 99999);
    expect(deleted).toBe(false);
  });

  it("also deletes transaction splits when deleting transactions", () => {
    const inst = seedInstitution();
    db.insert(schema.accounts)
      .values({
        institutionId: inst.id,
        name: "Account with splits",
        type: "checking",
        balanceCurrent: 100000,
        isAsset: true,
        currency: "USD",
        source: "manual",
      })
      .run();
    const [account] = db.select().from(schema.accounts).all();

    db.insert(schema.transactions)
      .values({
        accountId: account!.id,
        postedAt: "2026-03-01",
        name: "Split Transaction",
        amount: 10000,
        pending: false,
        isTransfer: false,
        reviewState: "none",
      })
      .run();
    const [txn] = db.select().from(schema.transactions).all();

    db.insert(schema.transactionSplits)
      .values([
        { transactionId: txn!.id, category: "Groceries", amount: 6000 },
        { transactionId: txn!.id, category: "Home Goods", amount: 4000 },
      ])
      .run();

    const deleted = deleteAccountWithTransactions(db, account!.id);
    expect(deleted).toBe(true);

    const splits = db.select().from(schema.transactionSplits).all();
    expect(splits).toHaveLength(0);
  });
});

describe("getAccountById", () => {
  it("returns account with institution name", () => {
    const inst = seedInstitution();
    seedAccounts(inst.id);
    const [account] = db.select().from(schema.accounts).all();

    const result = getAccountById(db, account!.id);
    expect(result).toBeDefined();
    expect(result!.id).toBe(account!.id);
    expect(result!.institutionName).toBe("Test Bank");
  });

  it("returns null for non-existent id", () => {
    const result = getAccountById(db, 99999);
    expect(result).toBeNull();
  });
});
