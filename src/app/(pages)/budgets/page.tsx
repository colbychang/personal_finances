import { PiggyBank } from "lucide-react";
import { db } from "@/db/index";
import { getBudgetsForMonth } from "@/db/queries/budgets";
import { getAllCategories } from "@/db/queries/categories";
import { BudgetsClient } from "./BudgetsClient";

export default function BudgetsPage() {
  // Default to current month
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Fetch initial data server-side
  const initialData = getBudgetsForMonth(db, currentMonth);
  const categories = getAllCategories(db);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <PiggyBank className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Budgets</h1>
      </div>
      <BudgetsClient
        initialMonth={currentMonth}
        initialData={initialData}
        categories={categories}
      />
    </div>
  );
}
