/**
 * Predefined spending categories with colors and icons.
 */
export const PREDEFINED_CATEGORIES = [
  { name: "Rent/Home", color: "#8b5cf6", icon: "home" },
  { name: "Groceries", color: "#22c55e", icon: "shopping-cart" },
  { name: "Eating Out", color: "#f97316", icon: "utensils" },
  { name: "Bars/Clubs/Going Out", color: "#ec4899", icon: "wine" },
  { name: "Other Fun Activities", color: "#06b6d4", icon: "smile" },
  { name: "Clothing", color: "#a855f7", icon: "shirt" },
  { name: "Insurance", color: "#64748b", icon: "shield" },
  { name: "Subscriptions", color: "#6366f1", icon: "repeat" },
  { name: "Home Goods", color: "#14b8a6", icon: "lamp" },
  { name: "Vacations", color: "#f59e0b", icon: "plane" },
  { name: "Large Purchases", color: "#ef4444", icon: "credit-card" },
] as const;

export type PredefinedCategoryName =
  (typeof PREDEFINED_CATEGORIES)[number]["name"];
