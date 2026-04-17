import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AppDatabase } from "@/db/index";
import {
  createSnapshot,
  getAllSnapshots,
  getSnapshotByMonth,
  getAccountBalanceHistory,
} from "@/db/queries/snapshots";
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

describe("createSnapshot", () => {
  it("captures all account balances and calculates totals correctly", async () => {
    const inst = await seedInstitution();
    await seedAccounts(inst.id);

    const snapshot = await createSnapshot(db, "2026-03");

    expect(snapshot.assets).toBe(9500000);
    expect(snapshot.liabilities).toBe(250000);
    expect(snapshot.netWorth).toBe(9250000);
    expect(snapshot.month).toBe("2026-03");
  });

  it("stores per-account balances in account_snapshots", async () => {
    const inst = await seedInstitution();
    const accounts = await seedAccounts(inst.id);

    await createSnapshot(db, "2026-03");

    const accountSnaps = await db.select().from(schema.accountSnapshots);
    expect(accountSnaps).toHaveLength(accounts.length);

    for (const account of accounts) {
      const snap = accountSnaps.find((s) => s.accountId === account.id);
      expect(snap).toBeDefined();
      expect(snap!.balanceCurrent).toBe(account.balanceCurrent);
      expect(snap!.isAsset).toBe(account.isAsset);
      expect(snap!.day).toMatch(/^2026-03/);
    }
  });

  it("replaces existing snapshot for the same month", async () => {
    const inst = await seedInstitution();
    await seedAccounts(inst.id);

    await createSnapshot(db, "2026-03");

    await db
      .update(schema.accounts)
      .set({ balanceCurrent: 600000 })
      .where(eq(schema.accounts.name, "My Checking"));

    const snapshot2 = await createSnapshot(db, "2026-03");

    expect(snapshot2.assets).toBe(9600000);

    const allSnapshots = await db.select().from(schema.snapshots);
    expect(allSnapshots).toHaveLength(1);
  });

  it("handles empty accounts (no accounts exist)", async () => {
    const snapshot = await createSnapshot(db, "2026-03");

    expect(snapshot.assets).toBe(0);
    expect(snapshot.liabilities).toBe(0);
    expect(snapshot.netWorth).toBe(0);
  });

  it("handles accounts with zero balance", async () => {
    const inst = await seedInstitution();
    await seedManualAccount(db, {
      institutionId: inst.id,
      name: "Empty Checking",
      type: "checking",
      balanceCurrent: 0,
      isAsset: true,
    });

    const snapshot = await createSnapshot(db, "2026-03");
    expect(snapshot.assets).toBe(0);
    expect(snapshot.liabilities).toBe(0);
    expect(snapshot.netWorth).toBe(0);
  });
});

describe("getAllSnapshots", () => {
  it("returns all snapshots sorted by month ascending", async () => {
    const inst = await seedInstitution();
    await seedAccounts(inst.id);

    await createSnapshot(db, "2026-01");
    await createSnapshot(db, "2026-03");
    await createSnapshot(db, "2026-02");

    const snapshots = await getAllSnapshots(db);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[0].month).toBe("2026-01");
    expect(snapshots[1].month).toBe("2026-02");
    expect(snapshots[2].month).toBe("2026-03");
  });

  it("returns empty array when no snapshots exist", async () => {
    const snapshots = await getAllSnapshots(db);
    expect(snapshots).toHaveLength(0);
  });
});

describe("getSnapshotByMonth", () => {
  it("returns snapshot with per-account balances for a given month", async () => {
    const inst = await seedInstitution();
    await seedAccounts(inst.id);

    await createSnapshot(db, "2026-03");

    const result = await getSnapshotByMonth(db, "2026-03");
    expect(result).not.toBeNull();
    expect(result!.snapshot.month).toBe("2026-03");
    expect(result!.accountBalances).toHaveLength(5);

    for (const ab of result!.accountBalances) {
      expect(ab.accountName).toBeDefined();
      expect(ab.accountType).toBeDefined();
      expect(ab.balanceCurrent).toBeDefined();
      expect(typeof ab.isAsset).toBe("boolean");
    }
  });

  it("returns null for non-existent month", async () => {
    const result = await getSnapshotByMonth(db, "2099-12");
    expect(result).toBeNull();
  });
});

describe("getAccountBalanceHistory", () => {
  it("returns balance history for all accounts across snapshots", async () => {
    const inst = await seedInstitution();
    await seedAccounts(inst.id);

    await createSnapshot(db, "2026-01");

    await db
      .update(schema.accounts)
      .set({ balanceCurrent: 600000 })
      .where(eq(schema.accounts.name, "My Checking"));
    await createSnapshot(db, "2026-02");

    const history = await getAccountBalanceHistory(db);
    expect(history.length).toBeGreaterThan(0);

    const checkingHistory = history.filter((h) => h.accountName === "My Checking");
    expect(checkingHistory).toHaveLength(2);
    expect(checkingHistory[0].balanceCurrent).toBe(500000);
    expect(checkingHistory[1].balanceCurrent).toBe(600000);
  });

  it("returns empty array when no snapshots exist", async () => {
    const history = await getAccountBalanceHistory(db);
    expect(history).toHaveLength(0);
  });
});
