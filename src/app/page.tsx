import { LayoutDashboard } from "lucide-react";
import type { DashboardData } from "@/db/queries/dashboard";
import { PublicProfileNotice } from "@/components/public/PublicProfileNotice";
import { isPublicProfileMode } from "@/lib/deployment";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  if (isPublicProfileMode()) {
    return <PublicProfileNotice />;
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const data: DashboardData = {
    totalSpending: 0,
    spendingByCategory: [],
    budgetStatus: {
      onTrack: 0,
      approaching: 0,
      overBudget: 0,
      total: 0,
      items: [],
    },
    recentTransactions: [],
    netWorth: {
      current: 0,
      previous: null,
      change: null,
    },
    netWorthHistory: [],
    monthComparison: [],
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <LayoutDashboard className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
      </div>
      <DashboardClient
        initialData={data}
        initialMonth={currentMonth}
        shouldHydrateOnMount
      />
    </div>
  );
}
