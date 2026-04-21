import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "@/db/schema";
import {
  createConnection,
  createPlaidAccount,
  deleteConnection,
  findOrCreatePlaidInstitution,
  getAllConnections,
  getConnectionById,
  getConnectionByItemId,
} from "@/db/queries/connections";
import {
  closeTestDb,
  createTestDb,
  resetTestDb,
  seedWorkspace,
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

describe("connection lifecycle", () => {
  it("creates and fetches a connection", async () => {
    const created = await createConnection(db, {
      institutionName: "Test Bank",
      provider: "plaid",
      accessToken: "encrypted-access-token",
      itemId: "item-id-123",
      isEncrypted: true,
    });

    expect(created.id).toBeGreaterThan(0);
    expect(created.institutionName).toBe("Test Bank");

    const found = await getConnectionById(db, created.id);
    expect(found?.itemId).toBe("item-id-123");
  });

  it("returns null/false when a connection does not exist", async () => {
    await expect(getConnectionById(db, 99_999)).resolves.toBeNull();
    await expect(deleteConnection(db, 99_999)).resolves.toBe(false);
  });

  it("fetches a connection by Plaid item id", async () => {
    const created = await createConnection(db, {
      institutionName: "Webhook Bank",
      provider: "plaid",
      accessToken: "webhook-token",
      itemId: "item-webhook-123",
      isEncrypted: false,
    });

    const found = await getConnectionByItemId(db, "item-webhook-123");

    expect(found?.id).toBe(created.id);
    expect(found?.institutionName).toBe("Webhook Bank");
  });

  it("returns null when no connection matches a Plaid item id", async () => {
    await expect(getConnectionByItemId(db, "missing-item")).resolves.toBeNull();
  });
});

describe("getAllConnections", () => {
  it("returns connections with only their linked accounts", async () => {
    const firstConnection = await createConnection(db, {
      institutionName: "Shared Bank",
      provider: "plaid",
      accessToken: "enc-1",
      itemId: "item-1",
      isEncrypted: true,
    });
    const secondConnection = await createConnection(db, {
      institutionName: "Shared Bank",
      provider: "plaid",
      accessToken: "enc-2",
      itemId: "item-2",
      isEncrypted: true,
    });

    const institutionId = await findOrCreatePlaidInstitution(db, "Shared Bank", "ins_shared");

    await createPlaidAccount(
      db,
      {
        institutionId,
        externalRef: "shared-acct-1",
        name: "Checking 1",
        mask: "1111",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 100_000,
        balanceAvailable: 100_000,
        isAsset: true,
      },
      firstConnection.id,
      "Shared Bank",
    );

    await createPlaidAccount(
      db,
      {
        institutionId,
        externalRef: "shared-acct-2",
        name: "Checking 2",
        mask: "2222",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 200_000,
        balanceAvailable: 200_000,
        isAsset: true,
      },
      secondConnection.id,
      "Shared Bank",
    );

    const connections = await getAllConnections(db);
    expect(connections).toHaveLength(2);
    expect(connections.find((conn) => conn.id === firstConnection.id)?.accounts.map((a) => a.name)).toEqual([
      "Checking 1",
    ]);
    expect(connections.find((conn) => conn.id === secondConnection.id)?.accounts.map((a) => a.name)).toEqual([
      "Checking 2",
    ]);
  });

  it("filters connections by workspace", async () => {
    const alpha = await seedWorkspace(db, { name: "Alpha", slug: "alpha-connections" });
    const beta = await seedWorkspace(db, { name: "Beta", slug: "beta-connections" });

    const alphaConnection = await createConnection(
      db,
      {
        institutionName: "Alpha Bank",
        provider: "plaid",
        accessToken: "alpha-token",
        itemId: "alpha-item",
        isEncrypted: true,
      },
      alpha.id,
    );
    await createConnection(
      db,
      {
        institutionName: "Beta Bank",
        provider: "plaid",
        accessToken: "beta-token",
        itemId: "beta-item",
        isEncrypted: true,
      },
      beta.id,
    );

    const scoped = await getAllConnections(db, alpha.id);
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.id).toBe(alphaConnection.id);
  });
});

describe("findOrCreatePlaidInstitution", () => {
  it("creates and reuses Plaid institutions", async () => {
    const firstId = await findOrCreatePlaidInstitution(db, "New Bank", "ins_123");
    const secondId = await findOrCreatePlaidInstitution(db, "New Bank", "ins_123");

    expect(firstId).toBe(secondId);

    const [institution] = await db
      .select()
      .from(schema.institutions)
      .where(eq(schema.institutions.id, firstId))
      .limit(1);

    expect(institution?.provider).toBe("plaid");
    expect(institution?.plaidInstitutionId).toBe("ins_123");
  });

  it("scopes institution reuse by workspace", async () => {
    const alpha = await seedWorkspace(db, { name: "Alpha", slug: "alpha-inst" });
    const beta = await seedWorkspace(db, { name: "Beta", slug: "beta-inst" });

    const alphaId = await findOrCreatePlaidInstitution(db, "Shared Bank", "ins_shared", alpha.id);
    const betaId = await findOrCreatePlaidInstitution(db, "Shared Bank", "ins_shared", beta.id);

    expect(alphaId).not.toBe(betaId);
  });
});

