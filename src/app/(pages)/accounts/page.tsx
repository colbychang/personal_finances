import { Landmark } from "lucide-react";

export default function AccountsPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-4">
        <Landmark className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Accounts</h1>
      </div>
      <p className="text-neutral-500">
        Manage your bank accounts, credit cards, and investments. View balances
        grouped by account type.
      </p>
    </div>
  );
}
