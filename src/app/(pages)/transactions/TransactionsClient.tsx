"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  Calendar,
  Receipt,
  Plus,
  Pencil,
  Trash2,
  Scissors,
  Sparkles,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { CategorySelect } from "@/components/categories/CategorySelect";
import { useToast } from "@/components/ui/Toast";
import {
  TransactionForm,
  DeleteTransactionDialog,
  SplitEditor,
} from "@/components/transactions";
import type { TransactionFormData } from "@/components/transactions";

// ─── Types ──────────────────────────────────────────────────────────────

interface Transaction {
  id: number;
  accountId: number;
  postedAt: string;
  name: string;
  merchant: string | null;
  amount: number; // cents
  category: string | null;
  pending: boolean;
  notes: string | null;
  isTransfer: boolean;
  accountName: string;
}

interface PaginatedResult {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface AccountOption {
  id: number;
  name: string;
  type: string;
}

interface CategoryColor {
  name: string;
  color: string | null;
}

interface TransactionsClientProps {
  initialData: PaginatedResult;
  accounts: AccountOption[];
  categoryColors: CategoryColor[];
}

// ─── Constants ──────────────────────────────────────────────────────────

const PAGE_LIMIT = 20;

// ─── Component ──────────────────────────────────────────────────────────

export function TransactionsClient({
  initialData,
  accounts,
  categoryColors,
}: TransactionsClientProps) {
  const { showToast } = useToast();

  // Filter state
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [page, setPage] = useState(1);

  // Data state
  const [data, setData] = useState<PaginatedResult>(initialData);
  const [isLoading, setIsLoading] = useState(false);

  // Mobile filter drawer
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // CRUD state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [splittingTransaction, setSplittingTransaction] = useState<Transaction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Categorization state
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [categorizeResult, setCategorizeResult] = useState<{
    message: string;
    aiError?: string;
  } | null>(null);

  // Debounce timer for search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track whether this is the first render (skip fetching on mount)
  const isFirstRender = useRef(true);

  // Build query string from current filters
  const buildQueryString = useCallback(
    (overrides?: { searchOverride?: string; pageOverride?: number }) => {
      const params = new URLSearchParams();
      const searchVal = overrides?.searchOverride ?? search;
      const pageVal = overrides?.pageOverride ?? page;

      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (selectedCategories.length > 0) {
        params.set("category", selectedCategories.join(","));
      }
      if (selectedAccountId) params.set("accountId", selectedAccountId);
      if (searchVal) params.set("search", searchVal);
      params.set("page", String(pageVal));
      params.set("limit", String(PAGE_LIMIT));

      return params.toString();
    },
    [search, dateFrom, dateTo, selectedCategories, selectedAccountId, page]
  );

  // Fetch transactions from API
  const fetchTransactions = useCallback(
    async (overrides?: { searchOverride?: string; pageOverride?: number }) => {
      setIsLoading(true);
      try {
        const qs = buildQueryString(overrides);
        const res = await fetch(`/api/transactions?${qs}`);
        if (res.ok) {
          const result: PaginatedResult = await res.json();
          setData(result);
        }
      } catch (error) {
        console.error("Failed to fetch transactions:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [buildQueryString]
  );

  // Re-fetch when filters change (not search - that uses debounce)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchTransactions({ pageOverride: page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, selectedCategories, selectedAccountId, page]);

  // Debounced search
  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchTransactions({ searchOverride: value, pageOverride: 1 });
    }, 300);
  }

  // Reset page to 1 when filters change
  function applyFilter(setter: () => void) {
    setter();
    setPage(1);
  }

  // Clear all filters
  function clearFilters() {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setSelectedCategories([]);
    setSelectedAccountId("");
    setPage(1);
    // fetch with empty filters
    setTimeout(() => {
      fetchTransactions({
        searchOverride: "",
        pageOverride: 1,
      });
    }, 0);
  }

  const hasActiveFilters =
    search || dateFrom || dateTo || selectedCategories.length > 0 || selectedAccountId;

  // Get category color by name
  function getCategoryColor(categoryName: string | null): string {
    if (!categoryName) return "#94a3b8";
    const found = categoryColors.find((c) => c.name === categoryName);
    return found?.color ?? "#94a3b8";
  }

  // ─── CRUD Handlers ─────────────────────────────────────────────

  async function handleAddTransaction(formData: TransactionFormData) {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: formData.date,
          name: formData.name,
          amount: parseFloat(formData.amount),
          accountId: parseInt(formData.accountId, 10),
          category: formData.category || undefined,
          notes: formData.notes || undefined,
          isTransfer: formData.isTransfer,
          type: formData.type,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        showToast(errData.error || "Failed to create transaction");
        return;
      }

      setShowAddForm(false);
      await fetchTransactions({ pageOverride: page });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEditTransaction(formData: TransactionFormData) {
    if (!editingTransaction) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/transactions/${editingTransaction.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: formData.date,
          name: formData.name,
          amount: parseFloat(formData.amount),
          accountId: parseInt(formData.accountId, 10),
          category: formData.category || null,
          notes: formData.notes || null,
          isTransfer: formData.isTransfer,
          type: formData.type,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        showToast(errData.error || "Failed to update transaction");
        return;
      }

      setEditingTransaction(null);
      await fetchTransactions({ pageOverride: page });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteTransaction() {
    if (!deletingTransaction) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/transactions/${deletingTransaction.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        showToast("Failed to delete transaction");
        return;
      }

      setDeletingTransaction(null);
      await fetchTransactions({ pageOverride: page });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSplitSaved() {
    setSplittingTransaction(null);
    fetchTransactions({ pageOverride: page });
  }

  // ─── Get form initial data from a transaction ─────────────────

  function getEditFormData(txn: Transaction): TransactionFormData {
    const isIncome = txn.amount < 0;
    const absAmount = Math.abs(txn.amount) / 100;
    return {
      date: txn.postedAt,
      name: txn.name,
      amount: absAmount.toFixed(2),
      type: isIncome ? "income" : "expense",
      accountId: String(txn.accountId),
      category: txn.category ?? "",
      notes: txn.notes ?? "",
      isTransfer: txn.isTransfer,
    };
  }

  // ─── Categorize Handler ──────────────────────────────────────

  async function handleCategorizeAll() {
    setIsCategorizing(true);
    setCategorizeResult(null);
    try {
      const res = await fetch("/api/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });

      const result = await res.json();

      if (!res.ok) {
        showToast(result.error || "Failed to categorize transactions");
        setCategorizeResult({
          message: result.error || "Categorization failed",
          aiError: result.error,
        });
        return;
      }

      if (result.aiError) {
        showToast(result.message || "Some transactions could not be categorized");
        setCategorizeResult({
          message: result.message,
          aiError: result.aiError,
        });
      } else if (result.total > 0) {
        showToast(result.message, "success");
        setCategorizeResult({ message: result.message });
      } else {
        showToast("No uncategorized transactions to process", "success");
        setCategorizeResult({ message: "No uncategorized transactions to process" });
      }

      // Refresh the transaction list
      await fetchTransactions({ pageOverride: page });
    } catch (error) {
      console.error("Categorization failed:", error);
      showToast("Failed to categorize transactions. Please try again.");
      setCategorizeResult({
        message: "Failed to categorize. Please try again.",
        aiError: "Network error",
      });
    } finally {
      setIsCategorizing(false);
    }
  }

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div>
      {/* ─── Categorize Result Banner ──────────────────────────── */}
      {categorizeResult && (
        <div
          className={cn(
            "mb-4 px-4 py-3 rounded-[var(--radius-card)] text-sm flex items-center justify-between gap-2",
            categorizeResult.aiError
              ? "bg-amber-50 border border-amber-200 text-amber-800"
              : "bg-green-50 border border-green-200 text-green-800"
          )}
        >
          <p>{categorizeResult.message}</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            {categorizeResult.aiError && (
              <button
                onClick={handleCategorizeAll}
                disabled={isCategorizing}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-[var(--radius-button)] transition-colors min-h-[32px]"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            )}
            <button
              onClick={() => setCategorizeResult(null)}
              className="p-1 text-neutral-400 hover:text-neutral-600"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Add Transaction Button + Categorize + Search + Filter ──────────── */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-[var(--radius-button)] font-medium hover:bg-primary-dark transition-colors min-h-[44px] flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Transaction</span>
        </button>

        {/* Categorize All Button */}
        <button
          onClick={handleCategorizeAll}
          disabled={isCategorizing}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-[var(--radius-button)] font-medium hover:bg-violet-700 transition-colors min-h-[44px] flex-shrink-0 disabled:opacity-50"
          title="Auto-categorize uncategorized transactions"
        >
          {isCategorizing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {isCategorizing ? "Categorizing..." : "Categorize"}
          </span>
        </button>

        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search transactions..."
            className="w-full pl-10 pr-3 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-sm min-h-[44px] focus:ring-primary focus:border-primary"
          />
          {search && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Mobile filter button */}
        <button
          onClick={() => setIsFilterOpen(true)}
          className={cn(
            "md:hidden flex items-center justify-center w-11 h-11 rounded-[var(--radius-button)] border transition-colors",
            hasActiveFilters
              ? "border-primary bg-primary/5 text-primary"
              : "border-neutral-300 text-neutral-500 hover:border-neutral-400"
          )}
          aria-label="Open filters"
        >
          <SlidersHorizontal className="h-5 w-5" />
          {hasActiveFilters && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
          )}
        </button>
      </div>

      {/* ─── Desktop Filter Bar ───────────────────────────────────── */}
      <div className="hidden md:flex items-end gap-3 mb-6 flex-wrap">
        {/* Date From */}
        <div className="flex-shrink-0">
          <label className="block text-xs font-medium text-neutral-500 mb-1">
            From
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) =>
              applyFilter(() => setDateFrom(e.target.value))
            }
            className="px-3 py-2 rounded-[var(--radius-button)] border border-neutral-300 text-sm min-h-[40px] focus:ring-primary"
          />
        </div>

        {/* Date To */}
        <div className="flex-shrink-0">
          <label className="block text-xs font-medium text-neutral-500 mb-1">
            To
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) =>
              applyFilter(() => setDateTo(e.target.value))
            }
            className="px-3 py-2 rounded-[var(--radius-button)] border border-neutral-300 text-sm min-h-[40px] focus:ring-primary"
          />
        </div>

        {/* Category multi-select */}
        <div className="w-52">
          <label className="block text-xs font-medium text-neutral-500 mb-1">
            Category
          </label>
          <CategorySelect
            value=""
            onChange={() => {}}
            multiple
            selectedValues={selectedCategories}
            onMultiChange={(vals) =>
              applyFilter(() => setSelectedCategories(vals))
            }
            placeholder="All categories"
          />
        </div>

        {/* Account dropdown */}
        <div className="w-48">
          <label className="block text-xs font-medium text-neutral-500 mb-1">
            Account
          </label>
          <select
            value={selectedAccountId}
            onChange={(e) =>
              applyFilter(() => setSelectedAccountId(e.target.value))
            }
            className="w-full px-3 py-2 rounded-[var(--radius-button)] border border-neutral-300 text-sm min-h-[40px] bg-white focus:ring-primary"
          >
            <option value="">All accounts</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={String(acc.id)}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-2 text-sm text-neutral-500 hover:text-neutral-700 min-h-[40px]"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* ─── Mobile Filter Drawer ─────────────────────────────────── */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsFilterOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-neutral-900">Filters</h2>
              <button
                onClick={() => setIsFilterOpen(false)}
                className="p-2 rounded-[var(--radius-button)] text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
                aria-label="Close filters"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Date Range */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Date Range
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-sm min-h-[44px]"
                  />
                  <span className="text-neutral-400 text-sm">to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-sm min-h-[44px]"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Category
                </label>
                <CategorySelect
                  value=""
                  onChange={() => {}}
                  multiple
                  selectedValues={selectedCategories}
                  onMultiChange={setSelectedCategories}
                  placeholder="All categories"
                />
              </div>

              {/* Account */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Account
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-sm min-h-[44px] bg-white"
                >
                  <option value="">All accounts</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={String(acc.id)}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  clearFilters();
                  setIsFilterOpen(false);
                }}
                className="flex-1 px-4 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors min-h-[44px]"
              >
                Clear All
              </button>
              <button
                onClick={() => {
                  setPage(1);
                  setIsFilterOpen(false);
                  fetchTransactions({ pageOverride: 1 });
                }}
                className="flex-1 px-4 py-2.5 rounded-[var(--radius-button)] bg-primary text-white font-medium hover:bg-primary-dark transition-colors min-h-[44px]"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Results Summary ──────────────────────────────────────── */}
      {hasActiveFilters && (
        <div className="mb-4 text-sm text-neutral-500">
          {data.total} {data.total === 1 ? "transaction" : "transactions"} found
        </div>
      )}

      {/* ─── Loading State ────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-neutral-200 rounded w-1/3" />
                  <div className="h-3 bg-neutral-100 rounded w-1/4" />
                </div>
                <div className="h-5 bg-neutral-200 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Empty State ──────────────────────────────────────────── */}
      {!isLoading && data.transactions.length === 0 && (
        <div className="text-center py-16 px-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
            {hasActiveFilters ? (
              <Search className="h-8 w-8 text-neutral-400" />
            ) : (
              <Receipt className="h-8 w-8 text-neutral-400" />
            )}
          </div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-2">
            {hasActiveFilters
              ? "No transactions found"
              : "No transactions yet"}
          </h2>
          <p className="text-neutral-500 max-w-md mx-auto">
            {hasActiveFilters
              ? "Try adjusting your filters or search to find what you're looking for."
              : "Add your first transaction to start tracking your spending."}
          </p>
          {hasActiveFilters ? (
            <button
              onClick={clearFilters}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 text-sm text-primary hover:text-primary-dark font-medium"
            >
              <X className="h-4 w-4" />
              Clear all filters
            </button>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-[var(--radius-button)] font-medium hover:bg-primary-dark transition-colors min-h-[44px]"
            >
              <Plus className="h-4 w-4" />
              Add Your First Transaction
            </button>
          )}
        </div>
      )}

      {/* ─── Transaction List ─────────────────────────────────────── */}
      {!isLoading && data.transactions.length > 0 && (
        <div className="space-y-2">
          {data.transactions.map((txn) => (
            <TransactionCard
              key={txn.id}
              transaction={txn}
              categoryColor={getCategoryColor(txn.category)}
              onEdit={() => setEditingTransaction(txn)}
              onDelete={() => setDeletingTransaction(txn)}
              onSplit={() => setSplittingTransaction(txn)}
            />
          ))}
        </div>
      )}

      {/* ─── Pagination ───────────────────────────────────────────── */}
      {!isLoading && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-200">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={data.page <= 1}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-neutral-700 rounded-[var(--radius-button)] border border-neutral-300 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>

          <span className="text-sm text-neutral-500">
            Page {data.page} of {data.totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={data.page >= data.totalPages}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-neutral-700 rounded-[var(--radius-button)] border border-neutral-300 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── Add Transaction Modal ──────────────────────────────── */}
      {showAddForm && (
        <TransactionForm
          mode="add"
          initialData={{
            date: todayStr,
            name: "",
            amount: "",
            type: "expense",
            accountId: "",
            category: "",
            notes: "",
            isTransfer: false,
          }}
          accounts={accounts}
          onSubmit={handleAddTransaction}
          onCancel={() => setShowAddForm(false)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* ─── Edit Transaction Modal ─────────────────────────────── */}
      {editingTransaction && (
        <TransactionForm
          mode="edit"
          initialData={getEditFormData(editingTransaction)}
          accounts={accounts}
          onSubmit={handleEditTransaction}
          onCancel={() => setEditingTransaction(null)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* ─── Delete Confirmation ────────────────────────────────── */}
      {deletingTransaction && (
        <DeleteTransactionDialog
          transactionName={deletingTransaction.name}
          onConfirm={handleDeleteTransaction}
          onCancel={() => setDeletingTransaction(null)}
          isDeleting={isSubmitting}
        />
      )}

      {/* ─── Split Editor ───────────────────────────────────────── */}
      {splittingTransaction && (
        <SplitEditor
          transactionId={splittingTransaction.id}
          transactionAmount={Math.abs(splittingTransaction.amount)}
          transactionName={splittingTransaction.name}
          onClose={() => setSplittingTransaction(null)}
          onSaved={handleSplitSaved}
        />
      )}
    </div>
  );
}

// ─── Transaction Card ───────────────────────────────────────────────────

function TransactionCard({
  transaction,
  categoryColor,
  onEdit,
  onDelete,
  onSplit,
}: {
  transaction: Transaction;
  categoryColor: string;
  onEdit: () => void;
  onDelete: () => void;
  onSplit: () => void;
}) {
  const isIncome = transaction.amount < 0;
  const isTransfer = transaction.isTransfer;
  const displayAmount = Math.abs(transaction.amount);

  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-neutral-900 truncate">
              {transaction.name}
            </h3>
            {isTransfer && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-500">
                <ArrowLeftRight className="h-2.5 w-2.5" />
                Transfer
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(transaction.postedAt)}
            </span>
            <span>·</span>
            <span>{transaction.accountName}</span>
          </div>
        </div>

        {/* Right: Amount + Category + Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex flex-col items-end gap-1">
            <span
              className={cn(
                "text-sm font-semibold currency whitespace-nowrap",
                isTransfer
                  ? "text-neutral-500"
                  : isIncome
                    ? "text-income"
                    : "text-expense"
              )}
            >
              {isTransfer ? "" : isIncome ? "+" : "-"}
              {formatCurrency(displayAmount)}
            </span>
            {transaction.category && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-white whitespace-nowrap"
                style={{ backgroundColor: categoryColor }}
              >
                {transaction.category}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 ml-1">
            <button
              onClick={onSplit}
              className="p-2 rounded-[var(--radius-button)] text-neutral-400 hover:text-primary hover:bg-primary/5 transition-colors"
              aria-label={`Split ${transaction.name}`}
              title="Split transaction"
            >
              <Scissors className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onEdit}
              className="p-2 rounded-[var(--radius-button)] text-neutral-400 hover:text-primary hover:bg-neutral-100 transition-colors"
              aria-label={`Edit ${transaction.name}`}
              title="Edit transaction"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 rounded-[var(--radius-button)] text-neutral-400 hover:text-expense hover:bg-red-50 transition-colors"
              aria-label={`Delete ${transaction.name}`}
              title="Delete transaction"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
