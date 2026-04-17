import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "@/db/schema";
import {
  createConnection,
  createPlaidAccount,
  findOrCreatePlaidInstitution,
} from "@/db/queries/connections";
import { getTransactions } from "@/db/queries/transactions";
import {
  syncTransactionsFromPlaid,
  updateAccountBalances,
  updateConnectionSyncStatus,
} from "@/db/queries/sync";
import {
  closeTestDb,
  createTestDb,
  resetTestDb,
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

async function setupConnectionWithAccount({
  institutionName = "Test Bank",
  connectionInstitutionName = institutionName,
  plaidInstitutionId = "ins_1",
  externalRef = "plaid-acct-001",
  accountName = "Plaid Checking",
  type = "checking",
  subtype = "checking",
  isAsset = true,
}: {
  institutionName?: string;
  connectionInstitutionName?: string;
  plaidInstitutionId?: string;
  externalRef?: string;
  accountName?: string;
  type?: string;
  subtype?: string;
  isAsset?: boolean;
} = {}) {
  const connection = await createConnection(db, {
    institutionName: connectionInstitutionName,
    provider: "plaid",
    accessToken: `token-${externalRef}`,
    itemId: `item-${externalRef}`,
    isEncrypted: true,
  });

  const institutionId = await findOrCreatePlaidInstitution(db, institutionName, plaidInstitutionId);
  const account = await createPlaidAccount(
    db,
    {
      institutionId,
      externalRef,
      name: accountName,
      mask: "0000",
      type,
      subtype,
      balanceCurrent: 100_000,
      balanceAvailable: 95_000,
      isAsset,
    },
    connection.id,
    institutionName,
  );

  return { connection, account, institutionId };
}

describe("syncTransactionsFromPlaid", () => {
  it("stores added transactions with correct cents and account mapping", async () => {
    const { connection } = await setupConnectionWithAccount();

    const result = await syncTransactionsFromPlaid(db, connection.id, {
      added: [
        {
          transaction_id: "txn-001",
          account_id: "plaid-acct-001",
          amount: 25.5,
          date: "2026-03-15",
          name: "Coffee Shop",
          merchant_name: "Starbucks",
          pending: false,
        },
        {
          transaction_id: "txn-002",
          account_id: "plaid-acct-001",
          amount: -100,
          date: "2026-03-14",
          name: "Payroll",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    expect(result).toEqual({ added: 2, modified: 0, removed: 0 });

    const stored = await db.select().from(schema.transactions);
    expect(stored.find((txn) => txn.externalId === "txn-001")?.amount).toBe(2_550);
    expect(stored.find((txn) => txn.externalId === "txn-002")?.amount).toBe(-10_000);
  });

  it("skips syncing transactions for investment and retirement accounts", async () => {
    const investment = await setupConnectionWithAccount({
      institutionName: "Merrill",
      plaidInstitutionId: "ins_merrill",
      externalRef: "merrill-investment-001",
      accountName: "Brokerage",
      type: "investment",
      subtype: "brokerage",
    });
    const retirement = await setupConnectionWithAccount({
      institutionName: "Merrill",
      plaidInstitutionId: "ins_merrill",
      externalRef: "merrill-retirement-001",
      accountName: "Roth IRA",
      type: "retirement",
      subtype: "ira",
    });

    const result = await syncTransactionsFromPlaid(db, investment.connection.id, {
      added: [
        {
          transaction_id: "investment-dividend-001",
          account_id: "merrill-investment-001",
          amount: -25,
          date: "2026-04-10",
          name: "Dividend",
          merchant_name: null,
          pending: false,
        },
        {
          transaction_id: "retirement-dividend-001",
          account_id: "merrill-retirement-001",
          amount: -10,
          date: "2026-04-10",
          name: "Dividend",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    expect(result.added).toBe(0);

    const visible = await getTransactions(db, { page: 1, limit: 20 });
    expect(visible.total).toBe(0);

    expect(retirement.account.type).toBe("retirement");
  });

  it("marks passive income transactions as excluded from visible spending", async () => {
    const { connection } = await setupConnectionWithAccount();

    await syncTransactionsFromPlaid(db, connection.id, {
      added: [
        {
          transaction_id: "interest-income-001",
          account_id: "plaid-acct-001",
          amount: -2.98,
          date: "2026-04-01",
          name: "March interest Interest payment PAID_INTEREST",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    const [stored] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "interest-income-001"))
      .limit(1);
    expect(stored?.isExcluded).toBe(true);

    const visible = await getTransactions(db, { page: 1, limit: 20 });
    expect(visible.total).toBe(0);
  });

  it("marks bank-side Venmo pulls as transfers when a matching Venmo expense exists", async () => {
    const wealthfront = await setupConnectionWithAccount({
      institutionName: "Wealthfront",
      plaidInstitutionId: "ins_wealthfront",
      externalRef: "wf-acct-001",
      accountName: "Cash Account",
    });
    const venmo = await setupConnectionWithAccount({
      institutionName: "Venmo - Personal",
      plaidInstitutionId: "ins_venmo",
      externalRef: "venmo-acct-001",
      accountName: "Personal Profile",
    });

    await syncTransactionsFromPlaid(db, venmo.connection.id, {
      added: [
        {
          transaction_id: "venmo-payment-001",
          account_id: "venmo-acct-001",
          amount: 127,
          date: "2026-04-13",
          name: 'Max Fu "Dodgers giants"',
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    await syncTransactionsFromPlaid(db, wealthfront.connection.id, {
      added: [
        {
          transaction_id: "bank-venmo-001",
          account_id: "wf-acct-001",
          amount: 127,
          date: "2026-04-14",
          name: "Venmo",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    const [bankTxn] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "bank-venmo-001"))
      .limit(1);
    const [venmoTxn] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "venmo-payment-001"))
      .limit(1);

    expect(bankTxn?.isTransfer).toBe(true);
    expect(bankTxn?.notes).toContain("double-counting a matched Venmo transaction");
    expect(venmoTxn?.isTransfer).toBe(false);
  });

  it("marks matched internal transfers within a four-day window", async () => {
    const amexChecking = await setupConnectionWithAccount({
      institutionName: "American Express",
      plaidInstitutionId: "ins_amex",
      externalRef: "amex-checking-001",
      accountName: "Rewards Checking",
      type: "checking",
    });
    await createPlaidAccount(
      db,
      {
        institutionId: amexChecking.institutionId,
        externalRef: "amex-card-001",
        name: "American Express Gold Card",
        mask: "6666",
        type: "credit",
        subtype: "credit card",
        balanceCurrent: -150_000,
        balanceAvailable: null,
        isAsset: false,
      },
      amexChecking.connection.id,
      "American Express",
    );

    await syncTransactionsFromPlaid(db, amexChecking.connection.id, {
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
          date: "2026-04-03",
          name: "ONLINE PAYMENT - THANK YOU",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    const [checkingTxn] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "amex-checking-transfer-001"))
      .limit(1);
    const [cardTxn] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "amex-card-payment-001"))
      .limit(1);

    expect(checkingTxn?.isTransfer).toBe(true);
    expect(cardTxn?.isTransfer).toBe(true);
    expect(checkingTxn?.notes).toContain("matched move between tracked accounts");
  });

  it("does not auto-mark equal and opposite amounts without transfer clues", async () => {
    const wealthfront = await setupConnectionWithAccount({
      institutionName: "Wealthfront",
      plaidInstitutionId: "ins_wealthfront",
      externalRef: "wealthfront-acct-001",
      accountName: "Cash Account",
    });
    const capitalOne = await setupConnectionWithAccount({
      institutionName: "Capital One",
      plaidInstitutionId: "ins_capital_one",
      externalRef: "capital-one-acct-001",
      accountName: "Checking",
    });

    await syncTransactionsFromPlaid(db, wealthfront.connection.id, {
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

    await syncTransactionsFromPlaid(db, capitalOne.connection.id, {
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

    const [expense] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "wf-normal-expense"))
      .limit(1);
    const [income] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "capital-income"))
      .limit(1);

    expect(expense?.isTransfer).toBe(false);
    expect(income?.isTransfer).toBe(false);
  });

  it("marks Venmo Standard transfers and matching non-Venmo counterparts", async () => {
    const wealthfront = await setupConnectionWithAccount({
      institutionName: "Wealthfront",
      plaidInstitutionId: "ins_wealthfront_venmo",
      externalRef: "wealthfront-cash-001",
      accountName: "High Yield Cash",
      type: "savings",
      subtype: "savings",
    });
    const venmo = await setupConnectionWithAccount({
      institutionName: "Venmo - Personal",
      plaidInstitutionId: "ins_venmo_standard_transfer",
      externalRef: "venmo-wallet-001",
      accountName: "Venmo",
    });

    await syncTransactionsFromPlaid(db, venmo.connection.id, {
      added: [
        {
          transaction_id: "venmo-standard-transfer-001",
          account_id: "venmo-wallet-001",
          amount: 2593,
          date: "2026-04-03",
          name: "Standard transfer",
          merchant_name: null,
          pending: false,
        },
        {
          transaction_id: "venmo-standard-transfer-002",
          account_id: "venmo-wallet-001",
          amount: 2593,
          date: "2026-04-03",
          name: "Standard transfer",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    await syncTransactionsFromPlaid(db, wealthfront.connection.id, {
      added: [
        {
          transaction_id: "wealthfront-venmo-counterpart-001",
          account_id: "wealthfront-cash-001",
          amount: -2593,
          date: "2026-04-06",
          name: "Venmo",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    const standardTransfers = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.name, "Standard transfer"));
    const [counterpart] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "wealthfront-venmo-counterpart-001"))
      .limit(1);

    expect(standardTransfers).toHaveLength(2);
    expect(standardTransfers[0]?.isTransfer).toBe(true);
    expect(standardTransfers[1]?.isTransfer).toBe(true);
    expect(standardTransfers.some((txn) => txn.notes?.includes("duplicate/cancelled"))).toBe(true);
    expect(counterpart?.isTransfer).toBe(true);
    expect(counterpart?.notes).toContain("matched Venmo Standard transfer");
  });

  it("updates modified transactions and removes deleted ones", async () => {
    const { connection } = await setupConnectionWithAccount();

    await syncTransactionsFromPlaid(db, connection.id, {
      added: [
        {
          transaction_id: "txn-mod",
          account_id: "plaid-acct-001",
          amount: 10,
          date: "2026-04-01",
          name: "Coffee",
          merchant_name: null,
          pending: false,
        },
      ],
      modified: [],
      removed: [],
    });

    const result = await syncTransactionsFromPlaid(db, connection.id, {
      added: [],
      modified: [
        {
          transaction_id: "txn-mod",
          account_id: "plaid-acct-001",
          amount: 12.5,
          date: "2026-04-02",
          name: "Coffee Shop",
          merchant_name: "Blue Bottle",
          pending: true,
        },
      ],
      removed: [{ transaction_id: "txn-mod" }],
    });

    expect(result.modified).toBe(1);
    expect(result.removed).toBe(1);

    const [stored] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.externalId, "txn-mod"))
      .limit(1);
    expect(stored).toBeUndefined();
  });
});

describe("updateConnectionSyncStatus", () => {
  it("updates cursor and sync metadata", async () => {
    const { connection } = await setupConnectionWithAccount();

    await updateConnectionSyncStatus(db, connection.id, {
      cursor: "cursor-123",
      status: "success",
      error: null,
    });

    const [updated] = await db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.id, connection.id))
      .limit(1);

    expect(updated?.transactionsCursor).toBe("cursor-123");
    expect(updated?.lastSyncStatus).toBe("success");
    expect(updated?.lastSyncError).toBeNull();
    expect(updated?.lastSyncAt).toBeTruthy();
  });
});

describe("updateAccountBalances", () => {
  it("updates current and available balances in cents", async () => {
    const { account } = await setupConnectionWithAccount();

    await updateAccountBalances(db, [
      {
        account_id: "plaid-acct-001",
        balances: {
          current: 1234.56,
          available: 1200,
        },
      },
    ]);

    const [updated] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, account.id))
      .limit(1);

    expect(updated?.balanceCurrent).toBe(123_456);
    expect(updated?.balanceAvailable).toBe(120_000);
  });
});
