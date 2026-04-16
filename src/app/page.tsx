import { LayoutDashboard } from "lucide-react";
import { db } from "@/db/index";
import { getDashboardData } from "@/db/queries/dashboard";
import { PublicProfileNotice } from "@/components/public/PublicProfileNotice";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import { isPublicProfileMode } from "@/lib/deployment";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  if (isPublicProfileMode()) {
    return <PublicProfileNotice />;
  }

  const { workspace } = await requireCurrentWorkspace();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const data = getDashboardData(db, currentMonth, workspace.workspaceId);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <LayoutDashboard className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
      </div>
      <DashboardClient initialData={data} initialMonth={currentMonth} />
    </div>
  );
}
