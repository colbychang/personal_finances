"use client";

import { useState } from "react";
import { Plus, X, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";

export interface Category {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  isPredefined: boolean;
  sortOrder: number;
}

interface CategoriesManagerProps {
  initialCategories: Category[];
}

export function CategoriesManager({ initialCategories }: CategoriesManagerProps) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const predefined = categories.filter((c) => c.isPredefined);
  const custom = categories.filter((c) => !c.isPredefined);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = newName.trim();
    if (!trimmed) {
      setError("Category name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create category");
        return;
      }

      const { category } = await res.json();
      setCategories([...categories, category]);
      setNewName("");
      setShowForm(false);
    } catch {
      setError("Failed to create category. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      {/* Predefined Categories */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">
            Predefined Categories
          </h3>
          <Lock className="h-3.5 w-3.5 text-neutral-400" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {predefined.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-[var(--radius-button)] border border-neutral-200"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: cat.color ?? "#94a3b8" }}
              >
                <CategoryIcon icon={cat.icon} className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-neutral-800 truncate">
                {cat.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Categories */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">
            Custom Categories
          </h3>
          {!showForm && (
            <button
              onClick={() => {
                setShowForm(true);
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/5 rounded-[var(--radius-button)] transition-colors min-h-[44px]"
            >
              <Plus className="h-4 w-4" />
              Add Category
            </button>
          )}
        </div>

        {/* Add Category Form */}
        {showForm && (
          <form onSubmit={handleCreate} className="mb-4">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Category name..."
                  autoFocus
                  className={cn(
                    "w-full px-3 py-2.5 rounded-[var(--radius-button)] border text-sm min-h-[44px]",
                    error
                      ? "border-expense focus:ring-expense"
                      : "border-neutral-300 focus:ring-primary"
                  )}
                />
                {error && (
                  <p className="mt-1 text-xs text-expense">{error}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2.5 bg-primary text-white rounded-[var(--radius-button)] font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 min-h-[44px] text-sm"
              >
                {isSubmitting ? "Adding..." : "Add"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setNewName("");
                  setError(null);
                }}
                className="p-2.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-[var(--radius-button)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}

        {/* Custom categories list */}
        {custom.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {custom.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-[var(--radius-button)] border border-neutral-200"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: cat.color ?? "#94a3b8" }}
                >
                  <CategoryIcon icon={cat.icon} className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-medium text-neutral-800 truncate">
                  {cat.name}
                </span>
              </div>
            ))}
          </div>
        ) : (
          !showForm && (
            <div className="text-center py-8 border border-dashed border-neutral-300 rounded-[var(--radius-card)]">
              <p className="text-sm text-neutral-500 mb-2">
                No custom categories yet
              </p>
              <button
                onClick={() => {
                  setShowForm(true);
                  setError(null);
                }}
                className="text-sm text-primary hover:text-primary-dark font-medium"
              >
                Create your first custom category
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
