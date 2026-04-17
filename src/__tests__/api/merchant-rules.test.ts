import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { AppDatabase } from "@/db/index";
import {
  getAllMerchantRules,
  getMerchantRuleByKey,
  createOrUpdateMerchantRule,
  updateMerchantRule,
  deleteMerchantRule,
  normalizeMerchantKey,
} from "@/db/queries/merchant-rules";
import {
  closeTestDb,
  createTestDb,
  resetTestDb,
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

// ─── Tests: normalizeMerchantKey ─────────────────────────────────────

describe("normalizeMerchantKey", () => {
  it("lowercases and trims whitespace", () => {
    expect(normalizeMerchantKey("  Whole Foods  ")).toBe("whole foods");
  });

  it("handles already normalized strings", () => {
    expect(normalizeMerchantKey("starbucks")).toBe("starbucks");
  });

  it("handles mixed case with special characters", () => {
    expect(normalizeMerchantKey("McDonald's #12345")).toBe("mcdonald's #12345");
  });
});

// ─── Tests: createOrUpdateMerchantRule ───────────────────────────────

describe("createOrUpdateMerchantRule", () => {
  it("creates a new merchant rule", async () => {
    const rule = await createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });

    expect(rule.id).toBeDefined();
    expect(rule.merchantKey).toBe("whole foods");
    expect(rule.label).toBe("Whole Foods");
    expect(rule.category).toBe("Groceries");
    expect(rule.isTransfer).toBe(false);
  });

  it("updates existing rule when merchantKey matches", async () => {
    await createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });

    const updated = await createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods Market",
      category: "Home Goods",
    });

    expect(updated.category).toBe("Home Goods");
    expect(updated.label).toBe("Whole Foods Market");

    // Should be only 1 rule
    const all = await getAllMerchantRules(db);
    expect(all).toHaveLength(1);
  });

  it("creates a transfer rule", async () => {
    const rule = await createOrUpdateMerchantRule(db, {
      merchantKey: "venmo",
      label: "Venmo",
      category: "Transfer",
      isTransfer: true,
    });

    expect(rule.isTransfer).toBe(true);
  });
});

// ─── Tests: getAllMerchantRules ───────────────────────────────────────

describe("getAllMerchantRules", () => {
  it("returns empty array when no rules exist", async () => {
    await expect(getAllMerchantRules(db)).resolves.toHaveLength(0);
  });

  it("returns all rules", async () => {
    await createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });
    await createOrUpdateMerchantRule(db, {
      merchantKey: "starbucks",
      label: "Starbucks",
      category: "Eating Out",
    });

    const rules = await getAllMerchantRules(db);
    expect(rules).toHaveLength(2);
  });
});

// ─── Tests: getMerchantRuleByKey ─────────────────────────────────────

describe("getMerchantRuleByKey", () => {
  it("finds a rule by merchant key", async () => {
    await createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });

    const rule = await getMerchantRuleByKey(db, "whole foods");
    expect(rule).not.toBeNull();
    expect(rule!.category).toBe("Groceries");
  });

  it("returns null for non-existent key", async () => {
    const rule = await getMerchantRuleByKey(db, "nonexistent");
    expect(rule).toBeNull();
  });
});

// ─── Tests: updateMerchantRule ───────────────────────────────────────

describe("updateMerchantRule", () => {
  it("updates rule category", async () => {
    const rule = await createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });

    const updated = await updateMerchantRule(db, rule.id, { category: "Home Goods" });
    expect(updated).not.toBeNull();
    expect(updated!.category).toBe("Home Goods");
  });

  it("returns null for non-existent id", async () => {
    const result = await updateMerchantRule(db, 99999, { category: "Groceries" });
    expect(result).toBeNull();
  });
});

// ─── Tests: deleteMerchantRule ───────────────────────────────────────

describe("deleteMerchantRule", () => {
  it("deletes a rule", async () => {
    const rule = await createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });

    const deleted = await deleteMerchantRule(db, rule.id);
    expect(deleted).toBe(true);

    const rules = await getAllMerchantRules(db);
    expect(rules).toHaveLength(0);
  });

  it("returns false for non-existent rule", async () => {
    const deleted = await deleteMerchantRule(db, 99999);
    expect(deleted).toBe(false);
  });
});
