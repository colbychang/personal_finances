import { sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import { PREDEFINED_CATEGORIES } from "@/lib/categories";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle>;

/**
 * Seed the 11 predefined categories.
 * Idempotent: uses INSERT OR IGNORE to skip existing rows.
 */
export function seedCategories(db: DB): void {
  PREDEFINED_CATEGORIES.forEach((cat, index) => {
    db.run(
      sql`INSERT OR IGNORE INTO categories (name, color, icon, is_predefined, sort_order)
          VALUES (${cat.name}, ${cat.color}, ${cat.icon}, 1, ${index + 1})`
    );
  });
}

/**
 * Seed sample data for development: institutions, accounts, transactions, and budgets.
 * Expects categories to already be seeded.
 */
export function seedSampleData(db: DB): void {
  // ─── Institutions ──────────────────────────────────────────────────
  db.insert(schema.institutions)
    .values([
      { name: "Alliant Credit Union", provider: "manual", status: "active" },
      { name: "Capital One", provider: "manual", status: "active" },
      { name: "Wealthfront", provider: "manual", status: "active" },
    ])
    .run();

  const institutions = db.select().from(schema.institutions).all();
  const alliant = institutions.find((i) => i.name === "Alliant Credit Union")!;
  const capitalOne = institutions.find((i) => i.name === "Capital One")!;
  const wealthfront = institutions.find((i) => i.name === "Wealthfront")!;

  // ─── Accounts ──────────────────────────────────────────────────────
  db.insert(schema.accounts)
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
    ])
    .run();

  const accounts = db.select().from(schema.accounts).all();
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

  db.insert(schema.transactions).values(transactionData).run();

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

  db.insert(schema.budgets).values(budgetData).run();
}

/**
 * Run the full seed (categories + sample data).
 * For use with `npx tsx src/db/seed.ts`
 */
export function seedAll(db: DB): void {
  seedCategories(db);
  seedSampleData(db);
}
