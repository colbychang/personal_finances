import { PiggyBank } from "lucide-react";

export default function BudgetsPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-4">
        <PiggyBank className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Budgets</h1>
      </div>
      <p className="text-neutral-500">
        Set and track monthly spending budgets by category. Compare budget vs
        actual spending with progress indicators.
      </p>
    </div>
  );
}
