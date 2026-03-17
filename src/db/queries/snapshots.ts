import { eq, asc } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";

type DB = ReturnType<typeof drizzle>;

// ─── Types ──────────────────────────────────────────────────────────────

export interface SnapshotRow {
  id: number;
  month: string;
  assets: number;
  liabilities: number;
  netWorth: number;
}

export interface AccountBalance {
  accountId: number;
  accountName: string;
  accountType: string;
  balanceCurrent: number;
  isAsset: boolean;
  day: string;
}

export interface SnapshotDetail {
  snapshot: SnapshotRow;
  accountBalances: AccountBalance[];
}

export interface AccountBalanceHistoryRow {
  accountId: number;
  accountName: string;
  accountType: string;
  isAsset: boolean;
  balanceCurrent: number;
  day: string;
}

// ─── createSnapshot ─────────────────────────────────────────────────────

/**
 * Create a snapshot for a given month (YYYY-MM).
 * Captures all current account balances, calculates total assets, liabilities, and net worth.
 * If a snapshot for the given month already exists, it is replaced.
 */
export function createSnapshot(database: DB, month: string): SnapshotRow {
  // Get all accounts
  const accounts = database
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
      type: schema.accounts.type,
      balanceCurrent: schema.accounts.balanceCurrent,
      isAsset: schema.accounts.isAsset,
    })
    .from(schema.accounts)
    .all();

  // Calculate totals
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const account of accounts) {
    if (account.isAsset) {
      totalAssets += account.balanceCurrent;
    } else {
      totalLiabilities += account.balanceCurrent;
    }
  }

  const netWorth = totalAssets - totalLiabilities;

  // Delete existing snapshot and account snapshots for this month
  const existing = database
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.month, month))
    .get();

  if (existing) {
    // Delete account snapshots that match the day prefix
    database
      .delete(schema.accountSnapshots)
      .where(eq(schema.accountSnapshots.day, `${month}-01`))
      .run();

    database
      .delete(schema.snapshots)
      .where(eq(schema.snapshots.month, month))
      .run();
  }

  // Insert new snapshot
  const snapshot = database
    .insert(schema.snapshots)
    .values({
      month,
      assets: totalAssets,
      liabilities: totalLiabilities,
      netWorth,
    })
    .returning()
    .get();

  // Insert per-account snapshots
  const day = `${month}-01`;
  for (const account of accounts) {
    database
      .insert(schema.accountSnapshots)
      .values({
        accountId: account.id,
        day,
        balanceCurrent: account.balanceCurrent,
        isAsset: account.isAsset,
      })
      .run();
  }

  return snapshot;
}

// ─── getAllSnapshots ────────────────────────────────────────────────────

/**
 * Get all snapshots sorted by month ascending.
 */
export function getAllSnapshots(database: DB): SnapshotRow[] {
  return database
    .select()
    .from(schema.snapshots)
    .orderBy(asc(schema.snapshots.month))
    .all();
}

// ─── getSnapshotByMonth ────────────────────────────────────────────────

/**
 * Get a specific snapshot by month with per-account balances.
 * Returns null if no snapshot exists for the given month.
 */
export function getSnapshotByMonth(
  database: DB,
  month: string
): SnapshotDetail | null {
  const snapshot = database
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.month, month))
    .get();

  if (!snapshot) return null;

  const day = `${month}-01`;

  const accountBalances = database
    .select({
      accountId: schema.accountSnapshots.accountId,
      accountName: schema.accounts.name,
      accountType: schema.accounts.type,
      balanceCurrent: schema.accountSnapshots.balanceCurrent,
      isAsset: schema.accountSnapshots.isAsset,
      day: schema.accountSnapshots.day,
    })
    .from(schema.accountSnapshots)
    .innerJoin(
      schema.accounts,
      eq(schema.accountSnapshots.accountId, schema.accounts.id)
    )
    .where(eq(schema.accountSnapshots.day, day))
    .all();

  return { snapshot, accountBalances };
}

// ─── getAccountBalanceHistory ──────────────────────────────────────────

/**
 * Get balance history for all accounts across all snapshots.
 * Returns rows sorted by day ascending.
 */
export function getAccountBalanceHistory(
  database: DB
): AccountBalanceHistoryRow[] {
  return database
    .select({
      accountId: schema.accountSnapshots.accountId,
      accountName: schema.accounts.name,
      accountType: schema.accounts.type,
      isAsset: schema.accountSnapshots.isAsset,
      balanceCurrent: schema.accountSnapshots.balanceCurrent,
      day: schema.accountSnapshots.day,
    })
    .from(schema.accountSnapshots)
    .innerJoin(
      schema.accounts,
      eq(schema.accountSnapshots.accountId, schema.accounts.id)
    )
    .orderBy(asc(schema.accountSnapshots.day))
    .all();
}
