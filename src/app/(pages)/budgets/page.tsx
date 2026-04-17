import { PiggyBank } from "lucide-react";
import { db } from "@/db/index";
import { getBudgetsForMonth, getBudgetTemplates } from "@/db/queries/budgets";
import { getAllCategories } from "@/db/queries/categories";
import { getAccountsForFilter } from "@/db/queries/transactions";
import { PublicProfileNotice } from "@/components/public/PublicProfileNotice";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import { isPublicProfileMode } from "@/lib/deployment";
import { BudgetsClient } from "./BudgetsClient";

type BudgetsPageProps = {
  searchParams?: Promise<{
    month?: string | string[];
  }>;
};

export default async function BudgetsPage({ searchParams }: BudgetsPageProps) {
  if (isPublicProfileMode()) {
    return <PublicProfileNotice />;
  }

  const { workspace } = await requireCurrentWorkspace();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const monthParam = resolvedSearchParams?.month;
  const monthValue = Array.isArray(monthParam) ? monthParam[0] : monthParam;

  // Default to current month
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const activeMonth =
    monthValue && /^\d{4}-\d{2}$/.test(monthValue) ? monthValue : currentMonth;

  // Fetch initial data server-side
  const initialData = await getBudgetsForMonth(db, activeMonth, workspace.workspaceId);
  const initialBudgetTemplates = await getBudgetTemplates(db, workspace.workspaceId);
  const categories = await getAllCategories(db);
  const accounts = await getAccountsForFilter(db, workspace.workspaceId);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <PiggyBank className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Budgets</h1>
      </div>
      <BudgetsClient
        initialMonth={activeMonth}
        initialData={initialData}
        categories={categories}
        accounts={accounts}
        initialBudgetTemplates={initialBudgetTemplates}
      />
    </div>
  );
}
