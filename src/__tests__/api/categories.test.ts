import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  getAllCategories,
  createCategory,
  getCategoryByName,
} from "@/db/queries/categories";
import { seedCategories } from "@/db/seed";

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
  db.run(sql`DELETE FROM categories`);
});

describe("getAllCategories", () => {
  it("returns all predefined categories after seeding", () => {
    seedCategories(db);

    const categories = getAllCategories(db);
    expect(categories).toHaveLength(11);

    // Verify all predefined categories exist
    const names = categories.map((c) => c.name);
    expect(names).toContain("Rent/Home");
    expect(names).toContain("Groceries");
    expect(names).toContain("Eating Out");
    expect(names).toContain("Bars/Clubs/Going Out");
    expect(names).toContain("Other Fun Activities");
    expect(names).toContain("Clothing");
    expect(names).toContain("Insurance");
    expect(names).toContain("Subscriptions");
    expect(names).toContain("Home Goods");
    expect(names).toContain("Vacations");
    expect(names).toContain("Large Purchases");
  });

  it("returns categories with color, icon, and is_predefined fields", () => {
    seedCategories(db);

    const categories = getAllCategories(db);
    const rent = categories.find((c) => c.name === "Rent/Home")!;

    expect(rent.color).toBe("#8b5cf6");
    expect(rent.icon).toBe("home");
    expect(rent.isPredefined).toBe(true);
  });

  it("returns both predefined and custom categories", () => {
    seedCategories(db);

    // Add a custom category
    createCategory(db, { name: "Pet Care" });

    const categories = getAllCategories(db);
    expect(categories).toHaveLength(12);

    const petCare = categories.find((c) => c.name === "Pet Care")!;
    expect(petCare.isPredefined).toBe(false);
    expect(petCare.name).toBe("Pet Care");
  });

  it("returns categories sorted by sort_order then name", () => {
    seedCategories(db);

    const categories = getAllCategories(db);
    // Predefined have sort_order 1-11; custom have sort_order 100+
    expect(categories[0].name).toBe("Rent/Home"); // sort_order 1
    expect(categories[10].name).toBe("Large Purchases"); // sort_order 11
  });

  it("returns empty array when no categories exist", () => {
    const categories = getAllCategories(db);
    expect(categories).toHaveLength(0);
  });
});

describe("createCategory", () => {
  it("creates a custom category with default color and icon", () => {
    const category = createCategory(db, { name: "Pet Care" });

    expect(category.name).toBe("Pet Care");
    expect(category.isPredefined).toBe(false);
    expect(category.color).toBeTruthy(); // should have a default color
    expect(category.icon).toBeTruthy(); // should have a default icon
  });

  it("creates a custom category with provided color and icon", () => {
    const category = createCategory(db, {
      name: "Pet Care",
      color: "#ff6b6b",
      icon: "paw-print",
    });

    expect(category.color).toBe("#ff6b6b");
    expect(category.icon).toBe("paw-print");
  });

  it("rejects duplicate category name", () => {
    seedCategories(db);

    // Try to create a category with same name as predefined
    expect(() => createCategory(db, { name: "Groceries" })).toThrow();
  });

  it("rejects duplicate custom category name", () => {
    createCategory(db, { name: "Pet Care" });

    expect(() => createCategory(db, { name: "Pet Care" })).toThrow();
  });

  it("trims whitespace from category name", () => {
    const category = createCategory(db, { name: "  Pet Care  " });
    expect(category.name).toBe("Pet Care");
  });

  it("assigns a sort_order of 100 for custom categories", () => {
    const category = createCategory(db, { name: "Pet Care" });
    expect(category.sortOrder).toBe(100);
  });
});

describe("getCategoryByName", () => {
  it("returns category by name when it exists", () => {
    seedCategories(db);

    const category = getCategoryByName(db, "Groceries");
    expect(category).toBeDefined();
    expect(category!.name).toBe("Groceries");
    expect(category!.isPredefined).toBe(true);
  });

  it("returns null when category does not exist", () => {
    const category = getCategoryByName(db, "Nonexistent");
    expect(category).toBeNull();
  });
});
