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
    conn.id,
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
      conn.id,
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

  it("marks duplicate bank-side Venmo funding pulls as transfers when a matching Venmo payment exists", () => {
    const bankConnection = createConnection(db, {
      institutionName: "Wealthfront",
      provider: "plaid",
      accessToken: "encrypted-bank-token",
      itemId: "item-bank",
      isEncrypted: true,
    });

    const bankInstitutionId = findOrCreatePlaidInstitution(
      db,
      "Wealthfront",
      "ins_bank"
    );

    createPlaidAccount(
      db,
      {
        institutionId: bankInstitutionId,
        externalRef: "wf-acct-001",
        name: "Cash Account",
        mask: "1234",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 100000,
        balanceAvailable: 100000,
        isAsset: true,
      },
      bankConnection.id,
      "Wealthfront"
    );

    const venmoConnection = createConnection(db, {
      institutionName: "Venmo - Personal",
      provider: "plaid",
      accessToken: "encrypted-venmo-token",
      itemId: "item-venmo",
      isEncrypted: true,
    });

    const venmoInstitutionId = findOrCreatePlaidInstitution(
      db,
      "Venmo - Personal",
      "ins_venmo"
    );

    createPlaidAccount(
      db,
      {
        institutionId: venmoInstitutionId,
        externalRef: "venmo-acct-001",
        name: "Personal Profile",
        mask: "5678",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 50000,
        balanceAvailable: 50000,
        isAsset: true,
      },
      venmoConnection.id,
      "Venmo - Personal"
    );

    syncTransactionsFromPlaid(db, venmoConnection.id, {
      added: [
        {
          transaction_id: "venmo-payment-001",
          account_id: "venmo-acct-001",
          amount: 127.0,
          date: "2026-04-13",
          name: 'Max Fu "Dodgers giants"',
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    syncTransactionsFromPlaid(db, bankConnection.id, {
      added: [
        {
          transaction_id: "bank-venmo-001",
          account_id: "wf-acct-001",
          amount: 127.0,
          date: "2026-04-14",
          name: "Venmo",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    const bankTxn = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "bank-venmo-001"))
      .get();

    const venmoTxn = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "venmo-payment-001"))
      .get();

    expect(bankTxn).not.toBeNull();
    expect(venmoTxn).not.toBeNull();
    expect(bankTxn!.isTransfer).toBe(true);
    expect(bankTxn!.notes).toContain("Auto-marked as transfer");
    expect(venmoTxn!.isTransfer).toBe(false);
  });

  it("marks matched transfers between tracked accounts as transfers", () => {
    const alliantConnection = createConnection(db, {
      institutionName: "Alliant Credit Union",
      provider: "plaid",
      accessToken: "encrypted-alliant-token",
      itemId: "item-alliant",
      isEncrypted: true,
    });

    const alliantInstitutionId = findOrCreatePlaidInstitution(
      db,
      "Alliant Credit Union",
      "ins_alliant"
    );

    createPlaidAccount(
      db,
      {
        institutionId: alliantInstitutionId,
        externalRef: "alliant-checking-001",
        name: "Checking",
        mask: "1111",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 200000,
        balanceAvailable: 200000,
        isAsset: true,
      },
      alliantConnection.id,
      "Alliant Credit Union"
    );

    const merrillConnection = createConnection(db, {
      institutionName: "Merrill",
      provider: "plaid",
      accessToken: "encrypted-merrill-token",
      itemId: "item-merrill",
      isEncrypted: true,
    });

    const merrillInstitutionId = findOrCreatePlaidInstitution(
      db,
      "Merrill",
      "ins_merrill"
    );

    createPlaidAccount(
      db,
      {
        institutionId: merrillInstitutionId,
        externalRef: "merrill-cma-001",
        name: "CMA-Edge",
        mask: "2222",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 500000,
        balanceAvailable: 500000,
        isAsset: true,
      },
      merrillConnection.id,
      "Merrill"
    );

    syncTransactionsFromPlaid(db, alliantConnection.id, {
      added: [
        {
          transaction_id: "alliant-transfer-001",
          account_id: "alliant-checking-001",
          amount: 1000,
          date: "2026-04-01",
          name: "Withdrawal Ach Merrill Lynch Type: Funds Trfr",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    syncTransactionsFromPlaid(db, merrillConnection.id, {
      added: [
        {
          transaction_id: "merrill-transfer-001",
          account_id: "merrill-cma-001",
          amount: -1000,
          date: "2026-04-01",
          name: "ALLIANT CREDIT UNION",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    const alliantTxn = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "alliant-transfer-001"))
      .get();
    const merrillTxn = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "merrill-transfer-001"))
      .get();

    expect(alliantTxn?.isTransfer).toBe(true);
    expect(merrillTxn?.isTransfer).toBe(true);
    expect(alliantTxn?.notes).toContain("matched move between tracked accounts");
    expect(merrillTxn?.notes).toContain("matched move between tracked accounts");
  });

  it("marks tracked-account transfers when the matching pair posts one day apart", () => {
    const amexConnection = createConnection(db, {
      institutionName: "American Express",
      provider: "plaid",
      accessToken: "encrypted-amex-token",
      itemId: "item-amex",
      isEncrypted: true,
    });

    const amexInstitutionId = findOrCreatePlaidInstitution(
      db,
      "American Express",
      "ins_amex"
    );

    createPlaidAccount(
      db,
      {
        institutionId: amexInstitutionId,
        externalRef: "amex-checking-001",
        name: "Rewards Checking",
        mask: "5555",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 300000,
        balanceAvailable: 300000,
        isAsset: true,
      },
      amexConnection.id,
      "American Express"
    );

    createPlaidAccount(
      db,
      {
        institutionId: amexInstitutionId,
        externalRef: "amex-card-001",
        name: "American Express Gold Card",
        mask: "6666",
        type: "credit",
        subtype: "credit card",
        balanceCurrent: -150000,
        balanceAvailable: null,
        isAsset: false,
      },
      amexConnection.id,
      "American Express"
    );

    syncTransactionsFromPlaid(db, amexConnection.id, {
      added: [
        {
          transaction_id: "amex-checking-transfer-001",
          account_id: "amex-checking-001",
          amount: 1430.65,
          date: "2026-04-07",
          name: "Online Transfer / Payment: Debit",
          merchant_name: null,
          pending: false,
        },
        {
          transaction_id: "amex-card-payment-001",
          account_id: "amex-card-001",
          amount: -1430.65,
          date: "2026-04-06",
          name: "ONLINE PAYMENT - THANK YOU",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    const checkingTxn = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "amex-checking-transfer-001"))
      .get();
    const cardTxn = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "amex-card-payment-001"))
      .get();

    expect(checkingTxn?.isTransfer).toBe(true);
    expect(cardTxn?.isTransfer).toBe(true);
  });

  it("does not mark same-day equal-and-opposite amounts as transfers without transfer clues", () => {
    const firstConnection = createConnection(db, {
      institutionName: "Wealthfront",
      provider: "plaid",
      accessToken: "encrypted-wealthfront-token",
      itemId: "item-wealthfront",
      isEncrypted: true,
    });

    const firstInstitutionId = findOrCreatePlaidInstitution(
      db,
      "Wealthfront",
      "ins_wealthfront"
    );

    createPlaidAccount(
      db,
      {
        institutionId: firstInstitutionId,
        externalRef: "wealthfront-acct-001",
        name: "Cash Account",
        mask: "3333",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 100000,
        balanceAvailable: 100000,
        isAsset: true,
      },
      firstConnection.id,
      "Wealthfront"
    );

    const secondConnection = createConnection(db, {
      institutionName: "Capital One",
      provider: "plaid",
      accessToken: "encrypted-capital-one-token",
      itemId: "item-capital-one",
      isEncrypted: true,
    });

    const secondInstitutionId = findOrCreatePlaidInstitution(
      db,
      "Capital One",
      "ins_capital_one"
    );

    createPlaidAccount(
      db,
      {
        institutionId: secondInstitutionId,
        externalRef: "capital-one-acct-001",
        name: "Checking",
        mask: "4444",
        type: "checking",
        subtype: "checking",
        balanceCurrent: 100000,
        balanceAvailable: 100000,
        isAsset: true,
      },
      secondConnection.id,
      "Capital One"
    );

    syncTransactionsFromPlaid(db, firstConnection.id, {
      added: [
        {
          transaction_id: "wf-normal-expense",
          account_id: "wealthfront-acct-001",
          amount: 42.5,
          date: "2026-04-02",
          name: "Coffee Shop",
          merchant_name: "Blue Bottle",
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    syncTransactionsFromPlaid(db, secondConnection.id, {
      added: [
        {
          transaction_id: "capital-income",
          account_id: "capital-one-acct-001",
          amount: -42.5,
          date: "2026-04-02",
          name: "Friend reimbursement",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    const wealthfrontTxn = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "wf-normal-expense"))
      .get();
    const capitalTxn = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "capital-income"))
      .get();

    expect(wealthfrontTxn?.isTransfer).toBe(false);
    expect(capitalTxn?.isTransfer).toBe(false);
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
