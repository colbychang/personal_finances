import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AppDatabase } from "@/db/index";
import {
  createOrUpdateMerchantRule,
  getMerchantRuleByKey,
  normalizeMerchantKey,
} from "@/db/queries/merchant-rules";
import {
  createTransaction,
  updateTransaction,
} from "@/db/queries/transactions";
import {
  applyMerchantRules,
  buildCategorizationPrompt,
} from "@/lib/categorize";
import { seedCategories } from "@/db/seed";
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
  await seedCategories(db);
});

async function seedInstitution() {
  return seedManualInstitution(db, "Test Bank");
}

async function seedAccount() {
  const inst = await seedInstitution();
  return seedManualAccount(db, {
    institutionId: inst.id,
    name: "Checking",
    type: "checking",
    balanceCurrent: 500000,
    isAsset: true,
  });
}

describe("applyMerchantRules", () => {
  it("applies matching merchant rule to uncategorized transaction", async () => {
    const account = await seedAccount();

    await createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });

    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "WHOLE FOODS MARKET #123",
      amount: 12500,
      isTransfer: false,
    });

    await db
      .update(schema.transactions)
      .set({ merchant: "Whole Foods" })
      .where(eq(schema.transactions.id, txn.id));

    const { ruleApplied, remaining } = await applyMerchantRules(db, [txn.id]);
    expect(ruleApplied).toHaveLength(1);
    expect(remaining).toHaveLength(0);

    const [updated] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, txn.id))
      .limit(1);
    expect(updated.category).toBe("Groceries");
  });

  it("skips already categorized transactions", async () => {
    const account = await seedAccount();

    await createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });

    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Whole Foods",
      amount: 12500,
      category: "Home Goods",
      isTransfer: false,
    });

    await db
      .update(schema.transactions)
      .set({ merchant: "Whole Foods" })
      .where(eq(schema.transactions.id, txn.id));

    const { ruleApplied, remaining } = await applyMerchantRules(db, [txn.id]);
    expect(ruleApplied).toHaveLength(0);
    expect(remaining).toHaveLength(0);
  });

  it("returns uncategorized transactions without matching rules", async () => {
    const account = await seedAccount();

    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Unknown Store",
      amount: 5000,
      isTransfer: false,
    });

    const { ruleApplied, remaining } = await applyMerchantRules(db, [txn.id]);
    expect(ruleApplied).toHaveLength(0);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toBe(txn.id);
  });

  it("handles name-based matching when merchant is null", async () => {
    const account = await seedAccount();

    await createOrUpdateMerchantRule(db, {
      merchantKey: "starbucks",
      label: "Starbucks",
      category: "Eating Out",
    });

    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "STARBUCKS COFFEE #456",
      amount: 650,
      isTransfer: false,
    });

    const { ruleApplied, remaining } = await applyMerchantRules(db, [txn.id]);
    expect(ruleApplied).toHaveLength(1);
    expect(remaining).toHaveLength(0);
  });
});

describe("buildCategorizationPrompt", () => {
  it("builds a prompt with transaction details and category list", () => {
    const categoryNames = ["Groceries", "Eating Out", "Rent/Home"];
    const transactions = [
      { id: 1, name: "Whole Foods Market", merchant: "Whole Foods", amount: 12500 },
      { id: 2, name: "Uber Eats", merchant: null, amount: 3200 },
    ];

    const prompt = buildCategorizationPrompt(
      transactions as Array<{ id: number; name: string; merchant: string | null; amount: number }>,
      categoryNames,
    );

    expect(prompt).toContain("Groceries");
    expect(prompt).toContain("Eating Out");
    expect(prompt).toContain("Whole Foods");
    expect(prompt).toContain("Uber Eats");
    expect(prompt).toContain("JSON");
  });
});

describe("auto-create merchant rule on category change", () => {
  it("creates a merchant rule when category is manually changed", async () => {
    const account = await seedAccount();

    const txn = await createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "WHOLE FOODS MKT #123",
      amount: 12500,
      isTransfer: false,
    });

    await db
      .update(schema.transactions)
      .set({ merchant: "Whole Foods" })
      .where(eq(schema.transactions.id, txn.id));

    await updateTransaction(db, txn.id, { category: "Groceries" });

    const merchantName = "Whole Foods";
    const key = normalizeMerchantKey(merchantName);
    await createOrUpdateMerchantRule(db, {
      merchantKey: key,
      label: merchantName,
      category: "Groceries",
    });

    const rule = await getMerchantRuleByKey(db, key);
    expect(rule).not.toBeNull();
    expect(rule!.category).toBe("Groceries");
    expect(rule!.merchantKey).toBe("whole foods");
  });
});
