import { eq, asc } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";

type DB = ReturnType<typeof drizzle>;

export interface MerchantRuleRow {
  id: number;
  merchantKey: string;
  label: string;
  category: string;
  isTransfer: boolean;
  updatedAt: string;
}

/**
 * Normalize a merchant name to a consistent key for rule matching.
 * Lowercases and trims whitespace.
 */
export function normalizeMerchantKey(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Get all merchant rules, ordered by label.
 */
export function getAllMerchantRules(database: DB): MerchantRuleRow[] {
  return database
    .select({
      id: schema.merchantRules.id,
      merchantKey: schema.merchantRules.merchantKey,
      label: schema.merchantRules.label,
      category: schema.merchantRules.category,
      isTransfer: schema.merchantRules.isTransfer,
      updatedAt: schema.merchantRules.updatedAt,
    })
    .from(schema.merchantRules)
    .orderBy(asc(schema.merchantRules.label))
    .all();
}

/**
 * Get a merchant rule by its normalized key. Returns null if not found.
 */
export function getMerchantRuleByKey(database: DB, key: string): MerchantRuleRow | null {
  const row = database
    .select({
      id: schema.merchantRules.id,
      merchantKey: schema.merchantRules.merchantKey,
      label: schema.merchantRules.label,
      category: schema.merchantRules.category,
      isTransfer: schema.merchantRules.isTransfer,
      updatedAt: schema.merchantRules.updatedAt,
    })
    .from(schema.merchantRules)
    .where(eq(schema.merchantRules.merchantKey, key))
    .get();

  return row ?? null;
}

export interface CreateMerchantRuleInput {
  merchantKey: string;
  label: string;
  category: string;
  isTransfer?: boolean;
}

/**
 * Create or update a merchant rule (upsert by merchantKey).
 * If a rule with the same merchantKey exists, update it.
 */
export function createOrUpdateMerchantRule(
  database: DB,
  input: CreateMerchantRuleInput
): MerchantRuleRow {
  const existing = getMerchantRuleByKey(database, input.merchantKey);

  if (existing) {
    // Update existing rule
    const now = new Date().toISOString();
    database
      .update(schema.merchantRules)
      .set({
        label: input.label,
        category: input.category,
        isTransfer: input.isTransfer ?? false,
        updatedAt: now,
      })
      .where(eq(schema.merchantRules.id, existing.id))
      .run();

    return database
      .select({
        id: schema.merchantRules.id,
        merchantKey: schema.merchantRules.merchantKey,
        label: schema.merchantRules.label,
        category: schema.merchantRules.category,
        isTransfer: schema.merchantRules.isTransfer,
        updatedAt: schema.merchantRules.updatedAt,
      })
      .from(schema.merchantRules)
      .where(eq(schema.merchantRules.id, existing.id))
      .get()!;
  }

  // Create new rule
  return database
    .insert(schema.merchantRules)
    .values({
      merchantKey: input.merchantKey,
      label: input.label,
      category: input.category,
      isTransfer: input.isTransfer ?? false,
    })
    .returning()
    .get();
}

export interface UpdateMerchantRuleInput {
  category?: string;
  label?: string;
  isTransfer?: boolean;
}

/**
 * Update a merchant rule by ID. Returns updated rule or null if not found.
 */
export function updateMerchantRule(
  database: DB,
  id: number,
  input: UpdateMerchantRuleInput
): MerchantRuleRow | null {
  const existing = database
    .select()
    .from(schema.merchantRules)
    .where(eq(schema.merchantRules.id, id))
    .get();

  if (!existing) return null;

  const updates: Record<string, unknown> = {};
  if (input.category !== undefined) updates.category = input.category;
  if (input.label !== undefined) updates.label = input.label;
  if (input.isTransfer !== undefined) updates.isTransfer = input.isTransfer;
  updates.updatedAt = new Date().toISOString();

  database
    .update(schema.merchantRules)
    .set(updates)
    .where(eq(schema.merchantRules.id, id))
    .run();

  return database
    .select({
      id: schema.merchantRules.id,
      merchantKey: schema.merchantRules.merchantKey,
      label: schema.merchantRules.label,
      category: schema.merchantRules.category,
      isTransfer: schema.merchantRules.isTransfer,
      updatedAt: schema.merchantRules.updatedAt,
    })
    .from(schema.merchantRules)
    .where(eq(schema.merchantRules.id, id))
    .get()!;
}

/**
 * Delete a merchant rule by ID. Returns true if found and deleted.
 */
export function deleteMerchantRule(database: DB, id: number): boolean {
  const existing = database
    .select()
    .from(schema.merchantRules)
    .where(eq(schema.merchantRules.id, id))
    .get();

  if (!existing) return false;

  database
    .delete(schema.merchantRules)
    .where(eq(schema.merchantRules.id, id))
    .run();

  return true;
}
