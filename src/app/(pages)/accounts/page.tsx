import { Landmark } from "lucide-react";
import { db } from "@/db/index";
import { getAllAccountsGrouped } from "@/db/queries/accounts";
import { PlaidSetupNotice } from "@/components/plaid/PlaidSetupNotice";
import { AccountsClient } from "./AccountsClient";

export default function AccountsPage() {
  const sections = getAllAccountsGrouped(db);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Landmark className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-neutral-900">Accounts</h1>
        </div>
      </div>
      <PlaidSetupNotice />
      <AccountsClient initialSections={sections} />
    </div>
  );
}
