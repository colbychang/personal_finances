"use client";

import { useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  PiggyBank,
  AlertCircle,
  Plus,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatMonth } from "@/lib/format";

// ─── Types ──────────────────────────────────────────────────────────────

interface BudgetWithSpending {
  category: string;
  budgeted: number;
  spent: number;
  remaining: number;
  categoryColor: string | null;
}

interface UnbudgetedSpending {
  category: string;
  spent: number;
  categoryColor: string | null;
}

interface BudgetSummary {
  budgets: BudgetWithSpending[];
  unbudgeted: UnbudgetedSpending[];
  totalBudgeted: number;
  totalSpent: number;
  totalRemaining: number;
}

interface CategoryOption {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  isPredefined: boolean;
}

interface BudgetsClientProps {
  initialMonth: string;
  initialData: BudgetSummary;
  categories: CategoryOption[];
}

// ─── Helpers ────────────────────────────────────────────────────────────

function getAdjacentMonth(month: string, direction: -1 | 1): string {
  const [year, monthNum] = month.split("-").map(Number);
  const newMonth = monthNum + direction;
  if (newMonth < 1) return `${year - 1}-12`;
  if (newMonth > 12) return `${year + 1}-01`;
  return `${year}-${String(newMonth).padStart(2, "0")}`;
}

// ─── Component ──────────────────────────────────────────────────────────

export function BudgetsClient({
  initialMonth,
  initialData,
  categories,
}: BudgetsClientProps) {
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<BudgetSummary>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);

  // Budget editing state
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Add new budget state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addCategory, setAddCategory] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

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

  function handleMonthChange(direction: -1 | 1) {
    const newMonth = getAdjacentMonth(month, direction);
    setMonth(newMonth);
    setEditingCategory(null);
    setShowAddForm(false);
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

  // ─── Copy Previous Month ─────────────────────────────────────

  async function handleCopyPrevious() {
    setIsCopying(true);
    setCopyMessage(null);
    try {
      const res = await fetch("/api/budgets/copy-previous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const result = await res.json();

      if (result.copied === 0) {
        setCopyMessage("No budgets found for the previous month.");
      } else {
        setCopyMessage(`Copied ${result.copied} budget(s) from the previous month.`);
        await fetchBudgets(month);
      }

      // Auto-dismiss message after 4 seconds
      setTimeout(() => setCopyMessage(null), 4000);
    } catch {
      setCopyMessage("Failed to copy budgets.");
      setTimeout(() => setCopyMessage(null), 4000);
    } finally {
      setIsCopying(false);
    }
  }

  // Get categories not yet budgeted for add form
  const budgetedCategories = new Set(data.budgets.map((b) => b.category));
  const availableCategories = categories.filter(
    (c) => !budgetedCategories.has(c.name)
  );

  const hasBudgets = data.budgets.length > 0;
  const hasUnbudgeted = data.unbudgeted.length > 0;

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

      {/* ─── Copy Message ────────────────────────────────────────── */}
      {copyMessage && (
        <div
          className={cn(
            "mb-4 px-4 py-3 rounded-[var(--radius-card)] text-sm flex items-center gap-2",
            copyMessage.includes("No budgets")
              ? "bg-warning/10 text-warning border border-warning/20"
              : "bg-income/10 text-income border border-income/20"
          )}
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {copyMessage}
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
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-[var(--radius-button)] font-medium hover:bg-primary-dark transition-colors min-h-[44px]"
        >
          <Plus className="h-4 w-4" />
          <span>Set Budget</span>
        </button>

        <button
          onClick={handleCopyPrevious}
          disabled={isCopying}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-neutral-300 text-neutral-700 rounded-[var(--radius-button)] font-medium hover:bg-neutral-50 transition-colors min-h-[44px] disabled:opacity-50"
        >
          <Copy className="h-4 w-4" />
          <span className="hidden sm:inline">Copy Previous Month</span>
          <span className="sm:hidden">Copy Prev</span>
        </button>
      </div>

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
            Start by setting budget amounts for your spending categories, or
            copy budgets from a previous month.
          </p>
        </div>
      )}

      {/* ─── Budget List ──────────────────────────────────────────── */}
      {!isLoading && hasBudgets && (
        <div className="space-y-2 mb-6">
          {data.budgets.map((budget) => {
            const isEditing = editingCategory === budget.category;
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
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: budget.categoryColor ?? "#94a3b8",
                      }}
                    />
                    <span className="text-sm font-semibold text-neutral-900 truncate">
                      {budget.category}
                    </span>
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-2">
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
                    <button
                      onClick={() => {
                        setEditingCategory(budget.category);
                        setEditAmount((budget.budgeted / 100).toFixed(2));
                        setEditError(null);
                      }}
                      className="text-sm text-neutral-500 hover:text-primary transition-colors currency min-h-[44px] min-w-[44px] flex items-center justify-center px-2"
                      title="Click to edit"
                    >
                      {formatCurrency(budget.budgeted)}
                    </button>
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
