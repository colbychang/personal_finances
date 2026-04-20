import { ArrowLeftRight } from "lucide-react";
import { db } from "@/db/index";
import { getAccountsForFilter } from "@/db/queries/transactions";
import { getAllCategories } from "@/db/queries/categories";
import { PublicProfileNotice } from "@/components/public/PublicProfileNotice";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import { isPublicProfileMode } from "@/lib/deployment";
import { TransactionsClient } from "./TransactionsClient";

type TransactionsPageProps = {
  searchParams?: Promise<{
    dateFrom?: string | string[];
    dateTo?: string | string[];
    effectiveMonth?: string | string[];
    category?: string | string[];
    accountId?: string | string[];
    needsReview?: string | string[];
  }>;
};

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  if (isPublicProfileMode()) {
    return <PublicProfileNotice />;
  }

  const { workspace } = await requireCurrentWorkspace();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const dateFromParam = resolvedSearchParams?.dateFrom;
  const dateToParam = resolvedSearchParams?.dateTo;
  const categoryParam = resolvedSearchParams?.category;
  const accountIdParam = resolvedSearchParams?.accountId;
  const effectiveMonthParam = resolvedSearchParams?.effectiveMonth;
  const needsReviewParam = resolvedSearchParams?.needsReview;
  const initialDateFrom = Array.isArray(dateFromParam)
    ? dateFromParam[0] ?? ""
    : dateFromParam ?? "";
  const initialDateTo = Array.isArray(dateToParam)
    ? dateToParam[0] ?? ""
    : dateToParam ?? "";
  const initialSelectedCategories = Array.isArray(categoryParam)
    ? categoryParam.flatMap((value) =>
        value
          .split(",")
          .map((category) => category.trim())
          .filter(Boolean)
      )
    : categoryParam
      ? categoryParam
          .split(",")
          .map((category) => category.trim())
          .filter(Boolean)
      : [];
  const accountIdValue = Array.isArray(accountIdParam)
    ? accountIdParam[0]
    : accountIdParam;
  const effectiveMonthValue = Array.isArray(effectiveMonthParam)
    ? effectiveMonthParam[0]
    : effectiveMonthParam;
  const initialSelectedAccountId =
    accountIdValue && /^\d+$/.test(accountIdValue) ? accountIdValue : "";
  const initialEffectiveMonth =
    effectiveMonthValue && /^\d{4}-\d{2}$/.test(effectiveMonthValue)
      ? effectiveMonthValue
      : "";
  const initialNeedsReview = Array.isArray(needsReviewParam)
    ? needsReviewParam.includes("1") || needsReviewParam.includes("true")
    : needsReviewParam === "1" || needsReviewParam === "true";

  // Keep the document navigation lightweight. The Transactions client already
  // knows how to fetch its full result set after mount.
  const initialData = {
    transactions: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  };
  const [accounts, categories] = await Promise.all([
    getAccountsForFilter(db, workspace.workspaceId),
    getAllCategories(db),
  ]);

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
        initialDateFrom={initialDateFrom}
        initialDateTo={initialDateTo}
        initialSelectedCategories={initialSelectedCategories}
        initialSelectedAccountId={initialSelectedAccountId}
        initialEffectiveMonth={initialEffectiveMonth}
        initialNeedsReview={initialNeedsReview}
        shouldHydrateOnMount
      />
    </div>
  );
}
