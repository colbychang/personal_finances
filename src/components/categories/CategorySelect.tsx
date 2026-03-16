"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";

export interface CategoryOption {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  isPredefined: boolean;
}

interface CategorySelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  className?: string;
  /** If true, allows multi-select (for filters) */
  multiple?: boolean;
  /** For multi-select: array of selected values */
  selectedValues?: string[];
  /** For multi-select: callback */
  onMultiChange?: (values: string[]) => void;
}

export function CategorySelect({
  value,
  onChange,
  placeholder = "Select category...",
  error,
  className,
  multiple = false,
  selectedValues = [],
  onMultiChange,
}: CategorySelectProps) {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch("/api/categories");
        const data = await res.json();
        setCategories(data.categories);
      } catch {
        console.error("Failed to fetch categories");
      } finally {
        setIsLoading(false);
      }
    }
    fetchCategories();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedCategory = categories.find((c) => c.name === value);

  function handleSelect(categoryName: string) {
    if (multiple && onMultiChange) {
      const newValues = selectedValues.includes(categoryName)
        ? selectedValues.filter((v) => v !== categoryName)
        : [...selectedValues, categoryName];
      onMultiChange(newValues);
    } else {
      onChange(categoryName);
      setIsOpen(false);
    }
  }

  if (isLoading) {
    return (
      <div
        className={cn(
          "w-full px-3 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-sm min-h-[44px] bg-neutral-50 text-neutral-400 animate-pulse",
          className
        )}
      >
        Loading categories...
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2.5 rounded-[var(--radius-button)] border text-sm min-h-[44px] bg-white text-left",
          error
            ? "border-expense focus:ring-expense"
            : "border-neutral-300 focus:ring-primary hover:border-neutral-400"
        )}
      >
        {multiple ? (
          <span className={selectedValues.length > 0 ? "text-neutral-900" : "text-neutral-400"}>
            {selectedValues.length > 0
              ? `${selectedValues.length} selected`
              : placeholder}
          </span>
        ) : selectedCategory ? (
          <span className="flex items-center gap-2 text-neutral-900">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: selectedCategory.color ?? "#94a3b8" }}
            />
            {selectedCategory.name}
          </span>
        ) : (
          <span className="text-neutral-400">{placeholder}</span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-neutral-400 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-[var(--radius-card)] border border-neutral-200 shadow-lg max-h-60 overflow-y-auto">
          {!multiple && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-neutral-400 hover:bg-neutral-50 min-h-[44px]"
            >
              {placeholder}
            </button>
          )}
          {categories.map((cat) => {
            const isSelected = multiple
              ? selectedValues.includes(cat.name)
              : value === cat.name;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelect(cat.name)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-neutral-50 min-h-[44px]",
                  isSelected && "bg-primary/5 text-primary font-medium"
                )}
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color ?? "#94a3b8" }}
                />
                <CategoryIcon icon={cat.icon} className="h-4 w-4 text-neutral-500" />
                <span className="truncate">{cat.name}</span>
                {multiple && isSelected && (
                  <span className="ml-auto text-primary">✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-expense">{error}</p>}
    </div>
  );
}
