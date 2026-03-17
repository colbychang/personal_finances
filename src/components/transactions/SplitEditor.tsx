"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { CategorySelect } from "@/components/categories/CategorySelect";

// ─── Types ──────────────────────────────────────────────────────────────

interface SplitRow {
  category: string;
  amount: string; // dollars as string for input
}

interface ExistingSplit {
  id: number;
  transactionId: number;
  category: string;
  amount: number; // cents
}

interface SplitEditorProps {
  transactionId: number;
  transactionAmount: number; // cents (absolute value)
  transactionName: string;
  onClose: () => void;
  onSaved: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────

export function SplitEditor({
  transactionId,
  transactionAmount,
  transactionName,
  onClose,
  onSaved,
}: SplitEditorProps) {
  const [splits, setSplits] = useState<SplitRow[]>([
    { category: "", amount: "" },
    { category: "", amount: "" },
  ]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing splits
  useEffect(() => {
    async function loadSplits() {
      try {
        const res = await fetch(`/api/transactions/${transactionId}/splits`);
        if (res.ok) {
          const data = await res.json();
          if (data.splits && data.splits.length > 0) {
            setSplits(
              data.splits.map((s: ExistingSplit) => ({
                category: s.category,
                amount: (s.amount / 100).toFixed(2),
              }))
            );
          }
        }
      } catch {
        console.error("Failed to load splits");
      } finally {
        setIsLoading(false);
      }
    }
    loadSplits();
  }, [transactionId]);

  // Calculate split sum
  const splitSum = splits.reduce((sum, s) => {
    const val = parseFloat(s.amount);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const splitSumCents = Math.round(splitSum * 100);
  const isValid = splitSumCents === transactionAmount;
  const difference = (transactionAmount - splitSumCents) / 100;

  function addRow() {
    setSplits([...splits, { category: "", amount: "" }]);
  }

  function removeRow(index: number) {
    if (splits.length <= 2) return; // Minimum 2 rows
    setSplits(splits.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: keyof SplitRow, value: string) {
    const updated = [...splits];
    updated[index] = { ...updated[index], [field]: value };
    setSplits(updated);
    setError(null);
  }

  async function handleSave() {
    // Validate all rows have category and amount
    const hasEmpty = splits.some(
      (s) => !s.category || !s.amount || parseFloat(s.amount) <= 0
    );
    if (hasEmpty) {
      setError("All splits must have a category and a positive amount");
      return;
    }

    if (!isValid) {
      setError(
        `Split amounts must sum to ${formatCurrency(transactionAmount)}. Currently ${difference > 0 ? "under" : "over"} by ${formatCurrency(Math.abs(transactionAmount - splitSumCents))}`
      );
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/transactions/${transactionId}/splits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          splits: splits.map((s) => ({
            category: s.category,
            amount: parseFloat(s.amount),
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save splits");
        return;
      }

      onSaved();
    } catch {
      setError("Failed to save splits");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClearSplits() {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${transactionId}/splits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ splits: [] }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || data.errors?.join(", ") || "Failed to clear splits");
        return;
      }

      onSaved();
    } catch {
      setError("Failed to clear splits");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Split Transaction"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full md:max-w-lg bg-white rounded-t-2xl md:rounded-[var(--radius-card)] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              Split Transaction
            </h2>
            <p className="text-sm text-neutral-500 mt-0.5">
              {transactionName} — {formatCurrency(transactionAmount)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-[var(--radius-button)] text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-neutral-400">
            Loading splits...
          </div>
        ) : (
          <>
            {/* Split Rows */}
            <div className="space-y-3 mb-4">
              {splits.map((split, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="flex-1">
                    <CategorySelect
                      value={split.category}
                      onChange={(val) => updateRow(index, "category", val)}
                      placeholder="Category..."
                    />
                  </div>
                  <div className="w-28">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">
                        $
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={split.amount}
                        onChange={(e) =>
                          updateRow(index, "amount", e.target.value)
                        }
                        className="w-full pl-6 pr-2 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-sm min-h-[44px] focus:ring-primary"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    disabled={splits.length <= 2}
                    className="p-2.5 rounded-[var(--radius-button)] text-neutral-400 hover:text-expense hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed min-h-[44px]"
                    aria-label={`Remove split ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Row Button */}
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1 text-sm text-primary hover:text-primary-dark font-medium mb-4"
            >
              <Plus className="h-4 w-4" />
              Add Split
            </button>

            {/* Sum Validation */}
            <div
              className={cn(
                "flex items-center justify-between px-4 py-3 rounded-[var(--radius-button)] mb-4",
                isValid
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              )}
            >
              <div className="flex items-center gap-2">
                {!isValid && (
                  <AlertCircle className="h-4 w-4 text-expense flex-shrink-0" />
                )}
                <span className="text-sm font-medium text-neutral-700">
                  Split total: {formatCurrency(splitSumCents)}
                </span>
              </div>
              <span
                className={cn(
                  "text-sm font-medium",
                  isValid ? "text-income" : "text-expense"
                )}
              >
                {isValid
                  ? "✓ Matches"
                  : `${difference > 0 ? "Under" : "Over"} by ${formatCurrency(Math.abs(transactionAmount - splitSumCents))}`}
              </span>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-[var(--radius-button)] mb-4 text-sm text-expense">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClearSplits}
                disabled={isSaving}
                className="px-4 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-neutral-600 text-sm font-medium hover:bg-neutral-50 transition-colors min-h-[44px]"
              >
                Clear Splits
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !isValid}
                className="px-4 py-2.5 rounded-[var(--radius-button)] bg-primary text-white font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {isSaving ? "Saving..." : "Save Splits"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
