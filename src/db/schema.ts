import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";

// ─── Workspaces ────────────────────────────────────────────────────────
export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  authUserId: text("auth_user_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("owner"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("workspace_members_workspace_auth_user_unique").on(
    table.workspaceId,
    table.authUserId,
  ),
  uniqueIndex("workspace_members_auth_user_unique").on(table.authUserId),
]);

// ─── Institutions ──────────────────────────────────────────────────────
export const institutions = pgTable("institutions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspaces.id),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("active"),
  plaidInstitutionId: text("plaid_institution_id"),
  lastSyncAt: text("last_sync_at"),
});

// ─── Accounts ──────────────────────────────────────────────────────────
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspaces.id),
  institutionId: integer("institution_id")
    .notNull()
    .references(() => institutions.id),
  externalRef: text("external_ref"),
  name: text("name").notNull(),
  mask: text("mask"),
  type: text("type").notNull(),
  subtype: text("subtype"),
  balanceCurrent: integer("balance_current").notNull().default(0),
  balanceAvailable: integer("balance_available"),
  isAsset: boolean("is_asset").notNull().default(true),
  currency: text("currency").notNull().default("USD"),
  source: text("source").notNull().default("manual"),
}, (table) => [
  uniqueIndex("accounts_workspace_external_ref_unique").on(table.workspaceId, table.externalRef),
]);

// ─── Transactions ──────────────────────────────────────────────────────
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspaces.id),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  externalId: text("external_id"),
  postedAt: text("posted_at").notNull(),
  overrideMonth: text("override_month"),
  name: text("name").notNull(),
  merchant: text("merchant"),
  amount: integer("amount").notNull(),
  category: text("category"),
  pending: boolean("pending").notNull().default(false),
  notes: text("notes"),
  categoryOverride: text("category_override"),
  isTransfer: boolean("is_transfer").notNull().default(false),
  isExcluded: boolean("is_excluded").notNull().default(false),
  reviewState: text("review_state").notNull().default("none"),
});

// ─── Budgets ───────────────────────────────────────────────────────────
export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspaces.id),
  month: text("month").notNull(),
  category: text("category").notNull(),
  amount: integer("amount").notNull(),
}, (table) => [
  uniqueIndex("budgets_workspace_month_category_unique").on(
    table.workspaceId,
    table.month,
    table.category,
  ),
]);

// ─── Budget Templates ──────────────────────────────────────────────────
export const budgetTemplates = pgTable("budget_templates", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspaces.id),
  category: text("category").notNull(),
  amount: integer("amount").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("budget_templates_workspace_category_unique").on(
    table.workspaceId,
    table.category,
  ),
]);

// ─── Snapshots ─────────────────────────────────────────────────────────
export const snapshots = pgTable("snapshots", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspaces.id),
  month: text("month").notNull(),
  assets: integer("assets").notNull(),
  liabilities: integer("liabilities").notNull(),
  netWorth: integer("net_worth").notNull(),
}, (table) => [
  uniqueIndex("snapshots_workspace_month_unique").on(table.workspaceId, table.month),
]);

// ─── Connections ───────────────────────────────────────────────────────
export const connections = pgTable("connections", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspaces.id),
  institutionName: text("institution_name").notNull(),
  provider: text("provider").notNull(),
  accessToken: text("access_token"),
  itemId: text("item_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  transactionsCursor: text("transactions_cursor"),
  isEncrypted: boolean("is_encrypted").notNull().default(false),
  lastSyncAt: text("last_sync_at"),
  lastSyncStatus: text("last_sync_status"),
  lastSyncError: text("last_sync_error"),
});

// ─── Merchant Rules ────────────────────────────────────────────────────
export const merchantRules = pgTable("merchant_rules", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspaces.id),
  merchantKey: text("merchant_key").notNull(),
  label: text("label").notNull(),
  category: text("category").notNull(),
  isTransfer: boolean("is_transfer").notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("merchant_rules_workspace_merchant_key_unique").on(
    table.workspaceId,
    table.merchantKey,
  ),
]);

// ─── Account Snapshots ─────────────────────────────────────────────────
export const accountSnapshots = pgTable("account_snapshots", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  day: text("day").notNull(),
  capturedAt: text("captured_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  balanceCurrent: integer("balance_current").notNull(),
  isAsset: boolean("is_asset").notNull().default(true),
}, (table) => [
  uniqueIndex("account_snapshots_account_day_unique").on(table.accountId, table.day),
]);

// ─── Account Links ─────────────────────────────────────────────────────
export const accountLinks = pgTable("account_links", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspaces.id),
  provider: text("provider").notNull(),
  externalKey: text("external_key").notNull(),
  connectionId: integer("connection_id")
    .notNull()
    .references(() => connections.id),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  institutionName: text("institution_name").notNull(),
  displayName: text("display_name").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("account_links_workspace_external_key_unique").on(
    table.workspaceId,
    table.externalKey,
  ),
]);

// ─── Transaction Splits ────────────────────────────────────────────────
export const transactionSplits = pgTable("transaction_splits", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id),
  category: text("category").notNull(),
  amount: integer("amount").notNull(),
});

// ─── Categories ────────────────────────────────────────────────────────
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspaces.id),
  name: text("name").notNull(),
  color: text("color"),
  icon: text("icon"),
  isPredefined: boolean("is_predefined").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  uniqueIndex("categories_workspace_name_unique").on(table.workspaceId, table.name),
]);
