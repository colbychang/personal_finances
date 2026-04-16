"use client";

import Link from "next/link";
import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  AlertCircle,
  Plus,
  Check,
  X,
  Pencil,
  ExternalLink,
  Bookmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { subscribeToFinanceDataChanged } from "@/lib/client-events";
import { formatCurrency, formatMonth } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { TransactionForm } from "@/components/transactions";
import type { TransactionFormData } from "@/components/transactions";

// ─── Types ──────────────────────────────────────────────────────────────

interface BudgetWithSpending {
  category: string;
  budgeted: number;
  spent: number;
  remaining: number;
  isInheritedDefault: boolean;
  categoryColor: string | null;
  transactions: CategoryTransaction[];
}

interface UnbudgetedSpending {
  category: string;
  spent: number;
  categoryColor: string | null;
  transactions: CategoryTransaction[];
}

interface CategoryTransaction {
  id: number;
  postedAt: string;
  name: string;
  amount: number;
  originalAmount: number;
  accountName: string;
  isSplit: boolean;
}

interface BudgetSummary {
  budgets: BudgetWithSpending[];
  unbudgeted: UnbudgetedSpending[];
  totalBudgeted: number;
  totalSpent: number;
  totalRemaining: number;
  reviewSummary: {
    uncategorizedCount: number;
    uncategorizedAmount: number;
    transactions: Array<{
      id: number;
      postedAt: string;
      name: string;
      amount: number;
      accountName: string;
    }>;
  };
}

interface CategoryOption {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  isPredefined: boolean;
}

interface AccountOption {
  id: number;
  name: string;
  type: string;
}

interface BudgetTemplate {
  id: number;
  category: string;
  amount: number;
  updatedAt: string;
}

interface TemplateDraft {
  category: string;
  amount: string;
}

function DefaultBudgetBadge() {
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary outline-none"
        aria-describedby="default-budget-badge-tooltip"
      >
        Default
      </span>
      <span
        id="default-budget-badge-tooltip"
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden w-52 -translate-x-1/2 rounded-[var(--radius-button)] bg-neutral-900 px-3 py-2 text-[11px] font-medium leading-relaxed text-white shadow-lg group-hover:block group-focus-within:block"
      >
        This budget is inherited from your saved default budget model for months
        without a custom override.
      </span>
    </span>
  );
}

interface EditableTransaction {
  id: number;
  accountId: number;
  postedAt: string;
  overrideMonth: string | null;
  name: string;
  amount: number;
  category: string | null;
  notes: string | null;
  isTransfer: boolean;
}

interface BudgetsClientProps {
  initialMonth: string;
  initialData: BudgetSummary;
  categories: CategoryOption[];
  accounts: AccountOption[];
  initialBudgetTemplates: BudgetTemplate[];
}

// ─── Helpers ────────────────────────────────────────────────────────────

function getAdjacentMonth(month: string, direction: -1 | 1): string {
  const [year, monthNum] = month.split("-").map(Number);
  const newMonth = monthNum + direction;
  if (newMonth < 1) return `${year - 1}-12`;
  if (newMonth > 12) return `${year + 1}-01`;
  return `${year}-${String(newMonth).padStart(2, "0")}`;
}

