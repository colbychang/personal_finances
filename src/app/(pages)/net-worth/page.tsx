import { TrendingUp } from "lucide-react";
import { db } from "@/db/index";
import { getAllSnapshots, getAccountBalanceHistory, getLiveNetWorth } from "@/db/queries/snapshots";
import { PublicProfileNotice } from "@/components/public/PublicProfileNotice";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import { isPublicProfileMode } from "@/lib/deployment";
import { NetWorthClient } from "./NetWorthClient";

export default async function NetWorthPage() {
  if (isPublicProfileMode()) {
    return <PublicProfileNotice />;
  }

  const { workspace } = await requireCurrentWorkspace();
  const [snapshots, accountHistory, liveNetWorth] = await Promise.all([
    getAllSnapshots(db, workspace.workspaceId),
    getAccountBalanceHistory(db, workspace.workspaceId),
    getLiveNetWorth(db, workspace.workspaceId),
  ]);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Net Worth</h1>
      </div>
      <NetWorthClient
        initialSnapshots={snapshots}
        initialAccountHistory={accountHistory}
        liveNetWorth={liveNetWorth}
      />
    </div>
  );
}
