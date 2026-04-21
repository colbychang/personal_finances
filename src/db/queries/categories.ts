import { eq, asc, and, or, isNull } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "../schema";

type DB = AppDatabase;

// Default colors for custom categories (cycled through)
const CUSTOM_COLORS = [
  "#e11d48", // rose-600
  "#0891b2", // cyan-600
  "#7c3aed", // violet-600
  "#059669", // emerald-600
  "#d97706", // amber-600
  "#dc2626", // red-600
  "#2563eb", // blue-600
  "#9333ea", // purple-600
  "#ca8a04", // yellow-600
  "#0d9488", // teal-600
];

const DEFAULT_ICON = "tag";

export interface CategoryRow {
  id: number;
  workspaceId: number | null;
  name: string;
  color: string | null;
  icon: string | null;
  isPredefined: boolean;
  sortOrder: number;
}

function visibleCategoryCondition(workspaceId?: number) {
  if (workspaceId === undefined) {
    return undefined;
  }

  return or(
    and(
      eq(schema.categories.isPredefined, true),
      isNull(schema.categories.workspaceId),
    ),
    eq(schema.categories.workspaceId, workspaceId),
  );
}

function categoryNameCondition(name: string, workspaceId?: number) {
  if (workspaceId === undefined) {
    return eq(schema.categories.name, name);
  }

  return and(
    eq(schema.categories.name, name),
    visibleCategoryCondition(workspaceId),
  );
}

/**
 * Get all categories ordered by sort_order, then name.
 */
export async function getAllCategories(database: DB, workspaceId?: number): Promise<CategoryRow[]> {
  return await database
    .select({
      id: schema.categories.id,
      workspaceId: schema.categories.workspaceId,
      name: schema.categories.name,
      color: schema.categories.color,
      icon: schema.categories.icon,
      isPredefined: schema.categories.isPredefined,
      sortOrder: schema.categories.sortOrder,
    })
    .from(schema.categories)
    .where(visibleCategoryCondition(workspaceId))
    .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
}

export interface CreateCategoryInput {
  name: string;
  color?: string;
  icon?: string;
}

/**
 * Create a custom category. Throws if name is duplicate (UNIQUE constraint).
 */
export async function createCategory(
  database: DB,
  input: CreateCategoryInput,
  workspaceId?: number,
): Promise<CategoryRow> {
  const trimmedName = input.name.trim();

  const existing = await getCategoryByName(database, trimmedName, workspaceId);
  if (existing) {
    throw new Error(`A category named "${trimmedName}" already exists`);
  }

  // Pick a default color based on existing custom category count
  const existingCustom = await database
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.isPredefined, false),
        workspaceId === undefined
          ? undefined
          : eq(schema.categories.workspaceId, workspaceId),
      ),
    );

  const color = input.color ?? CUSTOM_COLORS[existingCustom.length % CUSTOM_COLORS.length];
  const icon = input.icon ?? DEFAULT_ICON;

  const [result] = await database
    .insert(schema.categories)
    .values({
      workspaceId: workspaceId ?? null,
      name: trimmedName,
      color,
      icon,
      isPredefined: false,
      sortOrder: 100,
    })
    .returning();

  return result;
}

/**
 * Get a category by name. Returns null if not found.
 */
export async function getCategoryByName(
  database: DB,
  name: string,
  workspaceId?: number,
): Promise<CategoryRow | null> {
  const [row] = await database
    .select({
      id: schema.categories.id,
      workspaceId: schema.categories.workspaceId,
      name: schema.categories.name,
      color: schema.categories.color,
      icon: schema.categories.icon,
      isPredefined: schema.categories.isPredefined,
      sortOrder: schema.categories.sortOrder,
    })
    .from(schema.categories)
    .where(categoryNameCondition(name, workspaceId))
    .limit(1);

  return row ?? null;
}
