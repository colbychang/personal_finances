import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  getAllMerchantRules,
  getMerchantRuleByKey,
  createOrUpdateMerchantRule,
  updateMerchantRule,
  deleteMerchantRule,
  normalizeMerchantKey,
} from "@/db/queries/merchant-rules";

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
  it("creates a new merchant rule", () => {
    const rule = createOrUpdateMerchantRule(db, {
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

  it("updates existing rule when merchantKey matches", () => {
    createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });

    const updated = createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods Market",
      category: "Home Goods",
    });

    expect(updated.category).toBe("Home Goods");
    expect(updated.label).toBe("Whole Foods Market");

    // Should be only 1 rule
    const all = getAllMerchantRules(db);
    expect(all).toHaveLength(1);
  });

  it("creates a transfer rule", () => {
    const rule = createOrUpdateMerchantRule(db, {
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
  it("returns empty array when no rules exist", () => {
    expect(getAllMerchantRules(db)).toHaveLength(0);
  });

  it("returns all rules", () => {
    createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });
    createOrUpdateMerchantRule(db, {
      merchantKey: "starbucks",
      label: "Starbucks",
      category: "Eating Out",
    });

    const rules = getAllMerchantRules(db);
    expect(rules).toHaveLength(2);
  });
});

// ─── Tests: getMerchantRuleByKey ─────────────────────────────────────

describe("getMerchantRuleByKey", () => {
  it("finds a rule by merchant key", () => {
    createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });

    const rule = getMerchantRuleByKey(db, "whole foods");
    expect(rule).not.toBeNull();
    expect(rule!.category).toBe("Groceries");
  });

  it("returns null for non-existent key", () => {
    const rule = getMerchantRuleByKey(db, "nonexistent");
    expect(rule).toBeNull();
  });
});

// ─── Tests: updateMerchantRule ───────────────────────────────────────

describe("updateMerchantRule", () => {
  it("updates rule category", () => {
    const rule = createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });

    const updated = updateMerchantRule(db, rule.id, { category: "Home Goods" });
    expect(updated).not.toBeNull();
    expect(updated!.category).toBe("Home Goods");
  });

  it("returns null for non-existent id", () => {
    const result = updateMerchantRule(db, 99999, { category: "Groceries" });
    expect(result).toBeNull();
  });
});

// ─── Tests: deleteMerchantRule ───────────────────────────────────────

describe("deleteMerchantRule", () => {
  it("deletes a rule", () => {
    const rule = createOrUpdateMerchantRule(db, {
      merchantKey: "whole foods",
      label: "Whole Foods",
      category: "Groceries",
    });

    const deleted = deleteMerchantRule(db, rule.id);
    expect(deleted).toBe(true);

    const rules = getAllMerchantRules(db);
    expect(rules).toHaveLength(0);
  });

  it("returns false for non-existent rule", () => {
    const deleted = deleteMerchantRule(db, 99999);
    expect(deleted).toBe(false);
  });
});
