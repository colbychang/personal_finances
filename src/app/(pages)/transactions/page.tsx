import { ArrowLeftRight } from "lucide-react";
import { db } from "@/db/index";
import { getTransactions, getAccountsForFilter } from "@/db/queries/transactions";
import { getAllCategories } from "@/db/queries/categories";
import { PublicProfileNotice } from "@/components/public/PublicProfileNotice";
import { isPublicProfileMode } from "@/lib/deployment";
import { TransactionsClient } from "./TransactionsClient";

type TransactionsPageProps = {
  searchParams?: Promise<{
    needsReview?: string | string[];
  }>;
};

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  if (isPublicProfileMode()) {
    return <PublicProfileNotice />;
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const needsReviewParam = resolvedSearchParams?.needsReview;
  const initialNeedsReview = Array.isArray(needsReviewParam)
    ? needsReviewParam.includes("1") || needsReviewParam.includes("true")
    : needsReviewParam === "1" || needsReviewParam === "true";

  // Fetch initial data server-side
  const initialData = getTransactions(db, {
    page: 1,
    limit: 20,
    needsReview: initialNeedsReview,
  });
  const accounts = getAccountsForFilter(db);
  const categories = getAllCategories(db);

  // Build category color map for the client
  const categoryColors = categories.map((c) => ({
    name: c.name,
    color: c.color,
  }));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ArrowLeftRight className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Transactions</h1>
      </div>
      <TransactionsClient
        initialData={initialData}
        accounts={accounts}
        categoryColors={categoryColors}
        initialNeedsReview={initialNeedsReview}
      />
    </div>
  );
}
