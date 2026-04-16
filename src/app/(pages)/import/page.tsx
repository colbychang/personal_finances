import { Upload } from "lucide-react";
import { db } from "@/db/index";
import { getAccountsForFilter } from "@/db/queries/transactions";
import { PublicProfileNotice } from "@/components/public/PublicProfileNotice";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import { isPublicProfileMode } from "@/lib/deployment";
import { ImportClient } from "./ImportClient";

export default async function ImportPage() {
  if (isPublicProfileMode()) {
    return <PublicProfileNotice />;
  }

  const { workspace } = await requireCurrentWorkspace();
  const accounts = getAccountsForFilter(db, workspace.workspaceId);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Upload className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Import</h1>
      </div>
      <p className="text-neutral-500 mb-6">
        Import transactions from CSV files. Map columns, preview data, and
        detect duplicates before importing.
      </p>
      <ImportClient accounts={accounts} />
    </div>
  );
}
