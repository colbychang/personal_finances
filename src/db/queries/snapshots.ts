import { and, asc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "../schema";

type DB = AppDatabase;

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

export interface LiveNetWorth {
  assets: number;
  liabilities: number;
  netWorth: number;
}

export async function getLiveNetWorth(database: DB, workspaceId?: number): Promise<LiveNetWorth> {
  const accounts = await database
    .select({
      balanceCurrent: schema.accounts.balanceCurrent,
      isAsset: schema.accounts.isAsset,
    })
    .from(schema.accounts)
    .where(
      workspaceId === undefined ? undefined : eq(schema.accounts.workspaceId, workspaceId),
    );

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const account of accounts) {
    if (account.isAsset) {
      totalAssets += account.balanceCurrent;
    } else {
      totalLiabilities += account.balanceCurrent;
    }
  }

  return {
    assets: totalAssets,
    liabilities: totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}

export async function createSnapshot(
  database: DB,
  month: string,
  workspaceId?: number,
): Promise<SnapshotRow> {
  const accounts = await database
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
      type: schema.accounts.type,
      balanceCurrent: schema.accounts.balanceCurrent,
      isAsset: schema.accounts.isAsset,
    })
    .from(schema.accounts)
    .where(
      workspaceId === undefined ? undefined : eq(schema.accounts.workspaceId, workspaceId),
    );

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

  const [existing] = await database
    .select()
    .from(schema.snapshots)
    .where(
      and(
        eq(schema.snapshots.month, month),
        workspaceId === undefined ? undefined : eq(schema.snapshots.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (existing) {
    if (accounts.length > 0) {
      await database
        .delete(schema.accountSnapshots)
        .where(
          and(
            eq(schema.accountSnapshots.day, `${month}-01`),
            inArray(
              schema.accountSnapshots.accountId,
              accounts.map((account) => account.id),
            ),
          ),
        );
    }

    await database
      .delete(schema.snapshots)
      .where(eq(schema.snapshots.id, existing.id));
  }

  const [snapshot] = await database
    .insert(schema.snapshots)
    .values({
      workspaceId: workspaceId ?? null,
      month,
      assets: totalAssets,
      liabilities: totalLiabilities,
      netWorth,
    })
    .returning();

  const day = `${month}-01`;
  if (accounts.length > 0) {
    await database.insert(schema.accountSnapshots).values(
      accounts.map((account) => ({
        accountId: account.id,
        day,
        balanceCurrent: account.balanceCurrent,
        isAsset: account.isAsset,
      })),
    );
  }

  return snapshot;
}

export function getAllSnapshots(database: DB, workspaceId?: number): Promise<SnapshotRow[]> {
  return database
    .select()
    .from(schema.snapshots)
    .where(
      workspaceId === undefined ? undefined : eq(schema.snapshots.workspaceId, workspaceId),
    )
    .orderBy(asc(schema.snapshots.month));
}

export async function getSnapshotByMonth(
  database: DB,
  month: string,
  workspaceId?: number,
): Promise<SnapshotDetail | null> {
  const [snapshot] = await database
    .select()
    .from(schema.snapshots)
    .where(
      and(
        eq(schema.snapshots.month, month),
        workspaceId === undefined ? undefined : eq(schema.snapshots.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!snapshot) return null;

  const day = `${month}-01`;
  const accountBalances = await database
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
      eq(schema.accountSnapshots.accountId, schema.accounts.id),
    )
    .where(
      and(
        eq(schema.accountSnapshots.day, day),
        workspaceId === undefined ? undefined : eq(schema.accounts.workspaceId, workspaceId),
      ),
    );

  return { snapshot, accountBalances };
}

export function getAccountBalanceHistory(
  database: DB,
  workspaceId?: number,
): Promise<AccountBalanceHistoryRow[]> {
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
      eq(schema.accountSnapshots.accountId, schema.accounts.id),
    )
    .where(
      workspaceId === undefined ? undefined : eq(schema.accounts.workspaceId, workspaceId),
    )
    .orderBy(asc(schema.accountSnapshots.day));
}
