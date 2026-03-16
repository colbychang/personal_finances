import { LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-4">
        <LayoutDashboard className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
      </div>
      <p className="text-neutral-500">
        Your financial overview — spending summary, budget status, recent
        transactions, and net worth trend at a glance.
      </p>
    </div>
  );
}
