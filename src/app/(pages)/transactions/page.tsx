import { ArrowLeftRight } from "lucide-react";
import { db } from "@/db/index";
import { getTransactions, getAccountsForFilter } from "@/db/queries/transactions";
import { getAllCategories } from "@/db/queries/categories";
import { TransactionsClient } from "./TransactionsClient";

export default function TransactionsPage() {
  // Fetch initial data server-side
  const initialData = getTransactions(db, { page: 1, limit: 20 });
  const accounts = getAccountsForFilter(db);
  const categories = getAllCategories(db);

  // Build category color map for the client
  const categoryColors = categories.map((c) => ({
    name: c.name,
    color: c.color,
  }));

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ArrowLeftRight className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Transactions</h1>
      </div>
      <TransactionsClient
        initialData={initialData}
        accounts={accounts}
        categoryColors={categoryColors}
      />
    </div>
  );
}
