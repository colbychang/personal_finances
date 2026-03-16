import { eq, asc } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";

type DB = ReturnType<typeof drizzle>;

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
  name: string;
  color: string | null;
  icon: string | null;
  isPredefined: boolean;
  sortOrder: number;
}

/**
 * Get all categories ordered by sort_order, then name.
 */
export function getAllCategories(database: DB): CategoryRow[] {
  return database
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      color: schema.categories.color,
      icon: schema.categories.icon,
      isPredefined: schema.categories.isPredefined,
      sortOrder: schema.categories.sortOrder,
    })
    .from(schema.categories)
    .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name))
    .all();
}

export interface CreateCategoryInput {
  name: string;
  color?: string;
  icon?: string;
}

/**
 * Create a custom category. Throws if name is duplicate (UNIQUE constraint).
 */
export function createCategory(database: DB, input: CreateCategoryInput): CategoryRow {
  const trimmedName = input.name.trim();

  // Pick a default color based on existing custom category count
  const existingCustom = database
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(eq(schema.categories.isPredefined, false))
    .all();

  const color = input.color ?? CUSTOM_COLORS[existingCustom.length % CUSTOM_COLORS.length];
  const icon = input.icon ?? DEFAULT_ICON;

  const result = database
    .insert(schema.categories)
    .values({
      name: trimmedName,
      color,
      icon,
      isPredefined: false,
      sortOrder: 100,
    })
    .returning()
    .get();

  return result;
}

/**
 * Get a category by name. Returns null if not found.
 */
export function getCategoryByName(database: DB, name: string): CategoryRow | null {
  const row = database
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      color: schema.categories.color,
      icon: schema.categories.icon,
      isPredefined: schema.categories.isPredefined,
      sortOrder: schema.categories.sortOrder,
    })
    .from(schema.categories)
    .where(eq(schema.categories.name, name))
    .get();

  return row ?? null;
}
