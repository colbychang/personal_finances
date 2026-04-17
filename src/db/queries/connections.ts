import { and, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "../schema";

type DB = AppDatabase;

export interface ConnectionWithAccounts {
  id: number;
  institutionName: string;
  provider: string;
  itemId: string | null;
  createdAt: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  accounts: {
    id: number;
    name: string;
    mask: string | null;
    type: string;
    subtype: string | null;
    balanceCurrent: number;
  }[];
}

export async function getAllConnections(
  database: DB,
  workspaceId?: number,
): Promise<ConnectionWithAccounts[]> {
  const conns = await database
    .select()
    .from(schema.connections)
    .where(
      workspaceId === undefined ? undefined : eq(schema.connections.workspaceId, workspaceId),
    );

  if (conns.length === 0) {
    return [];
  }

  const connectionIds = conns.map((conn) => conn.id);
  const links = await database
    .select({
      connectionId: schema.accountLinks.connectionId,
      accountId: schema.accountLinks.accountId,
    })
    .from(schema.accountLinks)
    .where(
      connectionIds.length === 1
        ? eq(schema.accountLinks.connectionId, connectionIds[0]!)
        : inArray(schema.accountLinks.connectionId, connectionIds),
    );

  const accountIds = Array.from(new Set(links.map((link) => link.accountId)));
  const accounts =
    accountIds.length === 0
      ? []
      : await database
          .select({
            id: schema.accounts.id,
            name: schema.accounts.name,
            mask: schema.accounts.mask,
            type: schema.accounts.type,
            subtype: schema.accounts.subtype,
            balanceCurrent: schema.accounts.balanceCurrent,
          })
          .from(schema.accounts)
          .where(
            and(
              workspaceId === undefined
                ? undefined
                : eq(schema.accounts.workspaceId, workspaceId),
              accountIds.length === 1
                ? eq(schema.accounts.id, accountIds[0]!)
                : inArray(schema.accounts.id, accountIds),
            ),
          );

  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const accountIdsByConnection = new Map<number, number[]>();

  for (const link of links) {
    if (!accountIdsByConnection.has(link.connectionId)) {
      accountIdsByConnection.set(link.connectionId, []);
    }
    accountIdsByConnection.get(link.connectionId)!.push(link.accountId);
  }

  return conns.map((conn) => {
    const linkedAccountIds = accountIdsByConnection.get(conn.id) ?? [];
    const linkedAccounts = linkedAccountIds
      .map((accountId) => accountsById.get(accountId))
      .filter((account): account is NonNullable<typeof account> => Boolean(account));

    return {
      id: conn.id,
      institutionName: conn.institutionName,
      provider: conn.provider,
      itemId: conn.itemId,
      createdAt: conn.createdAt,
      lastSyncAt: conn.lastSyncAt,
      lastSyncStatus: conn.lastSyncStatus,
      lastSyncError: conn.lastSyncError,
      accounts: linkedAccounts,
    };
  });
}

export async function getConnectionById(
  database: DB,
  id: number,
  workspaceId?: number,
): Promise<typeof schema.connections.$inferSelect | null> {
  const [connection] = await database
    .select()
    .from(schema.connections)
    .where(
      workspaceId === undefined
        ? eq(schema.connections.id, id)
        : and(eq(schema.connections.id, id), eq(schema.connections.workspaceId, workspaceId)),
    )
    .limit(1);

  return connection ?? null;
}

export interface CreateConnectionInput {
  institutionName: string;
  provider: string;
  accessToken: string;
  itemId: string;
  isEncrypted: boolean;
}

export async function createConnection(
  database: DB,
  input: CreateConnectionInput,
  workspaceId?: number,
): Promise<typeof schema.connections.$inferSelect> {
  const [connection] = await database
    .insert(schema.connections)
    .values({
      workspaceId: workspaceId ?? null,
      institutionName: input.institutionName,
      provider: input.provider,
      accessToken: input.accessToken,
      itemId: input.itemId,
      isEncrypted: input.isEncrypted,
    })
    .returning();

  return connection;
}

export async function deleteConnection(
  database: DB,
  id: number,
  workspaceId?: number,
): Promise<boolean> {
  const conn = await getConnectionById(database, id, workspaceId);
  if (!conn) return false;

  const links = await database
    .select({ accountId: schema.accountLinks.accountId })
    .from(schema.accountLinks)
    .where(eq(schema.accountLinks.connectionId, conn.id));

  const accountIds = links.map((link) => link.accountId);

  await database
    .delete(schema.accountLinks)
    .where(eq(schema.accountLinks.connectionId, conn.id));

  for (const accountId of accountIds) {
    const txns = await database
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(eq(schema.transactions.accountId, accountId));

    const txnIds = txns.map((txn) => txn.id);
    if (txnIds.length > 0) {
      await database
        .delete(schema.transactionSplits)
        .where(inArray(schema.transactionSplits.transactionId, txnIds));
    }

    await database
      .delete(schema.transactions)
      .where(eq(schema.transactions.accountId, accountId));

    await database
      .delete(schema.accountSnapshots)
      .where(eq(schema.accountSnapshots.accountId, accountId));

    await database.delete(schema.accounts).where(eq(schema.accounts.id, accountId));
  }

  await database.delete(schema.connections).where(eq(schema.connections.id, id));
  return true;
}

export async function findOrCreatePlaidInstitution(
  database: DB,
  name: string,
  plaidInstitutionId?: string,
  workspaceId?: number,
): Promise<number> {
  const [existingByPlaidId] = plaidInstitutionId
    ? await database
        .select()
        .from(schema.institutions)
        .where(
          and(
            eq(schema.institutions.plaidInstitutionId, plaidInstitutionId),
            workspaceId === undefined
              ? undefined
              : eq(schema.institutions.workspaceId, workspaceId),
          ),
        )
        .limit(1)
    : [];

  const existing =
    existingByPlaidId ??
    (
      await database
        .select()
        .from(schema.institutions)
        .where(
          and(
            eq(schema.institutions.name, name),
            workspaceId === undefined
              ? undefined
              : eq(schema.institutions.workspaceId, workspaceId),
          ),
        )
        .limit(1)
    )[0];

  if (existing) {
    if (
      existing.name !== name ||
      existing.plaidInstitutionId !== (plaidInstitutionId ?? existing.plaidInstitutionId)
    ) {
      await database
        .update(schema.institutions)
        .set({
          name,
          plaidInstitutionId: plaidInstitutionId ?? existing.plaidInstitutionId,
        })
        .where(eq(schema.institutions.id, existing.id));
    }
    return existing.id;
  }

  const [institution] = await database
    .insert(schema.institutions)
    .values({
      workspaceId: workspaceId ?? null,
      name,
      provider: "plaid",
      status: "active",
      plaidInstitutionId: plaidInstitutionId ?? null,
    })
    .returning();

  return institution.id;
}

export interface CreatePlaidAccountInput {
  institutionId: number;
  externalRef: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  balanceCurrent: number;
  balanceAvailable: number | null;
  isAsset: boolean;
}

export async function createPlaidAccount(
  database: DB,
  input: CreatePlaidAccountInput,
  connectionId: number,
  institutionName: string,
  workspaceId?: number,
): Promise<typeof schema.accounts.$inferSelect> {
  const [existing] = await database
    .select()
    .from(schema.accounts)
    .where(
      workspaceId === undefined
        ? eq(schema.accounts.externalRef, input.externalRef)
        : and(
            eq(schema.accounts.externalRef, input.externalRef),
            eq(schema.accounts.workspaceId, workspaceId),
          ),
    )
    .limit(1);

  let account = existing;

  if (existing) {
    await database
      .update(schema.accounts)
      .set({
        workspaceId: workspaceId ?? existing.workspaceId,
        institutionId: input.institutionId,
        name: input.name,
        mask: input.mask,
        type: input.type,
        subtype: input.subtype,
        balanceCurrent: input.balanceCurrent,
        balanceAvailable: input.balanceAvailable,
        isAsset: input.isAsset,
      })
      .where(eq(schema.accounts.id, existing.id));

    [account] = await database
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, existing.id))
      .limit(1);
  } else {
    [account] = await database
      .insert(schema.accounts)
      .values({
        workspaceId: workspaceId ?? null,
        institutionId: input.institutionId,
        externalRef: input.externalRef,
        name: input.name,
        mask: input.mask,
        type: input.type,
        subtype: input.subtype,
        balanceCurrent: input.balanceCurrent,
        balanceAvailable: input.balanceAvailable,
        isAsset: input.isAsset,
        currency: "USD",
        source: "plaid",
      })
      .returning();
  }

  const [existingLink] = await database
    .select({ id: schema.accountLinks.id })
    .from(schema.accountLinks)
    .where(
      workspaceId === undefined
        ? eq(schema.accountLinks.externalKey, input.externalRef)
        : and(
            eq(schema.accountLinks.externalKey, input.externalRef),
            eq(schema.accountLinks.workspaceId, workspaceId),
          ),
    )
    .limit(1);

  const linkValues = {
    provider: "plaid" as const,
    workspaceId: workspaceId ?? null,
    externalKey: input.externalRef,
    connectionId,
    accountId: account.id,
    institutionName,
    displayName: input.name,
    updatedAt: new Date().toISOString(),
  };

  if (existingLink) {
    await database
      .update(schema.accountLinks)
      .set(linkValues)
      .where(eq(schema.accountLinks.id, existingLink.id));
  } else {
    await database.insert(schema.accountLinks).values(linkValues);
  }

  return account;
}
