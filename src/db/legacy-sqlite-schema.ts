import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Workspaces ────────────────────────────────────────────────────────
export const workspaces = sqliteTable("workspaces", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  slug: text().notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const workspaceMembers = sqliteTable("workspace_members", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  authUserId: text("auth_user_id").notNull(),
  email: text().notNull(),
  role: text().notNull().default("owner"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex("workspace_members_workspace_auth_user_unique").on(
    table.workspaceId,
    table.authUserId,
  ),
  uniqueIndex("workspace_members_auth_user_unique").on(table.authUserId),
]);

// ─── Institutions ──────────────────────────────────────────────────────
export const institutions = sqliteTable("institutions", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id"),
  name: text().notNull(),
  provider: text().notNull(), // "plaid" | "csv" | "manual"
  status: text().notNull().default("active"), // "active" | "inactive" | "error"
  plaidInstitutionId: text("plaid_institution_id"),
  lastSyncAt: text("last_sync_at"),
});

// ─── Accounts ──────────────────────────────────────────────────────────
export const accounts = sqliteTable("accounts", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id"),
  institutionId: integer("institution_id")
    .notNull()
    .references(() => institutions.id),
  externalRef: text("external_ref"),
  name: text().notNull(),
  mask: text(),
  type: text().notNull(), // "checking" | "savings" | "credit" | "investment" | "retirement"
  subtype: text(),
  balanceCurrent: integer("balance_current").notNull().default(0), // cents
  balanceAvailable: integer("balance_available"), // cents
  isAsset: integer("is_asset", { mode: "boolean" }).notNull().default(true),
  currency: text().notNull().default("USD"),
  source: text().notNull().default("manual"), // "manual" | "plaid" | "csv"
}, (table) => [
  uniqueIndex("accounts_workspace_external_ref_unique").on(table.workspaceId, table.externalRef),
]);

// ─── Transactions ──────────────────────────────────────────────────────
export const transactions = sqliteTable("transactions", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id"),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  externalId: text("external_id"),
  postedAt: text("posted_at").notNull(), // YYYY-MM-DD
  overrideMonth: text("override_month"), // YYYY-MM, optional budgeting month override
  name: text().notNull(),
  merchant: text(),
  amount: integer().notNull(), // cents (positive = expense, negative = income)
  category: text(),
  pending: integer({ mode: "boolean" }).notNull().default(false),
  notes: text(),
  categoryOverride: text("category_override"),
  isTransfer: integer("is_transfer", { mode: "boolean" }).notNull().default(false),
  isExcluded: integer("is_excluded", { mode: "boolean" }).notNull().default(false),
  reviewState: text("review_state").notNull().default("none"), // "none" | "reviewed" | "flagged"
});

// ─── Budgets ───────────────────────────────────────────────────────────
export const budgets = sqliteTable("budgets", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id"),
  month: text().notNull(), // YYYY-MM
  category: text().notNull(),
  amount: integer().notNull(), // cents
}, (table) => [
  uniqueIndex("budgets_workspace_month_category_unique").on(
    table.workspaceId,
    table.month,
    table.category,
  ),
]);

// ─── Budget Templates ──────────────────────────────────────────────────
export const budgetTemplates = sqliteTable("budget_templates", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id"),
  category: text().notNull(),
  amount: integer().notNull(), // cents
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex("budget_templates_workspace_category_unique").on(
    table.workspaceId,
    table.category,
  ),
]);

// ─── Snapshots ─────────────────────────────────────────────────────────
export const snapshots = sqliteTable("snapshots", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id"),
  month: text().notNull(), // YYYY-MM
  assets: integer().notNull(), // cents
  liabilities: integer().notNull(), // cents
  netWorth: integer("net_worth").notNull(), // cents
}, (table) => [
  uniqueIndex("snapshots_workspace_month_unique").on(table.workspaceId, table.month),
]);

// ─── Connections ───────────────────────────────────────────────────────
export const connections = sqliteTable("connections", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id"),
  institutionName: text("institution_name").notNull(),
  provider: text().notNull(), // "plaid" | "csv"
  accessToken: text("access_token"),
  itemId: text("item_id"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  transactionsCursor: text("transactions_cursor"),
  isEncrypted: integer("is_encrypted", { mode: "boolean" }).notNull().default(false),
  lastSyncAt: text("last_sync_at"),
  lastSyncStatus: text("last_sync_status"),
  lastSyncError: text("last_sync_error"),
});

// ─── Merchant Rules ────────────────────────────────────────────────────
export const merchantRules = sqliteTable("merchant_rules", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id"),
  merchantKey: text("merchant_key").notNull(),
  label: text().notNull(),
  category: text().notNull(),
  isTransfer: integer("is_transfer", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex("merchant_rules_workspace_merchant_key_unique").on(
    table.workspaceId,
    table.merchantKey,
  ),
]);

// ─── Account Snapshots ─────────────────────────────────────────────────
export const accountSnapshots = sqliteTable("account_snapshots", {
  id: integer().primaryKey({ autoIncrement: true }),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  day: text().notNull(), // YYYY-MM-DD
  capturedAt: text("captured_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  balanceCurrent: integer("balance_current").notNull(), // cents
  isAsset: integer("is_asset", { mode: "boolean" }).notNull().default(true),
}, (table) => [
  uniqueIndex("account_snapshots_account_day_unique").on(table.accountId, table.day),
]);

// ─── Account Links ─────────────────────────────────────────────────────
export const accountLinks = sqliteTable("account_links", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id"),
  provider: text().notNull(), // "plaid" | "csv"
  externalKey: text("external_key").notNull(),
  connectionId: integer("connection_id")
    .notNull()
    .references(() => connections.id),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  institutionName: text("institution_name").notNull(),
  displayName: text("display_name").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex("account_links_workspace_external_key_unique").on(
    table.workspaceId,
    table.externalKey,
  ),
]);

// ─── Transaction Splits ────────────────────────────────────────────────
export const transactionSplits = sqliteTable("transaction_splits", {
  id: integer().primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id),
  category: text().notNull(),
  amount: integer().notNull(), // cents
});

// ─── Categories ────────────────────────────────────────────────────────
export const categories = sqliteTable("categories", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  color: text(),
  icon: text(),
  isPredefined: integer("is_predefined", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});
