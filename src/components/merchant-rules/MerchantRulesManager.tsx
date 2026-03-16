"use client";

import { useState, useEffect } from "react";
import { Pencil, Trash2, X, Check, BookOpen } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { CategorySelect } from "@/components/categories/CategorySelect";

interface MerchantRule {
  id: number;
  merchantKey: string;
  label: string;
  category: string;
  isTransfer: boolean;
  updatedAt: string;
}

export function MerchantRulesManager() {
  const { showToast } = useToast();
  const [rules, setRules] = useState<MerchantRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch rules
  useEffect(() => {
    fetchRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchRules() {
    try {
      const res = await fetch("/api/merchant-rules");
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules);
      }
    } catch (error) {
      console.error("Failed to fetch merchant rules:", error);
      showToast("Failed to load merchant rules");
    } finally {
      setIsLoading(false);
    }
  }

  function startEdit(rule: MerchantRule) {
    setEditingId(rule.id);
    setEditCategory(rule.category);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditCategory("");
  }

  async function saveEdit(ruleId: number) {
    if (!editCategory.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/merchant-rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: editCategory }),
      });

      if (!res.ok) {
        showToast("Failed to update merchant rule");
        return;
      }

      const data = await res.json();
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? data.rule : r))
      );
      setEditingId(null);
      showToast("Rule updated", "success");
    } catch (error) {
      console.error("Failed to update rule:", error);
      showToast("Failed to update merchant rule");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteRule(ruleId: number) {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/merchant-rules/${ruleId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        showToast("Failed to delete merchant rule");
        return;
      }

      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      setDeletingId(null);
      showToast("Rule deleted", "success");
    } catch (error) {
      console.error("Failed to delete rule:", error);
      showToast("Failed to delete merchant rule");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Loading state
  if (isLoading) {
    return (
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
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (rules.length === 0) {
    return (
      <div className="text-center py-12 px-6">
        <div className="mx-auto w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
          <BookOpen className="h-7 w-7 text-neutral-400" />
        </div>
        <h3 className="text-base font-semibold text-neutral-900 mb-2">
          No merchant rules yet
        </h3>
        <p className="text-sm text-neutral-500 max-w-sm mx-auto">
          Merchant rules are created automatically when you change a
          transaction&apos;s category. They help auto-categorize future
          transactions from the same merchant.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4"
        >
          {/* Delete Confirmation */}
          {deletingId === rule.id ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-neutral-700">
                Delete rule for <strong>{rule.label}</strong>?
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDeletingId(null)}
                  className="px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 rounded-[var(--radius-button)] transition-colors min-h-[36px]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteRule(rule.id)}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-sm text-white bg-red-600 hover:bg-red-700 rounded-[var(--radius-button)] transition-colors disabled:opacity-50 min-h-[36px]"
                >
                  {isSubmitting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          ) : editingId === rule.id ? (
            /* Edit Mode */
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate mb-2">
                  {rule.label}
                </p>
                <div className="w-full max-w-xs">
                  <CategorySelect
                    value={editCategory}
                    onChange={setEditCategory}
                    placeholder="Select category..."
                  />
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => saveEdit(rule.id)}
                  disabled={isSubmitting || !editCategory.trim()}
                  className="p-2 rounded-[var(--radius-button)] text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                  aria-label="Save changes"
                  title="Save"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={cancelEdit}
                  className="p-2 rounded-[var(--radius-button)] text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
                  aria-label="Cancel editing"
                  title="Cancel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Display Mode */
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {rule.label}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  → {rule.category}
                  {rule.isTransfer && (
                    <span className="ml-2 text-[10px] font-medium bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded-full">
                      Transfer
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() => startEdit(rule)}
                  className="p-2 rounded-[var(--radius-button)] text-neutral-400 hover:text-primary hover:bg-neutral-100 transition-colors"
                  aria-label={`Edit rule for ${rule.label}`}
                  title="Edit rule"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDeletingId(rule.id)}
                  className="p-2 rounded-[var(--radius-button)] text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  aria-label={`Delete rule for ${rule.label}`}
                  title="Delete rule"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
