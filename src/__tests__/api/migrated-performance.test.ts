import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { AppDatabase } from "@/db/index";
import * as schema from "@/db/schema";
import { seedCategories } from "@/db/seed";
import { getDashboardData } from "@/db/queries/dashboard";
import { getSpendingByCategory } from "@/db/queries/analytics";
import { getTransactions } from "@/db/queries/transactions";
import { importTransactions, type ImportTransactionInput } from "@/db/queries/imports";
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
let checkingId: number;
let creditId: number;

async function seedPerformanceData() {
  await seedCategories(db);

  const bank = await seedManualInstitution(db, "Perf Bank");
  const cardIssuer = await seedManualInstitution(db, "Perf Card");
  const checking = await seedManualAccount(db, {
    institutionId: bank.id,
    name: "Checking",
    type: "checking",
    balanceCurrent: 2_000_000,
    isAsset: true,
  });
  const credit = await seedManualAccount(db, {
    institutionId: cardIssuer.id,
    name: "Credit Card",
    type: "credit",
    balanceCurrent: 300_000,
    isAsset: false,
  });

  checkingId = checking.id;
  creditId = credit.id;

  const categories = [
    "Rent/Home",
    "Groceries",
    "Eating Out",
    "Clothing",
    "Subscriptions",
    "Large Purchases",
  ] as const;

  const transactions = Array.from({ length: 2500 }, (_, index) => {
    const month = String((index % 6) + 1).padStart(2, "0");
    const day = String((index % 28) + 1).padStart(2, "0");
    const category = categories[Math.floor(index / 7) % categories.length];

    return {
      accountId: index % 2 === 0 ? checkingId : creditId,
      postedAt: `2026-${month}-${day}`,
      name: `${category} purchase ${index}`,
      amount: 1_000 + (index % 17) * 125,
      category,
      isTransfer: false,
      reviewState: "none" as const,
    };
  });

  await db.insert(schema.transactions).values(transactions).returning();

  await db.insert(schema.budgets).values(
    categories.map((category) => ({
      month: "2026-03",
      category,
      amount: 300_000,
    })),
  ).returning();
}

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
});

afterAll(async () => {
  await closeTestDb(testDb);
});

beforeEach(async () => {
  await resetTestDb(db);
  await seedPerformanceData();
});

describe("migrated query performance", () => {
  it(
    "returns a filtered transaction page within a reasonable time budget",
    async () => {
      const startedAt = performance.now();
      const result = await getTransactions(db, {
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
        category: "Groceries",
        page: 1,
        limit: 50,
      });
      const durationMs = performance.now() - startedAt;

      expect(result.transactions.length).toBeGreaterThan(0);
      expect(result.limit).toBe(50);
      expect(durationMs).toBeLessThan(1500);
    },
    15000,
  );

  it(
    "builds dashboard aggregates over a larger dataset without degrading badly",
    async () => {
      const startedAt = performance.now();
      const result = await getDashboardData(db, "2026-03");
      const durationMs = performance.now() - startedAt;

      expect(result.totalSpending).toBeGreaterThan(0);
      expect(result.spendingByCategory.length).toBeGreaterThan(0);
      expect(result.recentTransactions.length).toBeGreaterThan(0);
      expect(durationMs).toBeLessThan(2000);
    },
    15000,
  );

  it(
    "imports a large batch of transactions and keeps analytics responsive afterward",
    async () => {
      const imports: ImportTransactionInput[] = Array.from({ length: 1000 }, (_, index) => ({
        accountId: checkingId,
        postedAt: `2026-04-${String((index % 28) + 1).padStart(2, "0")}`,
        name: `Imported grocery ${index}`,
        amount: 2_500,
        category: "Groceries",
      }));

      const importStartedAt = performance.now();
      const imported = await importTransactions(db, imports);
      const importDurationMs = performance.now() - importStartedAt;

      const analyticsStartedAt = performance.now();
      const analytics = await getSpendingByCategory(db, "2026-04-01", "2026-05-01");
      const analyticsDurationMs = performance.now() - analyticsStartedAt;

      expect(imported).toBe(1000);
      expect(analytics.find((row) => row.category === "Groceries")?.amount).toBeGreaterThan(0);
      expect(importDurationMs).toBeLessThan(2500);
      expect(analyticsDurationMs).toBeLessThan(1500);
    },
    15000,
  );
});
