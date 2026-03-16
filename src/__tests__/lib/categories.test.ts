import { describe, it, expect } from "vitest";
import { PREDEFINED_CATEGORIES } from "@/lib/categories";

describe("PREDEFINED_CATEGORIES", () => {
  it("has 11 predefined categories", () => {
    expect(PREDEFINED_CATEGORIES).toHaveLength(11);
  });

  it("each category has name, color, and icon", () => {
    for (const category of PREDEFINED_CATEGORIES) {
      expect(category.name).toBeTruthy();
      expect(category.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(category.icon).toBeTruthy();
    }
  });

  it("includes all expected categories", () => {
    const names = PREDEFINED_CATEGORIES.map((c) => c.name);
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
});
