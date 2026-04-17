import { and, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "../schema";

type DB = AppDatabase;

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
export async function getAllMerchantRules(database: DB, workspaceId?: number): Promise<MerchantRuleRow[]> {
  return await database
    .select({
      id: schema.merchantRules.id,
      merchantKey: schema.merchantRules.merchantKey,
      label: schema.merchantRules.label,
      category: schema.merchantRules.category,
      isTransfer: schema.merchantRules.isTransfer,
      updatedAt: schema.merchantRules.updatedAt,
    })
    .from(schema.merchantRules)
    .where(
      workspaceId === undefined
        ? undefined
        : eq(schema.merchantRules.workspaceId, workspaceId),
    )
    .orderBy(asc(schema.merchantRules.label));
}

/**
 * Get a merchant rule by its normalized key. Returns null if not found.
 */
export function getMerchantRuleByKey(
  database: DB,
  key: string,
  workspaceId?: number,
): Promise<MerchantRuleRow | null> {
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
    .where(
      and(
        eq(schema.merchantRules.merchantKey, key),
        workspaceId === undefined
          ? undefined
          : eq(schema.merchantRules.workspaceId, workspaceId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
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
export async function createOrUpdateMerchantRule(
  database: DB,
  input: CreateMerchantRuleInput,
  workspaceId?: number,
): Promise<MerchantRuleRow> {
  const existing = await getMerchantRuleByKey(database, input.merchantKey, workspaceId);

  if (existing) {
    // Update existing rule
    const now = new Date().toISOString();
    await database
      .update(schema.merchantRules)
      .set({
        label: input.label,
        category: input.category,
        isTransfer: input.isTransfer ?? false,
        updatedAt: now,
      })
      .where(eq(schema.merchantRules.id, existing.id));

    const [updatedRule] = await database
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
      .limit(1);

    return updatedRule!;
  }

  // Create new rule
  const [insertedRule] = await database
    .insert(schema.merchantRules)
    .values({
      workspaceId: workspaceId ?? null,
      merchantKey: input.merchantKey,
      label: input.label,
      category: input.category,
      isTransfer: input.isTransfer ?? false,
    })
    .returning();

  return insertedRule!;
}

export interface UpdateMerchantRuleInput {
  category?: string;
  label?: string;
  isTransfer?: boolean;
}

/**
 * Update a merchant rule by ID. Returns updated rule or null if not found.
 */
export async function updateMerchantRule(
  database: DB,
  id: number,
  input: UpdateMerchantRuleInput,
  workspaceId?: number,
): Promise<MerchantRuleRow | null> {
  const [existing] = await database
    .select()
    .from(schema.merchantRules)
    .where(
      workspaceId === undefined
        ? eq(schema.merchantRules.id, id)
        : and(eq(schema.merchantRules.id, id), eq(schema.merchantRules.workspaceId, workspaceId)),
    )
    .limit(1);

  if (!existing) return null;

  const updates: Record<string, unknown> = {};
  if (input.category !== undefined) updates.category = input.category;
  if (input.label !== undefined) updates.label = input.label;
  if (input.isTransfer !== undefined) updates.isTransfer = input.isTransfer;
  updates.updatedAt = new Date().toISOString();

  await database
    .update(schema.merchantRules)
    .set(updates)
    .where(eq(schema.merchantRules.id, id));

  const [updatedRule] = await database
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
    .limit(1);

  return updatedRule!;
}

/**
 * Delete a merchant rule by ID. Returns true if found and deleted.
 */
export function deleteMerchantRule(database: DB, id: number): Promise<boolean> {
  return deleteMerchantRuleForWorkspace(database, id, undefined);
}

export function deleteMerchantRuleForWorkspace(
  database: DB,
  id: number,
  workspaceId?: number,
): Promise<boolean> {
  return (async () => {
    const [existing] = await database
    .select()
    .from(schema.merchantRules)
    .where(
      workspaceId === undefined
        ? eq(schema.merchantRules.id, id)
        : and(eq(schema.merchantRules.id, id), eq(schema.merchantRules.workspaceId, workspaceId)),
    )
    .limit(1);

    if (!existing) return false;

    await database
    .delete(schema.merchantRules)
    .where(
      workspaceId === undefined
        ? eq(schema.merchantRules.id, id)
        : and(eq(schema.merchantRules.id, id), eq(schema.merchantRules.workspaceId, workspaceId)),
    );

    return true;
  })();
}
