import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  createConnection,
  findOrCreatePlaidInstitution,
  createPlaidAccount,
} from "@/db/queries/connections";
import {
  syncTransactionsFromPlaid,
  updateConnectionSyncStatus,
  updateAccountBalances,
} from "@/db/queries/sync";

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

/**
 * Helper: create a connection with an account for testing sync.
 */
function setupConnectionWithAccount() {
  const conn = createConnection(db, {
    institutionName: "Test Bank",
    provider: "plaid",
    accessToken: "encrypted-access-token",
    itemId: "item-001",
    isEncrypted: true,
  });

  const instId = findOrCreatePlaidInstitution(db, "Test Bank", "ins_1");
  const account = createPlaidAccount(
    db,
    {
      institutionId: instId,
      externalRef: "plaid-acct-001",
      name: "Plaid Checking",
      mask: "0000",
      type: "checking",
      subtype: "checking",
      balanceCurrent: 100000,
      balanceAvailable: 95000,
      isAsset: true,
    },
    "Test Bank"
  );

  return { conn, account, instId };
}

describe("syncTransactionsFromPlaid", () => {
  it("stores added transactions with correct sign (Plaid positive = expense)", () => {
    const { conn } = setupConnectionWithAccount();

    const addedPlaidTransactions = [
      {
        transaction_id: "txn-001",
        account_id: "plaid-acct-001",
        amount: 25.5, // Plaid positive = money out = expense
        date: "2026-03-15",
        name: "Coffee Shop",
        merchant_name: "Starbucks",
        pending: false,
      },
      {
        transaction_id: "txn-002",
        account_id: "plaid-acct-001",
        amount: -100.0, // Plaid negative = money in = income/credit
        date: "2026-03-14",
        name: "Payroll",
        merchant_name: null,
        pending: false,
      },
    ];

    const result = syncTransactionsFromPlaid(db, conn.id, {
      added: addedPlaidTransactions,
      modified: [],
      removed: [],
    });

    expect(result.added).toBe(2);
    expect(result.modified).toBe(0);
    expect(result.removed).toBe(0);

    // Check stored transactions
    const txns = db.select().from(schema.transactions).all();
    expect(txns).toHaveLength(2);

    // Plaid positive (25.50) should be stored as positive (expense in cents)
    const coffeeTxn = txns.find((t) => t.externalId === "txn-001")!;
    expect(coffeeTxn.amount).toBe(2550); // positive cents = expense
    expect(coffeeTxn.name).toBe("Coffee Shop");
    expect(coffeeTxn.merchant).toBe("Starbucks");
    expect(coffeeTxn.postedAt).toBe("2026-03-15");
    expect(coffeeTxn.pending).toBe(false);

    // Plaid negative (-100.00) should be stored as negative (income in cents)
    const payrollTxn = txns.find((t) => t.externalId === "txn-002")!;
    expect(payrollTxn.amount).toBe(-10000); // negative cents = income
    expect(payrollTxn.name).toBe("Payroll");
  });

  it("maps transactions to correct account via external ref", () => {
    const { conn } = setupConnectionWithAccount(); // account auto-created by helper

    // Create a second account for the same connection
    const instId = findOrCreatePlaidInstitution(db, "Test Bank");
    createPlaidAccount(
      db,
      {
        institutionId: instId,
        externalRef: "plaid-acct-002",
        name: "Plaid Savings",
        mask: "1111",
        type: "savings",
        subtype: "savings",
        balanceCurrent: 500000,
        balanceAvailable: 500000,
        isAsset: true,
      },
      "Test Bank"
    );

    syncTransactionsFromPlaid(db, conn.id, {
      added: [
        {
          transaction_id: "txn-a",
          account_id: "plaid-acct-001",
          amount: 10,
          date: "2026-03-10",
          name: "Purchase A",
          merchant_name: null,
          pending: false,
        },
        {
          transaction_id: "txn-b",
          account_id: "plaid-acct-002",
          amount: 20,
          date: "2026-03-11",
          name: "Purchase B",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    const txns = db.select().from(schema.transactions).all();
    expect(txns).toHaveLength(2);

    const txnA = txns.find((t) => t.externalId === "txn-a")!;
    const txnB = txns.find((t) => t.externalId === "txn-b")!;

    // txn-a should belong to checking (plaid-acct-001)
    // txn-b should belong to savings (plaid-acct-002)
    expect(txnA.accountId).not.toBe(txnB.accountId);
  });

  it("handles modified transactions by updating existing records", () => {
    const { conn } = setupConnectionWithAccount();

    // First sync — add a transaction
    syncTransactionsFromPlaid(db, conn.id, {
      added: [
        {
          transaction_id: "txn-mod",
          account_id: "plaid-acct-001",
          amount: 50.0,
          date: "2026-03-12",
          name: "Original Name",
          merchant_name: "Original Merchant",
          pending: true,
        },
      ],
      modified: [],
      removed: [],
    });

    let txns = db.select().from(schema.transactions).all();
    expect(txns).toHaveLength(1);
    expect(txns[0]!.name).toBe("Original Name");
    expect(txns[0]!.pending).toBe(true);

    // Second sync — modify the transaction
    const result = syncTransactionsFromPlaid(db, conn.id, {
      added: [],
      modified: [
        {
          transaction_id: "txn-mod",
          account_id: "plaid-acct-001",
          amount: 55.0,
          date: "2026-03-12",
          name: "Updated Name",
          merchant_name: "Updated Merchant",
          pending: false,
        },
      ],
      removed: [],
    });

    expect(result.modified).toBe(1);

    txns = db.select().from(schema.transactions).all();
    expect(txns).toHaveLength(1); // No duplicates
    expect(txns[0]!.name).toBe("Updated Name");
    expect(txns[0]!.merchant).toBe("Updated Merchant");
    expect(txns[0]!.amount).toBe(5500);
    expect(txns[0]!.pending).toBe(false);
  });

  it("handles removed transactions by deleting them", () => {
    const { conn } = setupConnectionWithAccount();

    // First sync — add transactions
    syncTransactionsFromPlaid(db, conn.id, {
      added: [
        {
          transaction_id: "txn-keep",
          account_id: "plaid-acct-001",
          amount: 10,
          date: "2026-03-10",
          name: "Keep",
          merchant_name: null,
          pending: false,
        },
        {
          transaction_id: "txn-remove",
          account_id: "plaid-acct-001",
          amount: 20,
          date: "2026-03-11",
          name: "Remove",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    expect(db.select().from(schema.transactions).all()).toHaveLength(2);

    // Second sync — remove one
    const result = syncTransactionsFromPlaid(db, conn.id, {
      added: [],
      modified: [],
      removed: [{ transaction_id: "txn-remove" }],
    });

    expect(result.removed).toBe(1);
    const remaining = db.select().from(schema.transactions).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.externalId).toBe("txn-keep");
  });

  it("does not create duplicates when same external_id is added twice", () => {
    const { conn } = setupConnectionWithAccount();

    const txn = {
      transaction_id: "txn-dup",
      account_id: "plaid-acct-001",
      amount: 30,
      date: "2026-03-13",
      name: "Duplicate Test",
      merchant_name: null,
      pending: false,
    };

    // First sync
    syncTransactionsFromPlaid(db, conn.id, {
      added: [txn],
      modified: [],
      removed: [],
    });

    // Second sync with same transaction (shouldn't happen normally, but safeguard)
    syncTransactionsFromPlaid(db, conn.id, {
      added: [txn],
      modified: [],
      removed: [],
    });

    const txns = db.select().from(schema.transactions).all();
    expect(txns).toHaveLength(1); // No duplicates
  });

  it("skips transactions with unknown account_id gracefully", () => {
    const { conn } = setupConnectionWithAccount();

    const result = syncTransactionsFromPlaid(db, conn.id, {
      added: [
        {
          transaction_id: "txn-unknown",
          account_id: "nonexistent-acct",
          amount: 10,
          date: "2026-03-10",
          name: "Unknown Account",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    // Should skip the unknown account transaction
    expect(result.added).toBe(0);
    expect(db.select().from(schema.transactions).all()).toHaveLength(0);
  });
});

describe("updateConnectionSyncStatus", () => {
  it("updates cursor and sync status on success", () => {
    const { conn } = setupConnectionWithAccount();

    updateConnectionSyncStatus(db, conn.id, {
      cursor: "cursor-abc-123",
      status: "success",
      error: null,
    });

    const updated = db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.id, conn.id))
      .get()!;

    expect(updated.transactionsCursor).toBe("cursor-abc-123");
    expect(updated.lastSyncStatus).toBe("success");
    expect(updated.lastSyncError).toBeNull();
    expect(updated.lastSyncAt).toBeDefined();
  });

  it("records error status and message", () => {
    const { conn } = setupConnectionWithAccount();

    updateConnectionSyncStatus(db, conn.id, {
      cursor: null, // Don't update cursor on error
      status: "error",
      error: "ITEM_LOGIN_REQUIRED",
    });

    const updated = db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.id, conn.id))
      .get()!;

    expect(updated.lastSyncStatus).toBe("error");
    expect(updated.lastSyncError).toBe("ITEM_LOGIN_REQUIRED");
    expect(updated.transactionsCursor).toBeNull(); // Not updated
  });
});

describe("updateAccountBalances", () => {
  it("updates account balances from Plaid account data", () => {
    const { account } = setupConnectionWithAccount();

    updateAccountBalances(db, [
      {
        account_id: "plaid-acct-001",
        balances: {
          current: 150.0,
          available: 140.0,
        },
      },
    ]);

    const updated = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, account.id))
      .get()!;

    expect(updated.balanceCurrent).toBe(15000); // 150.00 in cents
    expect(updated.balanceAvailable).toBe(14000); // 140.00 in cents
  });

  it("handles accounts not found in our database gracefully", () => {
    setupConnectionWithAccount();

    // Should not throw
    expect(() => {
      updateAccountBalances(db, [
        {
          account_id: "nonexistent-acct",
          balances: { current: 100, available: 100 },
        },
      ]);
    }).not.toThrow();
  });
});
