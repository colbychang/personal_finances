import { BarChart3 } from "lucide-react";
import { PublicProfileNotice } from "@/components/public/PublicProfileNotice";
import { isPublicProfileMode } from "@/lib/deployment";
import { AnalyticsClient } from "./AnalyticsClient";

export default async function AnalyticsPage() {
  if (isPublicProfileMode()) {
    return <PublicProfileNotice />;
  }

  // Default period: current month
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  const startDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
  const endMonthDate = new Date(currentYear, currentMonth + 1, 1);
  const endDate = `${endMonthDate.getFullYear()}-${String(endMonthDate.getMonth() + 1).padStart(2, "0")}-01`;

  const initialData = {
    period: "month",
    startDate,
    endDate,
    totalSpending: 0,
    spendingByCategory: [],
    monthlyTrends: [],
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">
          Spending Analytics
        </h1>
      </div>
      <AnalyticsClient initialData={initialData} shouldHydrateOnMount />
    </div>
  );
}
