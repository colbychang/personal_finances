import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { AppDatabase } from "@/db/index";
import {
  getAllCategories,
  createCategory,
  getCategoryByName,
} from "@/db/queries/categories";
import { seedCategories } from "@/db/seed";
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

describe("getAllCategories", () => {
  it("returns all predefined categories after seeding", async () => {
    await seedCategories(db);

    const categories = await getAllCategories(db);
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

  it("returns categories with color, icon, and is_predefined fields", async () => {
    await seedCategories(db);

    const categories = await getAllCategories(db);
    const rent = categories.find((c) => c.name === "Rent/Home")!;

    expect(rent.color).toBe("#8b5cf6");
    expect(rent.icon).toBe("home");
    expect(rent.isPredefined).toBe(true);
  });

  it("returns both predefined and custom categories", async () => {
    await seedCategories(db);

    // Add a custom category
    await createCategory(db, { name: "Pet Care" });

    const categories = await getAllCategories(db);
    expect(categories).toHaveLength(12);

    const petCare = categories.find((c) => c.name === "Pet Care")!;
    expect(petCare.isPredefined).toBe(false);
    expect(petCare.name).toBe("Pet Care");
  });

  it("returns categories sorted by sort_order then name", async () => {
    await seedCategories(db);

    const categories = await getAllCategories(db);
    // Predefined have sort_order 1-11; custom have sort_order 100+
    expect(categories[0].name).toBe("Rent/Home"); // sort_order 1
    expect(categories[10].name).toBe("Large Purchases"); // sort_order 11
  });

  it("returns empty array when no categories exist", async () => {
    const categories = await getAllCategories(db);
    expect(categories).toHaveLength(0);
  });
});

describe("createCategory", () => {
  it("creates a custom category with default color and icon", async () => {
    const category = await createCategory(db, { name: "Pet Care" });

    expect(category.name).toBe("Pet Care");
    expect(category.isPredefined).toBe(false);
    expect(category.color).toBeTruthy(); // should have a default color
    expect(category.icon).toBeTruthy(); // should have a default icon
  });

  it("creates a custom category with provided color and icon", async () => {
    const category = await createCategory(db, {
      name: "Pet Care",
      color: "#ff6b6b",
      icon: "paw-print",
    });

    expect(category.color).toBe("#ff6b6b");
    expect(category.icon).toBe("paw-print");
  });

  it("rejects duplicate category name", async () => {
    await seedCategories(db);

    // Try to create a category with same name as predefined
    await expect(createCategory(db, { name: "Groceries" })).rejects.toThrow();
  });

  it("rejects duplicate custom category name", async () => {
    await createCategory(db, { name: "Pet Care" });

    await expect(createCategory(db, { name: "Pet Care" })).rejects.toThrow();
  });

  it("trims whitespace from category name", async () => {
    const category = await createCategory(db, { name: "  Pet Care  " });
    expect(category.name).toBe("Pet Care");
  });

  it("assigns a sort_order of 100 for custom categories", async () => {
    const category = await createCategory(db, { name: "Pet Care" });
    expect(category.sortOrder).toBe(100);
  });
});

describe("getCategoryByName", () => {
  it("returns category by name when it exists", async () => {
    await seedCategories(db);

    const category = await getCategoryByName(db, "Groceries");
    expect(category).toBeDefined();
    expect(category!.name).toBe("Groceries");
    expect(category!.isPredefined).toBe(true);
  });

  it("returns null when category does not exist", async () => {
    const category = await getCategoryByName(db, "Nonexistent");
    expect(category).toBeNull();
  });
});
