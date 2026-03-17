import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  createSnapshot,
  getAllSnapshots,
  getSnapshotByMonth,
  getAccountBalanceHistory,
} from "@/db/queries/snapshots";

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
  db.run(sql`DELETE FROM account_snapshots`);
  db.run(sql`DELETE FROM snapshots`);
  db.run(sql`DELETE FROM transaction_splits`);
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
        balanceCurrent: 500000, // $5,000.00
        isAsset: true,
        currency: "USD",
        source: "manual",
      },
      {
        institutionId,
        name: "My Savings",
        type: "savings",
        balanceCurrent: 1000000, // $10,000.00
        isAsset: true,
        currency: "USD",
        source: "manual",
      },
      {
        institutionId,
        name: "Credit Card",
        type: "credit",
        balanceCurrent: 250000, // $2,500.00
        isAsset: false,
        currency: "USD",
        source: "manual",
      },
      {
        institutionId,
        name: "401k",
        type: "retirement",
        balanceCurrent: 5000000, // $50,000.00
        isAsset: true,
        currency: "USD",
        source: "manual",
      },
      {
        institutionId,
        name: "Brokerage",
        type: "investment",
        balanceCurrent: 3000000, // $30,000.00
        isAsset: true,
        currency: "USD",
        source: "manual",
      },
    ])
    .run();
  return db.select().from(schema.accounts).all();
}

// ─── createSnapshot ─────────────────────────────────────────────────────

describe("createSnapshot", () => {
  it("captures all account balances and calculates totals correctly", () => {
    const inst = seedInstitution();
    seedAccounts(inst.id);

    const snapshot = createSnapshot(db, "2026-03");

    // Total assets: checking(5000) + savings(10000) + 401k(50000) + brokerage(30000) = 95000
    // Total liabilities: credit card(2500) = 2500
    // Net worth: 95000 - 2500 = 92500
    expect(snapshot.assets).toBe(9500000); // $95,000.00 in cents
    expect(snapshot.liabilities).toBe(250000); // $2,500.00 in cents
    expect(snapshot.netWorth).toBe(9250000); // $92,500.00 in cents
    expect(snapshot.month).toBe("2026-03");
  });

  it("stores per-account balances in account_snapshots", () => {
    const inst = seedInstitution();
    const accounts = seedAccounts(inst.id);

    createSnapshot(db, "2026-03");

    const accountSnaps = db.select().from(schema.accountSnapshots).all();
    expect(accountSnaps).toHaveLength(accounts.length);

    // Each account should have a snapshot entry
    for (const account of accounts) {
      const snap = accountSnaps.find((s) => s.accountId === account.id);
      expect(snap).toBeDefined();
      expect(snap!.balanceCurrent).toBe(account.balanceCurrent);
      expect(snap!.isAsset).toBe(account.isAsset);
      expect(snap!.day).toMatch(/^2026-03/);
    }
  });

  it("replaces existing snapshot for the same month", () => {
    const inst = seedInstitution();
    seedAccounts(inst.id);

    createSnapshot(db, "2026-03");

    // Update a balance
    db.update(schema.accounts)
      .set({ balanceCurrent: 600000 })
      .where(sql`name = 'My Checking'`)
      .run();

    const snapshot2 = createSnapshot(db, "2026-03");

    // Should reflect updated balance: 6000 + 10000 + 50000 + 30000 = 96000
    expect(snapshot2.assets).toBe(9600000);

    // Should only have 1 snapshot for the month
    const allSnapshots = db.select().from(schema.snapshots).all();
    expect(allSnapshots).toHaveLength(1);
  });

  it("handles empty accounts (no accounts exist)", () => {
    const snapshot = createSnapshot(db, "2026-03");

    expect(snapshot.assets).toBe(0);
    expect(snapshot.liabilities).toBe(0);
    expect(snapshot.netWorth).toBe(0);
  });

  it("handles accounts with zero balance", () => {
    const inst = seedInstitution();
    db.insert(schema.accounts)
      .values({
        institutionId: inst.id,
        name: "Empty Checking",
        type: "checking",
        balanceCurrent: 0,
        isAsset: true,
        currency: "USD",
        source: "manual",
      })
      .run();

    const snapshot = createSnapshot(db, "2026-03");
    expect(snapshot.assets).toBe(0);
    expect(snapshot.liabilities).toBe(0);
    expect(snapshot.netWorth).toBe(0);
  });
});

// ─── getAllSnapshots ────────────────────────────────────────────────────

describe("getAllSnapshots", () => {
  it("returns all snapshots sorted by month ascending", () => {
    const inst = seedInstitution();
    seedAccounts(inst.id);

    createSnapshot(db, "2026-01");
    createSnapshot(db, "2026-03");
    createSnapshot(db, "2026-02");

    const snapshots = getAllSnapshots(db);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[0].month).toBe("2026-01");
    expect(snapshots[1].month).toBe("2026-02");
    expect(snapshots[2].month).toBe("2026-03");
  });

  it("returns empty array when no snapshots exist", () => {
    const snapshots = getAllSnapshots(db);
    expect(snapshots).toHaveLength(0);
  });
});

// ─── getSnapshotByMonth ────────────────────────────────────────────────

describe("getSnapshotByMonth", () => {
  it("returns snapshot with per-account balances for a given month", () => {
    const inst = seedInstitution();
    seedAccounts(inst.id);

    createSnapshot(db, "2026-03");

    const result = getSnapshotByMonth(db, "2026-03");
    expect(result).not.toBeNull();
    expect(result!.snapshot.month).toBe("2026-03");
    expect(result!.accountBalances).toHaveLength(5);

    // Each account balance should include account details
    for (const ab of result!.accountBalances) {
      expect(ab.accountName).toBeDefined();
      expect(ab.accountType).toBeDefined();
      expect(ab.balanceCurrent).toBeDefined();
      expect(typeof ab.isAsset).toBe("boolean");
    }
  });

  it("returns null for non-existent month", () => {
    const result = getSnapshotByMonth(db, "2099-12");
    expect(result).toBeNull();
  });
});

// ─── getAccountBalanceHistory ──────────────────────────────────────────

describe("getAccountBalanceHistory", () => {
  it("returns balance history for all accounts across snapshots", () => {
    const inst = seedInstitution();
    seedAccounts(inst.id);

    createSnapshot(db, "2026-01");

    // Change a balance and create another snapshot
    db.update(schema.accounts)
      .set({ balanceCurrent: 600000 })
      .where(sql`name = 'My Checking'`)
      .run();
    createSnapshot(db, "2026-02");

    const history = getAccountBalanceHistory(db);
    expect(history.length).toBeGreaterThan(0);

    // Find checking account history
    const checkingHistory = history.filter((h) => h.accountName === "My Checking");
    expect(checkingHistory).toHaveLength(2);
    expect(checkingHistory[0].balanceCurrent).toBe(500000);
    expect(checkingHistory[1].balanceCurrent).toBe(600000);
  });

  it("returns empty array when no snapshots exist", () => {
    const history = getAccountBalanceHistory(db);
    expect(history).toHaveLength(0);
  });
});