describe("createPlaidAccount", () => {
  it("creates a new Plaid account and link record", async () => {
    const connection = await createConnection(db, {
      institutionName: "Test Bank",
      provider: "plaid",
      accessToken: "enc-test",
      itemId: "item-test",
      isEncrypted: true,
    });
    const institutionId = await findOrCreatePlaidInstitution(db, "Test Bank");

    const account = await createPlaidAccount(
      db,
      {
        institutionId,
        externalRef: "plaid-acct-new",
        name: "Savings",
        mask: "5678",
        type: "savings",
        subtype: "savings",
        balanceCurrent: 250_000,
        balanceAvailable: 250_000,
        isAsset: true,
      },
      connection.id,
      "Test Bank",
    );

    expect(account.source).toBe("plaid");
    expect(account.externalRef).toBe("plaid-acct-new");

    const links = await db.select().from(schema.accountLinks);
    expect(links).toHaveLength(1);
    expect(links[0]?.accountId).toBe(account.id);
    expect(links[0]?.connectionId).toBe(connection.id);
  });

  it("updates an existing account when the external ref already exists", async () => {
    const connection = await createConnection(db, {
      institutionName: "Test Bank",
      provider: "plaid",
      accessToken: "enc-test",
      itemId: "item-test",
      isEncrypted: true,
    });
    const institutionId = await findOrCreatePlaidInstitution(db, "Test Bank");

    const first = await createPlaidAccount(
      db,
      {
        institutionId,
        externalRef: "plaid-dup",
        name: "Checking",
        mask: "0000",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 100_000,
        balanceAvailable: 100_000,
        isAsset: true,
      },
      connection.id,
      "Test Bank",
    );

    const second = await createPlaidAccount(
      db,
      {
        institutionId,
        externalRef: "plaid-dup",
        name: "Checking",
        mask: "0000",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 200_000,
        balanceAvailable: 150_000,
        isAsset: true,
      },
      connection.id,
      "Test Bank",
    );

    expect(second.id).toBe(first.id);
    expect(second.balanceCurrent).toBe(200_000);
    expect(second.balanceAvailable).toBe(150_000);
  });
});

describe("deleteConnection", () => {
  it("deletes only the selected connection and its linked data", async () => {
    const firstConnection = await createConnection(db, {
      institutionName: "Shared Delete Bank",
      provider: "plaid",
      accessToken: "enc-1",
      itemId: "item-1",
      isEncrypted: true,
    });
    const secondConnection = await createConnection(db, {
      institutionName: "Shared Delete Bank",
      provider: "plaid",
      accessToken: "enc-2",
      itemId: "item-2",
      isEncrypted: true,
    });

    const institutionId = await findOrCreatePlaidInstitution(db, "Shared Delete Bank");

    await createPlaidAccount(
      db,
      {
        institutionId,
        externalRef: "delete-shared-1",
        name: "Account 1",
        mask: "1111",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 10_000,
        balanceAvailable: 10_000,
        isAsset: true,
      },
      firstConnection.id,
      "Shared Delete Bank",
    );

    const secondAccount = await createPlaidAccount(
      db,
      {
        institutionId,
        externalRef: "delete-shared-2",
        name: "Account 2",
        mask: "2222",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 20_000,
        balanceAvailable: 20_000,
        isAsset: true,
      },
      secondConnection.id,
      "Shared Delete Bank",
    );

    await db.insert(schema.transactions).values({
      accountId: secondAccount.id,
      postedAt: "2026-04-01",
      name: "Still here",
      amount: 1_000,
      category: "Groceries",
      pending: false,
      isTransfer: false,
      isExcluded: false,
      reviewState: "none",
    });

    await expect(deleteConnection(db, firstConnection.id)).resolves.toBe(true);

    const remainingAccounts = await db.select().from(schema.accounts);
    const remainingConnections = await getAllConnections(db);
    const remainingTransactions = await db.select().from(schema.transactions);

    expect(remainingAccounts).toHaveLength(1);
    expect(remainingAccounts[0]?.id).toBe(secondAccount.id);
    expect(remainingConnections).toHaveLength(1);
    expect(remainingConnections[0]?.id).toBe(secondConnection.id);
    expect(remainingTransactions).toHaveLength(1);
  });
});
