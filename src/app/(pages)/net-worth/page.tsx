import { TrendingUp } from "lucide-react";
import { db } from "@/db/index";
import { getAllSnapshots, getAccountBalanceHistory } from "@/db/queries/snapshots";
import { NetWorthClient } from "./NetWorthClient";

export default function NetWorthPage() {
  const snapshots = getAllSnapshots(db);
  const accountHistory = getAccountBalanceHistory(db);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Net Worth</h1>
      </div>
      <NetWorthClient
        initialSnapshots={snapshots}
        initialAccountHistory={accountHistory}
      />
    </div>
  );
}
