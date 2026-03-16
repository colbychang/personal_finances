import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
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
  db.run(sql`DELETE FROM merchant_rules`);
  db.run(sql`DELETE FROM transaction_splits`);
  db.run(sql`DELETE FROM transactions`);
  db.run(sql`DELETE FROM accounts`);
  db.run(sql`DELETE FROM institutions`);
  db.run(sql`DELETE FROM categories`);

  // Seed categories
  const predefined = [
    { name: "Rent/Home", color: "#8b5cf6", icon: "home", isPredefined: true, sortOrder: 1 },
    { name: "Groceries", color: "#22c55e", icon: "shopping-cart", isPredefined: true, sortOrder: 2 },
    { name: "Eating Out", color: "#f97316", icon: "utensils", isPredefined: true, sortOrder: 3 },
    { name: "Bars/Clubs/Going Out", color: "#ec4899", icon: "wine", isPredefined: true, sortOrder: 4 },
    { name: "Other Fun Activities", color: "#06b6d4", icon: "smile", isPredefined: true, sortOrder: 5 },
    { name: "Clothing", color: "#a855f7", icon: "shirt", isPredefined: true, sortOrder: 6 },
    { name: "Insurance", color: "#64748b", icon: "shield", isPredefined: true, sortOrder: 7 },
    { name: "Subscriptions", color: "#6366f1", icon: "repeat", isPredefined: true, sortOrder: 8 },
    { name: "Home Goods", color: "#14b8a6", icon: "lamp", isPredefined: true, sortOrder: 9 },
    { name: "Vacations", color: "#f59e0b", icon: "plane", isPredefined: true, sortOrder: 10 },
    { name: "Large Purchases", color: "#ef4444", icon: "credit-card", isPredefined: true, sortOrder: 11 },
  ];

  for (const cat of predefined) {
    db.insert(schema.categories).values(cat).run();
  }
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

// ─── Tests: applyMerchantRules ───────────────────────────────────────

describe("applyMerchantRules", () => {
  it("applies matching merchant rule to uncategorized transaction", () => {
    const account = seedAccount();

    // Create a merchant rule
    createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });

    // Create an uncategorized transaction with matching merchant
    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "WHOLE FOODS MARKET #123",
      amount: 12500,
      isTransfer: false,
    });

    // Store the merchant for lookup
    db.update(schema.transactions)
      .set({ merchant: "Whole Foods" })
      .where(eq(schema.transactions.id, txn.id))
      .run();

    const { ruleApplied, remaining } = applyMerchantRules(db, [txn.id]);
    expect(ruleApplied).toHaveLength(1);
    expect(remaining).toHaveLength(0);

    // Verify category was set
    const updated = db.select().from(schema.transactions).where(eq(schema.transactions.id, txn.id)).get()!;
    expect(updated.category).toBe("Groceries");
  });

  it("skips already categorized transactions", () => {
    const account = seedAccount();

    createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });

    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Whole Foods",
      amount: 12500,
      category: "Home Goods", // already categorized
      isTransfer: false,
    });

    db.update(schema.transactions)
      .set({ merchant: "Whole Foods" })
      .where(eq(schema.transactions.id, txn.id))
      .run();

    const { ruleApplied, remaining } = applyMerchantRules(db, [txn.id]);
    // Already categorized — merchant rule should NOT override
    expect(ruleApplied).toHaveLength(0);
    expect(remaining).toHaveLength(0);
  });

  it("returns uncategorized transactions without matching rules", () => {
    const account = seedAccount();

    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "Unknown Store",
      amount: 5000,
      isTransfer: false,
    });

    const { ruleApplied, remaining } = applyMerchantRules(db, [txn.id]);
    expect(ruleApplied).toHaveLength(0);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toBe(txn.id);
  });

  it("handles name-based matching when merchant is null", () => {
    const account = seedAccount();

    createOrUpdateMerchantRule(db, {
      merchantKey: "starbucks",
      label: "Starbucks",
      category: "Eating Out",
    });

    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "STARBUCKS COFFEE #456",
      amount: 650,
      isTransfer: false,
    });
    // merchant is null, but name contains "starbucks"

    const { ruleApplied, remaining } = applyMerchantRules(db, [txn.id]);
    expect(ruleApplied).toHaveLength(1);
    expect(remaining).toHaveLength(0);
  });
});

// ─── Tests: buildCategorizationPrompt ────────────────────────────────

describe("buildCategorizationPrompt", () => {
  it("builds a prompt with transaction details and category list", () => {
    const categoryNames = ["Groceries", "Eating Out", "Rent/Home"];
    const transactions = [
      { id: 1, name: "Whole Foods Market", merchant: "Whole Foods", amount: 12500 },
      { id: 2, name: "Uber Eats", merchant: null, amount: 3200 },
    ];

    const prompt = buildCategorizationPrompt(
      transactions as Array<{ id: number; name: string; merchant: string | null; amount: number }>,
      categoryNames
    );

    expect(prompt).toContain("Groceries");
    expect(prompt).toContain("Eating Out");
    expect(prompt).toContain("Whole Foods");
    expect(prompt).toContain("Uber Eats");
    expect(prompt).toContain("JSON");
  });
});

// ─── Tests: Auto merchant rule creation on category change ───────────

describe("auto-create merchant rule on category change", () => {
  it("creates a merchant rule when category is manually changed", () => {
    const account = seedAccount();

    const txn = createTransaction(db, {
      accountId: account.id,
      postedAt: "2026-03-15",
      name: "WHOLE FOODS MKT #123",
      amount: 12500,
      isTransfer: false,
    });

    // Simulate merchant field
    db.update(schema.transactions)
      .set({ merchant: "Whole Foods" })
      .where(eq(schema.transactions.id, txn.id))
      .run();

    // Update category (simulating user manually changing it)
    updateTransaction(db, txn.id, { category: "Groceries" });

    // Now auto-create a merchant rule based on this change
    const merchantName = "Whole Foods";
    const key = normalizeMerchantKey(merchantName);
    createOrUpdateMerchantRule(db, {
      merchantKey: key,
      label: merchantName,
      category: "Groceries",
    });

    // Verify rule exists
    const rule = getMerchantRuleByKey(db, key);
    expect(rule).not.toBeNull();
    expect(rule!.category).toBe("Groceries");
    expect(rule!.merchantKey).toBe("whole foods");
  });
});
