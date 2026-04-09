import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  getAllConnections,
  getConnectionById,
  createConnection,
  deleteConnection,
  findOrCreatePlaidInstitution,
  createPlaidAccount,
} from "@/db/queries/connections";

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
  db.run(sql`DELETE FROM transaction_splits`);
  db.run(sql`DELETE FROM account_snapshots`);
  db.run(sql`DELETE FROM account_links`);
  db.run(sql`DELETE FROM transactions`);
  db.run(sql`DELETE FROM accounts`);
  db.run(sql`DELETE FROM connections`);
  db.run(sql`DELETE FROM institutions`);
});

describe("connections queries", () => {
  describe("createConnection", () => {
    it("creates a new connection record", () => {
      const conn = createConnection(db, {
        institutionName: "Test Bank",
        provider: "plaid",
        accessToken: "encrypted-access-token",
        itemId: "item-id-123",
        isEncrypted: true,
      });

      expect(conn.id).toBeDefined();
      expect(conn.institutionName).toBe("Test Bank");
      expect(conn.provider).toBe("plaid");
      expect(conn.accessToken).toBe("encrypted-access-token");
      expect(conn.itemId).toBe("item-id-123");
      expect(conn.isEncrypted).toBe(true);
      expect(conn.createdAt).toBeDefined();
    });
  });

  describe("getConnectionById", () => {
    it("returns a connection by ID", () => {
      const created = createConnection(db, {
        institutionName: "First Platypus Bank",
        provider: "plaid",
        accessToken: "enc-token",
        itemId: "item-456",
        isEncrypted: true,
      });

      const found = getConnectionById(db, created.id);
      expect(found).not.toBeNull();
      expect(found!.institutionName).toBe("First Platypus Bank");
    });

    it("returns null for non-existent ID", () => {
      const found = getConnectionById(db, 99999);
      expect(found).toBeNull();
    });
  });

  describe("getAllConnections", () => {
    it("returns empty array when no connections", () => {
      const conns = getAllConnections(db);
      expect(conns).toEqual([]);
    });

    it("returns connections with linked accounts", () => {
      // Create a connection
      const connection = createConnection(db, {
        institutionName: "Test Bank",
        provider: "plaid",
        accessToken: "enc-token",
        itemId: "item-001",
        isEncrypted: true,
      });

      // Create institution and account
      const instId = findOrCreatePlaidInstitution(db, "Test Bank", "ins_1");
      createPlaidAccount(
        db,
        {
          institutionId: instId,
          externalRef: "plaid-acct-001",
          name: "Plaid Checking",
          mask: "0000",
          type: "checking",
          subtype: "checking",
          balanceCurrent: 100000,
          balanceAvailable: 100000,
          isAsset: true,
        },
        connection.id,
        "Test Bank"
      );

      const conns = getAllConnections(db);
      expect(conns).toHaveLength(1);
      expect(conns[0]!.institutionName).toBe("Test Bank");
      expect(conns[0]!.accounts).toHaveLength(1);
      expect(conns[0]!.accounts[0]!.name).toBe("Plaid Checking");
      expect(conns[0]!.accounts[0]!.mask).toBe("0000");
    });

    it("supports multiple connections", () => {
      createConnection(db, {
        institutionName: "Bank A",
        provider: "plaid",
        accessToken: "enc-a",
        itemId: "item-a",
        isEncrypted: true,
      });
      createConnection(db, {
        institutionName: "Bank B",
        provider: "plaid",
        accessToken: "enc-b",
        itemId: "item-b",
        isEncrypted: true,
      });

      const conns = getAllConnections(db);
      expect(conns).toHaveLength(2);
    });

    it("keeps same-bank connections isolated", () => {
      const firstConnection = createConnection(db, {
        institutionName: "Shared Bank",
        provider: "plaid",
        accessToken: "enc-1",
        itemId: "item-1",
        isEncrypted: true,
      });
      const secondConnection = createConnection(db, {
        institutionName: "Shared Bank",
        provider: "plaid",
        accessToken: "enc-2",
        itemId: "item-2",
        isEncrypted: true,
      });

      const instId = findOrCreatePlaidInstitution(db, "Shared Bank", "ins_shared");

      createPlaidAccount(
        db,
        {
          institutionId: instId,
          externalRef: "shared-acct-1",
          name: "Checking 1",
          mask: "1111",
          type: "checking",
          subtype: "checking",
          balanceCurrent: 100000,
          balanceAvailable: 100000,
          isAsset: true,
        },
        firstConnection.id,
        "Shared Bank"
      );
      createPlaidAccount(
        db,
        {
          institutionId: instId,
          externalRef: "shared-acct-2",
          name: "Checking 2",
          mask: "2222",
          type: "checking",
          subtype: "checking",
          balanceCurrent: 200000,
          balanceAvailable: 200000,
          isAsset: true,
        },
        secondConnection.id,
        "Shared Bank"
      );

      const conns = getAllConnections(db);
      expect(conns).toHaveLength(2);
      expect(conns.find((conn) => conn.id === firstConnection.id)?.accounts).toHaveLength(1);
      expect(conns.find((conn) => conn.id === firstConnection.id)?.accounts[0]?.name).toBe(
        "Checking 1"
      );
      expect(conns.find((conn) => conn.id === secondConnection.id)?.accounts).toHaveLength(1);
      expect(conns.find((conn) => conn.id === secondConnection.id)?.accounts[0]?.name).toBe(
        "Checking 2"
      );
    });
  });

  describe("deleteConnection", () => {
    it("deletes a connection and its associated data", () => {
      const conn = createConnection(db, {
        institutionName: "Delete Bank",
        provider: "plaid",
        accessToken: "enc-token",
        itemId: "item-del",
        isEncrypted: true,
      });

      // Create associated account
      const instId = findOrCreatePlaidInstitution(db, "Delete Bank");
      createPlaidAccount(
        db,
        {
          institutionId: instId,
          externalRef: "plaid-acct-del",
          name: "Checking",
          mask: "1234",
          type: "checking",
          subtype: "checking",
          balanceCurrent: 50000,
          balanceAvailable: 50000,
          isAsset: true,
        },
        conn.id,
        "Delete Bank"
      );

      const result = deleteConnection(db, conn.id);
      expect(result).toBe(true);

      // Connection should be gone
      expect(getConnectionById(db, conn.id)).toBeNull();

      // Accounts should be gone
      const accounts = db.select().from(schema.accounts).all();
      expect(accounts).toHaveLength(0);

      // Account links should be gone
      const links = db.select().from(schema.accountLinks).all();
      expect(links).toHaveLength(0);
    });

    it("returns false for non-existent connection", () => {
      const result = deleteConnection(db, 99999);
      expect(result).toBe(false);
    });

    it("only deletes accounts linked to the requested connection", () => {
      const firstConnection = createConnection(db, {
        institutionName: "Shared Delete Bank",
        provider: "plaid",
        accessToken: "enc-1",
        itemId: "item-1",
        isEncrypted: true,
      });
      const secondConnection = createConnection(db, {
        institutionName: "Shared Delete Bank",
        provider: "plaid",
        accessToken: "enc-2",
        itemId: "item-2",
        isEncrypted: true,
      });

      const instId = findOrCreatePlaidInstitution(db, "Shared Delete Bank");

      createPlaidAccount(
        db,
        {
          institutionId: instId,
          externalRef: "delete-shared-1",
          name: "Account 1",
          mask: "1111",
          type: "checking",
          subtype: "checking",
          balanceCurrent: 10000,
          balanceAvailable: 10000,
          isAsset: true,
        },
        firstConnection.id,
        "Shared Delete Bank"
      );
      const secondAccount = createPlaidAccount(
        db,
        {
          institutionId: instId,
          externalRef: "delete-shared-2",
          name: "Account 2",
          mask: "2222",
          type: "checking",
          subtype: "checking",
          balanceCurrent: 20000,
          balanceAvailable: 20000,
          isAsset: true,
        },
        secondConnection.id,
        "Shared Delete Bank"
      );

      expect(deleteConnection(db, firstConnection.id)).toBe(true);

      const remainingAccounts = db.select().from(schema.accounts).all();
      expect(remainingAccounts).toHaveLength(1);
      expect(remainingAccounts[0]?.id).toBe(secondAccount.id);

      const remainingLinks = db.select().from(schema.accountLinks).all();
      expect(remainingLinks).toHaveLength(1);
      expect(remainingLinks[0]?.accountId).toBe(secondAccount.id);

      expect(getConnectionById(db, secondConnection.id)).not.toBeNull();
    });
  });

  describe("findOrCreatePlaidInstitution", () => {
    it("creates a new institution", () => {
      const id = findOrCreatePlaidInstitution(db, "New Bank", "ins_123");
      expect(id).toBeGreaterThan(0);

      const inst = db
        .select()
        .from(schema.institutions)
        .all()
        .find((i) => i.id === id);
      expect(inst!.name).toBe("New Bank");
      expect(inst!.provider).toBe("plaid");
      expect(inst!.plaidInstitutionId).toBe("ins_123");
    });

    it("reuses existing institution", () => {
      const id1 = findOrCreatePlaidInstitution(db, "Same Bank");
      const id2 = findOrCreatePlaidInstitution(db, "Same Bank");
      expect(id1).toBe(id2);
    });
  });

  describe("createPlaidAccount", () => {
    it("creates a new Plaid account with link", () => {
      const connection = createConnection(db, {
        institutionName: "Test Bank",
        provider: "plaid",
        accessToken: "enc-test",
        itemId: "item-test",
        isEncrypted: true,
      });
      const instId = findOrCreatePlaidInstitution(db, "Test Bank");
      const account = createPlaidAccount(
        db,
        {
          institutionId: instId,
          externalRef: "plaid-acct-new",
          name: "Savings",
          mask: "5678",
          type: "savings",
          subtype: "savings",
          balanceCurrent: 250000,
          balanceAvailable: 250000,
          isAsset: true,
        },
        connection.id,
        "Test Bank"
      );

      expect(account.id).toBeDefined();
      expect(account.name).toBe("Savings");
      expect(account.source).toBe("plaid");
      expect(account.externalRef).toBe("plaid-acct-new");

      // Check account link was created
      const links = db.select().from(schema.accountLinks).all();
      expect(links).toHaveLength(1);
      expect(links[0]!.externalKey).toBe("plaid-acct-new");
      expect(links[0]!.accountId).toBe(account.id);
      expect(links[0]!.connectionId).toBe(connection.id);
    });

    it("updates balance for existing account (same externalRef)", () => {
      const connection = createConnection(db, {
        institutionName: "Test Bank",
        provider: "plaid",
        accessToken: "enc-test",
        itemId: "item-test",
        isEncrypted: true,
      });
      const instId = findOrCreatePlaidInstitution(db, "Test Bank");
      const acct1 = createPlaidAccount(
        db,
        {
          institutionId: instId,
          externalRef: "plaid-dup",
          name: "Checking",
          mask: "0000",
          type: "checking",
          subtype: "checking",
          balanceCurrent: 100000,
          balanceAvailable: 100000,
          isAsset: true,
        },
        connection.id,
        "Test Bank"
      );

      // Create again with updated balance
      const acct2 = createPlaidAccount(
        db,
        {
          institutionId: instId,
          externalRef: "plaid-dup",
          name: "Checking",
          mask: "0000",
          type: "checking",
          subtype: "checking",
          balanceCurrent: 200000,
          balanceAvailable: 200000,
          isAsset: true,
        },
        connection.id,
        "Test Bank"
      );

      expect(acct2.id).toBe(acct1.id);
      expect(acct2.balanceCurrent).toBe(200000);
    });
  });
});
