import { TrendingUp } from "lucide-react";

export default function NetWorthPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-4">
        <TrendingUp className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Net Worth</h1>
      </div>
      <p className="text-neutral-500">
        Track your net worth over time with monthly balance snapshots. View
        assets, liabilities, and trends.
      </p>
    </div>
  );
}