function getMonthDateRange(month: string): { dateFrom: string; dateTo: string } {
  const [year, monthNum] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  return {
    dateFrom: `${month}-01`,
    dateTo: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function buildTransactionsHref(month: string, category: string): string {
  const params = new URLSearchParams();
  params.set("effectiveMonth", month);
  params.set("category", category);
  return `/transactions?${params.toString()}`;
}

function restoreScrollPosition(scrollY: number) {
  if (typeof window === "undefined") return;

  requestAnimationFrame(() => {
    window.scrollTo({ top: scrollY });
  });
}

function restoreBudgetDetailScroll(
  scrollY: number,
  container: HTMLDivElement | null,
  containerScrollTop: number
) {
  if (typeof window === "undefined") return;

  requestAnimationFrame(() => {
    window.scrollTo({ top: scrollY });

    requestAnimationFrame(() => {
      if (container) {
        container.scrollTop = containerScrollTop;
      }
    });
  });
}

// ─── Component ──────────────────────────────────────────────────────────

export function BudgetsClient({
  initialMonth,
  initialData,
  categories,
  accounts,
  initialBudgetTemplates,
}: BudgetsClientProps) {
  const { showToast } = useToast();
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<BudgetSummary>(initialData);
  const [allCategories, setAllCategories] = useState(categories);
  const [isLoading, setIsLoading] = useState(false);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [isSavingTemplateEdits, setIsSavingTemplateEdits] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [defaultTemplates, setDefaultTemplates] = useState(initialBudgetTemplates);
  const [templateDrafts, setTemplateDrafts] = useState<TemplateDraft[]>([]);
  const [newTemplateCategory, setNewTemplateCategory] = useState("");
  const [newTemplateAmount, setNewTemplateAmount] = useState("");
  const [expandedCategoryKey, setExpandedCategoryKey] = useState<string | null>(
    null
  );

  // Budget editing state
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<EditableTransaction | null>(null);
  const [isLoadingTransaction, setIsLoadingTransaction] = useState(false);

  // Ref for click-away detection on inline edit
  const editRef = useRef<HTMLDivElement>(null);
  const categoryContainerRefs = useRef(new Map<string, HTMLDivElement | null>());
  const pendingScrollRestoreRef = useRef<{
    scrollY: number;
    categoryKey: string | null;
    containerScrollTop: number;
  } | null>(null);

  useEffect(() => {
    if (!editingCategory) return;
    function handleClickAway(e: MouseEvent) {
      if (editRef.current && !editRef.current.contains(e.target as Node)) {
        setEditingCategory(null);
        setEditError(null);
      }
    }
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [editingCategory]);

  // Add new budget state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addCategory, setAddCategory] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const hasTemplate = defaultTemplates.length > 0;

  const fetchBudgets = useCallback(async (targetMonth: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/budgets?month=${targetMonth}`);
      if (res.ok) {
        const result: BudgetSummary = await res.json();
        setData(result);
      }
    } catch (error) {
      console.error("Failed to fetch budgets:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshTemplates = useCallback(async () => {
    const res = await fetch("/api/budgets/template");
    if (!res.ok) {
      throw new Error("Failed to fetch budget template");
    }
    const result = await res.json();
    const templates = (result.templates ?? []) as BudgetTemplate[];
    setDefaultTemplates(templates);
    return templates;
  }, []);

  useEffect(() => {
    return subscribeToFinanceDataChanged(() => {
      void fetchBudgets(month);
    });
  }, [fetchBudgets, month]);

  useEffect(() => {
    if (month === initialMonth) {
      setData(initialData);
    }
  }, [initialData, initialMonth, month]);

  useEffect(() => {
    const pendingRestore = pendingScrollRestoreRef.current;
    if (!pendingRestore) return;

    const container = pendingRestore.categoryKey
      ? categoryContainerRefs.current.get(pendingRestore.categoryKey) ?? null
      : null;

    restoreBudgetDetailScroll(
      pendingRestore.scrollY,
      container,
      pendingRestore.containerScrollTop
    );
    pendingScrollRestoreRef.current = null;
  }, [data, expandedCategoryKey]);

  function handleMonthChange(direction: -1 | 1) {
    const newMonth = getAdjacentMonth(month, direction);
    setMonth(newMonth);
    setEditingCategory(null);
    setShowAddForm(false);
    setExpandedCategoryKey(null);
    router.replace(`/budgets?month=${newMonth}`, { scroll: false });
    fetchBudgets(newMonth);
  }

  // ─── Save Budget ─────────────────────────────────────────────

  async function handleSaveBudget(category: string, amountStr: string) {
    const parsed = parseFloat(amountStr);
    if (isNaN(parsed)) {
      setEditError("Please enter a valid number");
      return;
    }
    if (parsed < 0) {
      setEditError("Amount cannot be negative");
      return;
    }

    setIsSaving(true);
    setEditError(null);
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, category, amount: parsed }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setEditError(errData.errors?.amount || "Failed to save");
        return;
      }

      setEditingCategory(null);
      setEditAmount("");
      await fetchBudgets(month);
    } catch {
      setEditError("Failed to save budget");
    } finally {
      setIsSaving(false);
    }
  }

  // ─── Add Budget ──────────────────────────────────────────────

  async function handleAddBudget() {
    if (!addCategory) {
      setAddError("Please select a category");
      return;
    }

    const parsed = parseFloat(addAmount);
    if (isNaN(parsed)) {
      setAddError("Please enter a valid number");
      return;
    }
    if (parsed < 0) {
      setAddError("Amount cannot be negative");
      return;
    }

    setIsSaving(true);
    setAddError(null);
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, category: addCategory, amount: parsed }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setAddError(errData.errors?.amount || "Failed to save");
        return;
      }

      setShowAddForm(false);
      setAddCategory("");
      setAddAmount("");
      await fetchBudgets(month);
    } catch {
      setAddError("Failed to add budget");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateCategory() {
    const trimmedName = newCategoryName.trim();

    if (!trimmedName) {
      setNewCategoryError("Please enter a category name");
      return;
    }

    setIsCreatingCategory(true);
    setNewCategoryError(null);

    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });

      const result = await res.json();

      if (!res.ok) {
        setNewCategoryError(result.error || "Failed to create category");
        return;
      }

      setAllCategories((current) => [...current, result.category]);
      setAddCategory(result.category.name);
      setShowCreateCategory(false);
      setNewCategoryName("");
      setNewCategoryError(null);
      showToast(`Created category "${result.category.name}"`, "success");
    } catch {
      setNewCategoryError("Failed to create category. Please try again.");
    } finally {
      setIsCreatingCategory(false);
    }
  }

  // ─── Save Default Budget Model ───────────────────────────────

  async function handleSaveTemplate() {
    setIsSavingTemplate(true);
    setTemplateMessage(null);

    try {
      const res = await fetch("/api/budgets/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const result = await res.json();

      if (result.saved === 0) {
        setTemplateMessage("No budgets found for this month.");
      } else {
        const templates = await refreshTemplates();
        setTemplateMessage(
          `Saved ${result.saved} budget(s) as your default model. Future months will inherit it unless you override them.`
        );
        setDefaultTemplates(templates);
        await fetchBudgets(month);
      }

      setTimeout(() => setTemplateMessage(null), 5000);
    } catch {
      setTemplateMessage("Failed to save the default budget model.");
      setTimeout(() => setTemplateMessage(null), 5000);
    } finally {
      setIsSavingTemplate(false);
    }
  }

  async function handleApplyTemplate() {
    setIsApplyingTemplate(true);
    setTemplateMessage(null);

    try {
      const res = await fetch("/api/budgets/template/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const result = await res.json();

      if (result.applied === 0) {
        setTemplateMessage("No default budget model is saved yet.");
      } else {
        setTemplateMessage(
          `Applied ${result.applied} default budget(s) to ${formatMonth(month)}.`
        );
        await fetchBudgets(month);
      }

      setTimeout(() => setTemplateMessage(null), 5000);
    } catch {
      setTemplateMessage("Failed to apply the default budget.");
      setTimeout(() => setTemplateMessage(null), 5000);
    } finally {
      setIsApplyingTemplate(false);
    }
  }

  function openTemplateEditor() {
    setTemplateDrafts(
      defaultTemplates
        .slice()
        .sort((left, right) => left.category.localeCompare(right.category))
        .map((template) => ({
          category: template.category,
          amount: (template.amount / 100).toFixed(2),
        }))
    );
    setNewTemplateCategory("");
    setNewTemplateAmount("");
    setTemplateError(null);
    setIsEditingTemplate(true);
  }

  function closeTemplateEditor() {
    setIsEditingTemplate(false);
    setTemplateError(null);
    setNewTemplateCategory("");
    setNewTemplateAmount("");
  }

  function handleAddTemplateRow() {
    if (!newTemplateCategory) {
      setTemplateError("Choose a category to add to the default budget.");
      return;
    }

    if (!newTemplateAmount) {
      setTemplateError("Enter an amount for the new default budget.");
      return;
    }

    const parsed = parseFloat(newTemplateAmount);
    if (Number.isNaN(parsed) || parsed < 0) {
      setTemplateError("Default budget amount must be zero or greater.");
      return;
    }

    setTemplateDrafts((current) =>
      [...current, { category: newTemplateCategory, amount: parsed.toFixed(2) }].sort(
        (left, right) => left.category.localeCompare(right.category)
      )
    );
    setNewTemplateCategory("");
    setNewTemplateAmount("");
    setTemplateError(null);
  }

  async function handleSaveTemplateEdits() {
    const normalizedTemplates = templateDrafts.flatMap((draft, index) => {
      const trimmedCategory = draft.category.trim();
      const parsedAmount = parseFloat(draft.amount);

      if (!trimmedCategory) {
        setTemplateError(`Template row ${index + 1} is missing a category.`);
        return [];
      }

      if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
        setTemplateError(
          `Template amount for ${trimmedCategory} must be zero or greater.`
        );
        return [];
      }

      return [{ category: trimmedCategory, amount: parsedAmount }];
    });

    if (normalizedTemplates.length !== templateDrafts.length) {
      return;
    }

    setIsSavingTemplateEdits(true);
    setTemplateError(null);

    try {
      const res = await fetch("/api/budgets/template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates: normalizedTemplates }),
      });
      const result = await res.json();

      if (!res.ok) {
        setTemplateError(
          result.error ||
            Object.values(result.errors ?? {})[0] ||
            "Failed to update the default budget."
        );
        return;
      }

      await refreshTemplates();
      await fetchBudgets(month);
      closeTemplateEditor();
      setTemplateMessage(
        normalizedTemplates.length === 0
          ? "Cleared the default budget model."
          : "Updated the default budget model."
      );
      setTimeout(() => setTemplateMessage(null), 5000);
    } catch {
      setTemplateError("Failed to update the default budget.");
    } finally {
      setIsSavingTemplateEdits(false);
    }
  }

  // Get categories not yet budgeted for add form
  const budgetedCategories = new Set(data.budgets.map((b) => b.category));
  const availableCategories = allCategories.filter(
    (c) => !budgetedCategories.has(c.name)
  );
  const templateCategorySet = new Set(templateDrafts.map((draft) => draft.category));
  const availableTemplateCategories = allCategories.filter(
    (category) => !templateCategorySet.has(category.name)
  );

  const hasBudgets = data.budgets.length > 0;
  const hasUnbudgeted = data.unbudgeted.length > 0;
  const hasNeedsReview = data.reviewSummary.uncategorizedCount > 0;

  function toggleCategoryDetails(categoryKey: string) {
    setExpandedCategoryKey((current) =>
      current === categoryKey ? null : categoryKey
    );
  }

  function getTransactionFormData(
    transaction: EditableTransaction
  ): TransactionFormData {
    const isIncome = transaction.amount < 0;
    return {
      date: transaction.postedAt,
      overrideMonth: transaction.overrideMonth ?? "",
      name: transaction.name,
      amount: (Math.abs(transaction.amount) / 100).toFixed(2),
      type: isIncome ? "income" : "expense",
      accountId: String(transaction.accountId),
      category: transaction.category ?? "",
      notes: transaction.notes ?? "",
      isTransfer: transaction.isTransfer,
    };
  }

  async function handleTransactionClick(transactionId: number) {
    setIsLoadingTransaction(true);
    try {
      const res = await fetch(`/api/transactions/${transactionId}`);
      const result = await res.json();

      if (!res.ok) {
        showToast(result.error || "Failed to load transaction");
        return;
      }

      setEditingTransaction(result.transaction as EditableTransaction);
    } catch {
      showToast("Failed to load transaction");
    } finally {
      setIsLoadingTransaction(false);
    }
  }

  async function handleEditTransaction(formData: TransactionFormData) {
    if (!editingTransaction) return;

    const scrollY = typeof window === "undefined" ? 0 : window.scrollY;
    const categoryKey = expandedCategoryKey;
    const containerScrollTop = categoryKey
      ? categoryContainerRefs.current.get(categoryKey)?.scrollTop ?? 0
      : 0;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/transactions/${editingTransaction.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: formData.date,
          overrideMonth: formData.overrideMonth || null,
          name: formData.name,
          amount: parseFloat(formData.amount),
          accountId: parseInt(formData.accountId, 10),
          category: formData.category || null,
          notes: formData.notes || null,
          isTransfer: formData.isTransfer,
          type: formData.type,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        showToast(result.error || "Failed to update transaction");
        return;
      }

      pendingScrollRestoreRef.current = {
        scrollY,
        categoryKey,
        containerScrollTop,
      };
      setEditingTransaction(null);
      showToast("Transaction updated", "success");
      await fetchBudgets(month);
    } catch {
      restoreScrollPosition(scrollY);
      showToast("Failed to update transaction");
    } finally {
      setIsSaving(false);
    }
  }

  function renderCategoryTransactions(
    categoryKey: string,
    category: string,
    transactions: CategoryTransaction[]
  ) {
    if (transactions.length === 0) {
      return null;
    }

    const isExpanded = expandedCategoryKey === categoryKey;

    if (!isExpanded) {
      return null;
    }

    return (
      <div className="mt-4 border-t border-neutral-200 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-neutral-600">
            {transactions.length} transaction
            {transactions.length === 1 ? "" : "s"} in this category for{" "}
            {formatMonth(month)}.
          </p>

          <Link
            href={buildTransactionsHref(month, category)}
            className="inline-flex items-center gap-2 rounded-[var(--radius-button)] border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 min-h-[44px]"
          >
            <ExternalLink className="h-4 w-4" />
            Open in Transactions
          </Link>
        </div>

        {isExpanded && (
          <div
            ref={(node) => {
              if (node) {
                categoryContainerRefs.current.set(categoryKey, node);
              } else {
                categoryContainerRefs.current.delete(categoryKey);
              }
            }}
            className="mt-3 max-h-72 overflow-y-auto rounded-[var(--radius-card)] border border-neutral-200 bg-neutral-50/70"
          >
            <div className="divide-y divide-neutral-200">
              {transactions.map((transaction) => (
                <button
                  type="button"
                  key={`${categoryKey}-${transaction.id}-${transaction.postedAt}-${transaction.amount}`}
                  onClick={() => void handleTransactionClick(transaction.id)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white focus:bg-white focus:outline-none disabled:opacity-60"
                  disabled={isLoadingTransaction}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-neutral-900">
                        {transaction.name}
                      </p>
                      {transaction.isSplit && (
                        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
                          Split
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {transaction.postedAt} · {transaction.accountName}
                    </p>
                    {transaction.isSplit && (
                      <p className="mt-1 text-xs text-neutral-500">
                        {formatCurrency(transaction.amount)} of{" "}
                        {formatCurrency(transaction.originalAmount)}
                      </p>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-sm font-semibold text-neutral-900 currency">
                    {formatCurrency(transaction.amount)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* ─── Month Selector ──────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => handleMonthChange(-1)}
          className="flex items-center justify-center w-11 h-11 rounded-[var(--radius-button)] border border-neutral-300 text-neutral-600 hover:bg-neutral-50 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-semibold text-neutral-900">
          {formatMonth(month)}
        </h2>

        <button
          onClick={() => handleMonthChange(1)}
          className="flex items-center justify-center w-11 h-11 rounded-[var(--radius-button)] border border-neutral-300 text-neutral-600 hover:bg-neutral-50 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* ─── Summary Cards ───────────────────────────────────────── */}
      {hasBudgets && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-3 text-center">
            <p className="text-xs text-neutral-500 mb-1">Budgeted</p>
            <p className="text-base font-semibold text-neutral-900 currency">
              {formatCurrency(data.totalBudgeted)}
            </p>
          </div>
          <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-3 text-center">
            <p className="text-xs text-neutral-500 mb-1">Spent</p>
            <p className="text-base font-semibold text-expense currency">
              {formatCurrency(data.totalSpent)}
            </p>
          </div>
          <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-3 text-center">
            <p className="text-xs text-neutral-500 mb-1">Remaining</p>
            <p
              className={cn(
                "text-base font-semibold currency",
                data.totalRemaining >= 0 ? "text-income" : "text-expense"
              )}
            >
              {data.totalRemaining < 0 ? "-" : ""}
              {formatCurrency(Math.abs(data.totalRemaining))}
            </p>
          </div>
        </div>
      )}

      {/* ─── Template Message ────────────────────────────────────── */}
      {templateMessage && (
        <div
          className={cn(
            "mb-4 px-4 py-3 rounded-[var(--radius-card)] text-sm flex items-center gap-2",
            templateMessage.includes("No budgets")
              || templateMessage.includes("No default budget")
              ? "bg-warning/10 text-warning border border-warning/20"
              : "bg-income/10 text-income border border-income/20"
          )}
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {templateMessage}
        </div>
      )}

      {hasNeedsReview && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-amber-900">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <h3 className="text-sm font-semibold">
                  Transactions That Need Review
                </h3>
              </div>
              <p className="mt-2 text-sm text-amber-900/90">
                {data.reviewSummary.uncategorizedCount} uncategorized expense
                transaction
                {data.reviewSummary.uncategorizedCount === 1 ? "" : "s"} this
                month totaling{" "}
                <span className="font-semibold">
                  {formatCurrency(data.reviewSummary.uncategorizedAmount)}
                </span>
                . These won&apos;t land in the right budget buckets until you
                sort them.
              </p>
            </div>
            <Link
              href={`/transactions?${new URLSearchParams({
                ...getMonthDateRange(month),
                needsReview: "1",
              }).toString()}`}
              className="inline-flex items-center justify-center rounded-[var(--radius-button)] border border-amber-300 bg-white px-4 py-2.5 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 min-h-[44px]"
            >
              Review in Transactions
            </Link>
          </div>

          <div className="mt-4 space-y-2">
            {data.reviewSummary.transactions.map((txn) => (
              <div
                key={txn.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-button)] bg-white/80 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-900">
                    {txn.name}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {txn.postedAt} · {txn.accountName}
                  </p>
                </div>
                <span className="font-semibold text-neutral-900 currency flex-shrink-0">
                  {formatCurrency(txn.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Action Buttons ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => {
            setShowAddForm(true);
            setAddCategory("");
            setAddAmount("");
            setAddError(null);
            setShowCreateCategory(false);
            setNewCategoryName("");
            setNewCategoryError(null);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-[var(--radius-button)] font-medium hover:bg-primary-dark transition-colors min-h-[44px]"
        >
          <Plus className="h-4 w-4" />
          <span>Set Budget</span>
        </button>

        <button
          onClick={() => void handleSaveTemplate()}
          disabled={isSavingTemplate}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-neutral-300 text-neutral-700 rounded-[var(--radius-button)] font-medium hover:bg-neutral-50 transition-colors min-h-[44px] disabled:opacity-50"
        >
          <Bookmark className="h-4 w-4" />
          <span className="hidden sm:inline">
            {hasTemplate ? "Update Default Budget" : "Save as Default Budget"}
          </span>
          <span className="sm:hidden">{hasTemplate ? "Update Default" : "Save Default"}</span>
        </button>

        <button
          onClick={() => void handleApplyTemplate()}
          disabled={!hasTemplate || isApplyingTemplate}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-neutral-300 text-neutral-700 rounded-[var(--radius-button)] font-medium hover:bg-neutral-50 transition-colors min-h-[44px] disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          <span className="hidden sm:inline">Apply Default Budget</span>
          <span className="sm:hidden">Apply Default</span>
        </button>

        <button
          onClick={openTemplateEditor}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-neutral-300 text-neutral-700 rounded-[var(--radius-button)] font-medium hover:bg-neutral-50 transition-colors min-h-[44px]"
        >
          <Pencil className="h-4 w-4" />
          <span className="hidden sm:inline">Edit Default Budget</span>
          <span className="sm:hidden">Edit Default</span>
        </button>
      </div>

      <p className="mb-6 text-sm text-neutral-500">
        Default budgets automatically fill future months unless you set a custom amount for that month.
      </p>

      {isEditingTemplate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/40 p-4">
          <div className="w-full max-w-2xl rounded-[var(--radius-card)] border border-neutral-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-neutral-900">
                  Edit Default Budget
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Manage the budget model that future months inherit by default.
                </p>
              </div>
              <button
                type="button"
                onClick={closeTemplateEditor}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-button)] text-neutral-500 transition-colors hover:bg-neutral-100"
                aria-label="Close default budget editor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <div className="space-y-3">
                {templateDrafts.length === 0 ? (
                  <div className="rounded-[var(--radius-card)] border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-sm text-neutral-500">
                    No default budget categories saved yet. Add one below or save a month as your default model.
                  </div>
                ) : (
                  templateDrafts.map((draft, index) => (
                    <div
                      key={`${draft.category}-${index}`}
                      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-neutral-200 px-4 py-3 sm:flex-row sm:items-end"
                    >
                      <div className="flex-1">
                        <label className="mb-1 block text-xs font-medium text-neutral-500">
                          Category
                        </label>
                        <div className="min-h-[44px] rounded-[var(--radius-button)] border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-800">
                          {draft.category}
                        </div>
                      </div>
                      <div className="w-full sm:w-40">
                        <label className="mb-1 block text-xs font-medium text-neutral-500">
                          Amount ($)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draft.amount}
                          onChange={(e) => {
                            const value = e.target.value;
                            setTemplateDrafts((current) =>
                              current.map((entry, draftIndex) =>
                                draftIndex === index ? { ...entry, amount: value } : entry
                              )
                            );
                            setTemplateError(null);
                          }}
                          className="w-full min-h-[44px] rounded-[var(--radius-button)] border border-neutral-300 px-3 py-2.5 text-sm focus:ring-primary"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTemplateDrafts((current) =>
                            current.filter((_, draftIndex) => draftIndex !== index)
                          );
                          setTemplateError(null);
                        }}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-button)] border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 rounded-[var(--radius-card)] border border-primary/20 bg-primary/5 px-4 py-4">
                <h4 className="text-sm font-semibold text-neutral-900">
                  Add Category to Default Budget
                </h4>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-neutral-500">
                      Category
                    </label>
                    <select
                      value={newTemplateCategory}
                      onChange={(e) => {
                        setNewTemplateCategory(e.target.value);
                        setTemplateError(null);
                      }}
                      className="w-full min-h-[44px] rounded-[var(--radius-button)] border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:ring-primary"
                    >
                      <option value="">Select category...</option>
                      {availableTemplateCategories.map((category) => (
                        <option key={category.id} value={category.name}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full sm:w-40">
                    <label className="mb-1 block text-xs font-medium text-neutral-500">
                      Amount ($)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={newTemplateAmount}
                      onChange={(e) => {
                        setNewTemplateAmount(e.target.value);
                        setTemplateError(null);
                      }}
                      placeholder="0.00"
                      className="w-full min-h-[44px] rounded-[var(--radius-button)] border border-neutral-300 px-3 py-2.5 text-sm focus:ring-primary"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddTemplateRow}
                    disabled={availableTemplateCategories.length === 0}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-button)] bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>

              {templateError && (
                <p className="mt-3 text-sm text-expense">{templateError}</p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-4">
              <p className="text-xs text-neutral-500">
                Applying the default budget writes those category amounts into the current month without removing extra custom categories.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeTemplateEditor}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-button)] border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveTemplateEdits()}
                  disabled={isSavingTemplateEdits}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-button)] bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {isSavingTemplateEdits ? "Saving..." : "Save Default Budget"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Budget Form ─────────────────────────────────────── */}
      {showAddForm && (
        <div className="bg-white rounded-[var(--radius-card)] border border-primary/30 p-4 mb-4">
          <h3 className="text-sm font-semibold text-neutral-900 mb-3">Set Budget Amount</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral-500 mb-1">
                Category
              </label>
              <select
                value={addCategory}
                onChange={(e) => {
                  setAddCategory(e.target.value);
                  setAddError(null);
                }}
                className="w-full px-3 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-sm min-h-[44px] bg-white focus:ring-primary"
              >
                <option value="">Select category...</option>
                {availableCategories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
                {/* Also show already-budgeted categories to allow updates */}
                {data.budgets.length > 0 && (
                  <optgroup label="Already budgeted (update)">
                    {data.budgets.map((b) => (
                      <option key={b.category} value={b.category}>
                        {b.category}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {!showCreateCategory ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateCategory(true);
                    setNewCategoryName("");
                    setNewCategoryError(null);
                  }}
                  className="mt-2 text-xs font-medium text-primary hover:text-primary-dark"
                >
                  Create a new category
                </button>
              ) : (
                <div className="mt-3 rounded-[var(--radius-button)] border border-primary/20 bg-primary/5 p-3">
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    New category name
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => {
                        setNewCategoryName(e.target.value);
                        setNewCategoryError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleCreateCategory();
                        }
                      }}
                      placeholder="e.g. Gifts, Skiing, Pet Care"
                      className="flex-1 px-3 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-sm min-h-[44px] bg-white focus:ring-primary"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCreateCategory()}
                        disabled={isCreatingCategory}
                        className="inline-flex items-center justify-center rounded-[var(--radius-button)] bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50 min-h-[44px]"
                      >
                        {isCreatingCategory ? "Creating..." : "Create"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateCategory(false);
                          setNewCategoryName("");
                          setNewCategoryError(null);
                        }}
                        className="inline-flex items-center justify-center rounded-[var(--radius-button)] border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 min-h-[44px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  {newCategoryError && (
                    <p className="mt-2 text-xs text-expense">{newCategoryError}</p>
                  )}
                </div>
              )}
            </div>
            <div className="w-full sm:w-40">
              <label className="block text-xs font-medium text-neutral-500 mb-1">
                Amount ($)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={addAmount}
                onChange={(e) => {
                  setAddAmount(e.target.value);
                  setAddError(null);
                }}
                placeholder="0.00"
                className="w-full px-3 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-sm min-h-[44px] focus:ring-primary"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleAddBudget}
                disabled={isSaving}
                className="inline-flex items-center gap-1 px-4 py-2.5 bg-primary text-white rounded-[var(--radius-button)] font-medium hover:bg-primary-dark transition-colors min-h-[44px] disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Save
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="inline-flex items-center gap-1 px-3 py-2.5 border border-neutral-300 text-neutral-600 rounded-[var(--radius-button)] hover:bg-neutral-50 transition-colors min-h-[44px]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {addError && (
            <p className="mt-2 text-xs text-expense">{addError}</p>
          )}
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
              <div className="flex items-center justify-between mb-2">
                <div className="h-4 bg-neutral-200 rounded w-1/3" />
                <div className="h-4 bg-neutral-200 rounded w-20" />
              </div>
              <div className="h-2 bg-neutral-100 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {/* ─── Empty State ──────────────────────────────────────────── */}
      {!isLoading && !hasBudgets && !hasUnbudgeted && (
        <div className="text-center py-16 px-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
            <PiggyBank className="h-8 w-8 text-neutral-400" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-2">
            No budgets set for {formatMonth(month)}
          </h2>
          <p className="text-neutral-500 max-w-md mx-auto">
            Start by setting budget amounts for your spending categories, then
            save them as your default budget model for future months.
          </p>
        </div>
      )}

      {/* ─── Budget List ──────────────────────────────────────────── */}
      {!isLoading && hasBudgets && (
        <div className="space-y-2 mb-6">
          {data.budgets.map((budget) => {
            const isEditing = editingCategory === budget.category;
            const canExpand = budget.transactions.length > 0;
            const percentSpent =
              budget.budgeted > 0
                ? Math.min((budget.spent / budget.budgeted) * 100, 100)
                : 0;
            const isOverBudget = budget.remaining < 0;
            const progressColor = isOverBudget
              ? "bg-expense"
              : percentSpent >= 80
                ? "bg-warning"
                : "bg-income";

            return (
              <div
                key={budget.category}
                className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4"
              >
                <div
                  role={canExpand && !isEditing ? "button" : undefined}
                  tabIndex={canExpand && !isEditing ? 0 : undefined}
                  onClick={() => {
                    if (canExpand && !isEditing) {
                      toggleCategoryDetails(`budget:${budget.category}`);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (!canExpand || isEditing) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleCategoryDetails(`budget:${budget.category}`);
                    }
                  }}
                  aria-expanded={
                    canExpand
                      ? expandedCategoryKey === `budget:${budget.category}`
                      : undefined
                  }
                  className={cn(
                    "-m-4 rounded-[var(--radius-card)] p-4",
                    canExpand && !isEditing
                      ? "cursor-pointer transition-colors hover:bg-neutral-50/40"
                      : ""
                  )}
                >
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={cn(
                      "flex min-w-0 items-center gap-2 text-left",
                      canExpand ? "" : "cursor-default"
                    )}
                  >
                    {canExpand ? (
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 flex-shrink-0 text-neutral-400 transition-transform",
                          expandedCategoryKey === `budget:${budget.category}`
                            ? "rotate-180"
                            : ""
                        )}
                      />
                    ) : (
                      <span className="h-4 w-4 flex-shrink-0" />
                    )}
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: budget.categoryColor ?? "#94a3b8",
                      }}
                    />
                    <span className="text-sm font-semibold text-neutral-900 truncate">
                      {budget.category}
                    </span>
                    {budget.isInheritedDefault && (
                      <DefaultBudgetBadge />
                    )}
                  </div>

                  {isEditing ? (
                    <div
                      className="flex items-center gap-2"
                      ref={editRef}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center">
                        <span className="text-sm text-neutral-400 mr-1">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editAmount}
                          onChange={(e) => {
                            setEditAmount(e.target.value);
                            setEditError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleSaveBudget(budget.category, editAmount);
                            }
                            if (e.key === "Escape") {
                              setEditingCategory(null);
                              setEditError(null);
                            }
                          }}
                          autoFocus
                          className="w-24 px-2 py-1 rounded border border-neutral-300 text-sm text-right focus:ring-primary"
                        />
                      </div>
                      <button
                        onClick={() =>
                          handleSaveBudget(budget.category, editAmount)
                        }
                        disabled={isSaving}
                        className="p-2.5 text-income hover:bg-green-50 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label="Save"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingCategory(null);
                          setEditError(null);
                        }}
                        className="p-2.5 text-neutral-400 hover:bg-neutral-50 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-neutral-500 currency">
                        {formatCurrency(budget.budgeted)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCategory(budget.category);
                          setEditAmount((budget.budgeted / 100).toFixed(2));
                          setEditError(null);
                        }}
                        className="p-2.5 text-neutral-400 hover:text-primary hover:bg-neutral-50 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label={`Edit ${budget.category} budget`}
                        title="Edit budget"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {editError && isEditing && (
                  <p className="text-xs text-expense mb-2">{editError}</p>
                )}

                {/* Progress Bar */}
                <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mb-2">
                  <div
                    className={cn("h-full rounded-full transition-all", progressColor)}
                    style={{
                      width: `${isOverBudget ? 100 : percentSpent}%`,
                    }}
                  />
                </div>

                {/* Spent / Remaining */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">
                    Spent:{" "}
                    <span className="font-medium text-neutral-700 currency">
                      {formatCurrency(budget.spent)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "font-medium currency",
                      isOverBudget ? "text-expense" : "text-neutral-600"
                    )}
                  >
                    {isOverBudget
                      ? `${formatCurrency(Math.abs(budget.remaining))} over budget`
                      : `${formatCurrency(budget.remaining)} left`}
                  </span>
                </div>
                </div>

                {renderCategoryTransactions(
                  `budget:${budget.category}`,
                  budget.category,
                  budget.transactions
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Unbudgeted Spending ──────────────────────────────────── */}
      {!isLoading && hasUnbudgeted && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-warning" />
            Unbudgeted Spending
          </h3>
          <div className="space-y-2">
            {data.unbudgeted.map((item) => (
              <div
                key={item.category}
                className="bg-white rounded-[var(--radius-card)] border border-warning/20 p-4"
              >
                <div
                  role={item.transactions.length > 0 ? "button" : undefined}
                  tabIndex={item.transactions.length > 0 ? 0 : undefined}
                  onClick={() => {
                    if (item.transactions.length > 0) {
                      toggleCategoryDetails(`unbudgeted:${item.category}`);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (item.transactions.length === 0) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleCategoryDetails(`unbudgeted:${item.category}`);
                    }
                  }}
                  aria-expanded={
                    item.transactions.length > 0
                      ? expandedCategoryKey === `unbudgeted:${item.category}`
                      : undefined
                  }
                  className={cn(
                    "-m-4 rounded-[var(--radius-card)] p-4",
                    item.transactions.length > 0
                      ? "cursor-pointer transition-colors hover:bg-warning/5"
                      : ""
                  )}
                >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-left">
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 flex-shrink-0 text-neutral-400 transition-transform",
                        expandedCategoryKey === `unbudgeted:${item.category}`
                          ? "rotate-180"
                          : ""
                      )}
                    />
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: item.categoryColor ?? "#94a3b8",
                      }}
                    />
                    <span className="text-sm font-medium text-neutral-900">
                      {item.category}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-expense currency">
                    {formatCurrency(item.spent)}
                  </span>
                </div>
                </div>

                {renderCategoryTransactions(
                  `unbudgeted:${item.category}`,
                  item.category,
                  item.transactions
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {editingTransaction && (
        <TransactionForm
          mode="edit"
          initialData={getTransactionFormData(editingTransaction)}
          accounts={accounts}
          onSubmit={handleEditTransaction}
          onCancel={() => setEditingTransaction(null)}
          isSubmitting={isSaving}
        />
      )}
    </div>
  );
}
