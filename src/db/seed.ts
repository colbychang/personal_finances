import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import { PREDEFINED_CATEGORIES } from "@/lib/categories";
import { createSnapshot } from "./queries/snapshots";
import * as schema from "./schema";

type DB = AppDatabase;

/**
 * Seed the 11 predefined categories.
 * Idempotent: uses INSERT OR IGNORE to skip existing rows.
 */
export async function seedCategories(db: DB): Promise<void> {
  for (const [index, cat] of PREDEFINED_CATEGORIES.entries()) {
    const [existing] = await db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(eq(schema.categories.name, cat.name))
      .limit(1);

    if (existing) {
      continue;
    }

    await db
      .insert(schema.categories)
      .values({
        workspaceId: null,
        name: cat.name,
        color: cat.color,
        icon: cat.icon,
        isPredefined: true,
        sortOrder: index + 1,
      });
  }
}

/**
 * Seed sample data for development: institutions, accounts, transactions, and budgets.
 * Expects categories to already be seeded.
 */
export async function seedSampleData(db: DB): Promise<void> {
  // ─── Institutions ──────────────────────────────────────────────────
  await db.insert(schema.institutions)
    .values([
      { name: "Alliant Credit Union", provider: "manual", status: "active" },
      { name: "Capital One", provider: "manual", status: "active" },
      { name: "Wealthfront", provider: "manual", status: "active" },
    ]);

  const institutions = await db.select().from(schema.institutions);
  const alliant = institutions.find((i) => i.name === "Alliant Credit Union")!;
  const capitalOne = institutions.find((i) => i.name === "Capital One")!;
  const wealthfront = institutions.find((i) => i.name === "Wealthfront")!;

  // ─── Accounts ──────────────────────────────────────────────────────
  await db.insert(schema.accounts)
    .values([
      {
        institutionId: alliant.id,
        name: "Alliant Checking",
        type: "checking",
        balanceCurrent: 812543, // $8,125.43
        balanceAvailable: 812543,
        isAsset: true,
        currency: "USD",
        source: "manual",
      },
      {
        institutionId: alliant.id,
        name: "Alliant Savings",
        type: "savings",
        balanceCurrent: 2500000, // $25,000.00
        balanceAvailable: 2500000,
        isAsset: true,
        currency: "USD",
        source: "manual",
      },
      {
        institutionId: capitalOne.id,
        name: "Capital One Quicksilver",
        type: "credit",
        balanceCurrent: 250034, // $2,500.34 owed
        isAsset: false,
        currency: "USD",
        source: "manual",
      },
      {
        institutionId: wealthfront.id,
        name: "Wealthfront Investment",
        type: "investment",
        balanceCurrent: 15678900, // $156,789.00
        isAsset: true,
        currency: "USD",
        source: "manual",
      },
    ]);

  const accounts = await db.select().from(schema.accounts);
  const checking = accounts.find((a) => a.type === "checking")!;
  const credit = accounts.find((a) => a.type === "credit")!;

  // ─── Transactions ──────────────────────────────────────────────────
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const year = currentMonth.slice(0, 4);
  const month = currentMonth.slice(5, 7);

  const transactionData: (typeof schema.transactions.$inferInsert)[] = [
    {
      accountId: checking.id,
      postedAt: `${year}-${month}-01`,
      name: "Monthly Rent Payment",
      merchant: "Property Management Co",
      amount: 200000, // $2,000.00
      category: "Rent/Home",
      pending: false,
      isTransfer: false,
      reviewState: "reviewed",
    },
    {
      accountId: checking.id,
      postedAt: `${year}-${month}-03`,
      name: "Whole Foods Market",
      merchant: "Whole Foods",
      amount: 12547, // $125.47
      category: "Groceries",
      pending: false,
      isTransfer: false,
      reviewState: "reviewed",
    },
    {
      accountId: credit.id,
      postedAt: `${year}-${month}-05`,
      name: "Dinner at Olive Garden",
      merchant: "Olive Garden",
      amount: 6832, // $68.32
      category: "Eating Out",
      pending: false,
      isTransfer: false,
      reviewState: "reviewed",
    },
    {
      accountId: credit.id,
      postedAt: `${year}-${month}-07`,
      name: "Bar Tab - The Tipsy Cow",
      merchant: "The Tipsy Cow",
      amount: 4500, // $45.00
      category: "Bars/Clubs/Going Out",
      pending: false,
      isTransfer: false,
      reviewState: "reviewed",
    },
    {
      accountId: credit.id,
      postedAt: `${year}-${month}-08`,
      name: "Netflix Subscription",
      merchant: "Netflix",
      amount: 1599, // $15.99
      category: "Subscriptions",
      pending: false,
      isTransfer: false,
      reviewState: "reviewed",
    },
    {
      accountId: credit.id,
      postedAt: `${year}-${month}-09`,
      name: "Spotify Premium",
      merchant: "Spotify",
      amount: 999, // $9.99
      category: "Subscriptions",
      pending: false,
      isTransfer: false,
      reviewState: "reviewed",
    },
    {
      accountId: checking.id,
      postedAt: `${year}-${month}-10`,
      name: "Auto Insurance Premium",
      merchant: "State Farm",
      amount: 15000, // $150.00
      category: "Insurance",
      pending: false,
      isTransfer: false,
      reviewState: "reviewed",
    },
    {
      accountId: credit.id,
      postedAt: `${year}-${month}-11`,
      name: "Target - Home Goods",
      merchant: "Target",
      amount: 8925, // $89.25
      category: "Home Goods",
      pending: false,
      isTransfer: false,
      reviewState: "reviewed",
    },
    {
      accountId: credit.id,
      postedAt: `${year}-${month}-12`,
      name: "H&M Clothing",
      merchant: "H&M",
      amount: 7450, // $74.50
      category: "Clothing",
      pending: false,
      isTransfer: false,
      reviewState: "reviewed",
    },
    {
      accountId: checking.id,
      postedAt: `${year}-${month}-14`,
      name: "Trader Joe's",
      merchant: "Trader Joe's",
      amount: 6789, // $67.89
      category: "Groceries",
      pending: false,
      isTransfer: false,
      reviewState: "reviewed",
    },
    {
      accountId: checking.id,
      postedAt: `${year}-${month}-15`,
      name: "Paycheck - Employer",
      merchant: "Employer Inc",
      amount: -500000, // -$5,000.00 (income)
      category: "Income",
      pending: false,
      isTransfer: false,
      reviewState: "reviewed",
    },
    {
      accountId: checking.id,
      postedAt: `${year}-${month}-15`,
      name: "Transfer to Savings",
      merchant: null,
      amount: 100000, // $1,000.00
      pending: false,
      isTransfer: true,
      reviewState: "reviewed",
    },
  ];

  await db.insert(schema.transactions).values(transactionData);

  // ─── Budgets ───────────────────────────────────────────────────────
  const budgetData: (typeof schema.budgets.$inferInsert)[] = [
    { month: currentMonth, category: "Rent/Home", amount: 200000 },
    { month: currentMonth, category: "Groceries", amount: 60000 },
    { month: currentMonth, category: "Eating Out", amount: 30000 },
    { month: currentMonth, category: "Bars/Clubs/Going Out", amount: 20000 },
    { month: currentMonth, category: "Clothing", amount: 15000 },
    { month: currentMonth, category: "Insurance", amount: 15000 },
    { month: currentMonth, category: "Subscriptions", amount: 5000 },
    { month: currentMonth, category: "Home Goods", amount: 10000 },
  ];

  await db.insert(schema.budgets).values(budgetData);

  // ─── Snapshots ─────────────────────────────────────────────────────
  // Create 6 months of historical snapshots with realistic balance progression.
  // We temporarily set account balances to historical values, call createSnapshot(),
  // then restore the current balances at the end.

  // Current balances (final state)
  const currentBalances = await db.select().from(schema.accounts);

  // Define historical balance multipliers relative to current balances.
  // Simulates gradual growth over 6 months (oldest → newest).
  const now = new Date();
  const historicalMonths: { month: string; multipliers: Record<string, number> }[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    // Assets grow over time; liabilities shrink slightly
    // i=5 is oldest (5 months ago), i=0 is current month
    const assetFactor = 0.90 + (5 - i) * 0.02; // 0.90, 0.92, 0.94, 0.96, 0.98, 1.00
    const liabilityFactor = 1.10 - (5 - i) * 0.02; // 1.10, 1.08, 1.06, 1.04, 1.02, 1.00

    historicalMonths.push({
      month: m,
      multipliers: {
        asset: assetFactor,
        liability: liabilityFactor,
      },
    });
  }

  for (const hm of historicalMonths) {
    // Set account balances to historical values
    for (const acct of currentBalances) {
      const factor = acct.isAsset ? hm.multipliers.asset : hm.multipliers.liability;
      const historicalBalance = Math.round(acct.balanceCurrent * factor);
      await db.update(schema.accounts)
        .set({ balanceCurrent: historicalBalance })
        .where(eq(schema.accounts.id, acct.id));
    }

    // Create snapshot using the proper function
    await createSnapshot(db, hm.month);
  }

  // Restore current (final) account balances
  for (const acct of currentBalances) {
    await db.update(schema.accounts)
      .set({ balanceCurrent: acct.balanceCurrent })
      .where(eq(schema.accounts.id, acct.id));
  }
}

/**
 * Run the full seed (categories + sample data).
 * For use with `npx tsx src/db/seed.ts`
 */
export async function seedAll(db: DB): Promise<void> {
  await seedCategories(db);
  await seedSampleData(db);
}
