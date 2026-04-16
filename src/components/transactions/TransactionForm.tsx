"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategorySelect } from "@/components/categories/CategorySelect";

// ─── Types ──────────────────────────────────────────────────────────────

export interface TransactionFormData {
  date: string;
  overrideMonth: string;
  name: string;
  amount: string;
  type: "expense" | "income";
  accountId: string;
  category: string;
  notes: string;
  isTransfer: boolean;
}

interface FormErrors {
  date?: string;
  overrideMonth?: string;
  name?: string;
  amount?: string;
  accountId?: string;
}

interface AccountOption {
  id: number;
  name: string;
  type: string;
}

interface TransactionFormProps {
  mode: "add" | "edit";
  initialData: TransactionFormData;
  accounts: AccountOption[];
  onSubmit: (data: TransactionFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────

export function TransactionForm({
  mode,
  initialData,
  accounts,
  onSubmit,
  onCancel,
  isSubmitting,
}: TransactionFormProps) {
  const [form, setForm] = useState<TransactionFormData>(initialData);
  const [errors, setErrors] = useState<FormErrors>({});

  function validate(): boolean {
    const newErrors: FormErrors = {};

    // Date validation
    if (!form.date) {
      newErrors.date = "Date is required";
    } else {
      const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!isoDateRegex.test(form.date)) {
        newErrors.date = "Invalid date format";
      } else {
        const parsed = new Date(form.date + "T00:00:00");
        if (isNaN(parsed.getTime())) {
          newErrors.date = "Invalid date";
        }
      }
    }

    // Name validation
    if (!form.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (form.overrideMonth) {
      const monthRegex = /^\d{4}-\d{2}$/;
      if (!monthRegex.test(form.overrideMonth)) {
        newErrors.overrideMonth = "Override month must be in YYYY-MM format";
      }
    }

    // Amount validation
    if (!form.amount.trim()) {
      newErrors.amount = "Amount is required";
    } else {
      const num = parseFloat(form.amount);
      if (isNaN(num)) {
        newErrors.amount = "Amount must be a valid number";
      } else if (num <= 0) {
        newErrors.amount = "Amount must be greater than zero";
      }
    }

    // Account validation
    if (!form.accountId) {
      newErrors.accountId = "Account is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) {
      onSubmit(form);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "add" ? "Add Transaction" : "Edit Transaction"}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* Modal / Drawer */}
      <div className="relative w-full md:max-w-md bg-white rounded-t-2xl md:rounded-[var(--radius-card)] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-neutral-900">
            {mode === "add" ? "Add Transaction" : "Edit Transaction"}
          </h2>
          <button
            onClick={onCancel}
            className="p-2.5 rounded-[var(--radius-button)] text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Expense / Income Toggle */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Type
            </label>
            <div className="flex rounded-[var(--radius-button)] border border-neutral-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setForm({ ...form, type: "expense" })}
                className={cn(
                  "flex-1 px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px]",
                  form.type === "expense"
                    ? "bg-expense text-white"
                    : "bg-white text-neutral-600 hover:bg-neutral-50"
                )}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, type: "income" })}
                className={cn(
                  "flex-1 px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px]",
                  form.type === "income"
                    ? "bg-income text-white"
                    : "bg-white text-neutral-600 hover:bg-neutral-50"
                )}
              >
                Income
              </button>
            </div>
          </div>

          {/* Date */}
          <div>
            <label
              htmlFor="txn-date"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Date <span className="text-expense">*</span>
            </label>
            <input
              id="txn-date"
              type="date"
              value={form.date}
              onChange={(e) => {
                setForm({ ...form, date: e.target.value });
                if (errors.date) setErrors({ ...errors, date: undefined });
              }}
              className={cn(
                "w-full px-3 py-2.5 rounded-[var(--radius-button)] border text-sm min-h-[44px]",
                errors.date
                  ? "border-expense focus:ring-expense"
                  : "border-neutral-300 focus:ring-primary"
              )}
            />
            {errors.date && (
              <p className="mt-1 text-xs text-expense">{errors.date}</p>
            )}
          </div>

          {/* Override Month */}
          <div>
            <label
              htmlFor="txn-override-month"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Budget Override Month
            </label>
            <input
              id="txn-override-month"
              type="month"
              value={form.overrideMonth}
              onChange={(e) => {
                setForm({ ...form, overrideMonth: e.target.value });
                if (errors.overrideMonth) {
                  setErrors({ ...errors, overrideMonth: undefined });
                }
              }}
              className={cn(
                "w-full px-3 py-2.5 rounded-[var(--radius-button)] border text-sm min-h-[44px]",
                errors.overrideMonth
                  ? "border-expense focus:ring-expense"
                  : "border-neutral-300 focus:ring-primary"
              )}
            />
            <p className="mt-1 text-xs text-neutral-500">
              Optional. Use this when the spending belongs to a different
              budget month than the posted date.
            </p>
            {errors.overrideMonth && (
              <p className="mt-1 text-xs text-expense">
                {errors.overrideMonth}
              </p>
            )}
          </div>

          {/* Name */}
          <div>
            <label
              htmlFor="txn-name"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Name <span className="text-expense">*</span>
            </label>
            <input
              id="txn-name"
              type="text"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                if (errors.name) setErrors({ ...errors, name: undefined });
              }}
              className={cn(
                "w-full px-3 py-2.5 rounded-[var(--radius-button)] border text-sm min-h-[44px]",
                errors.name
                  ? "border-expense focus:ring-expense"
                  : "border-neutral-300 focus:ring-primary"
              )}
              placeholder="e.g., Whole Foods, Monthly Rent"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-expense">{errors.name}</p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label
              htmlFor="txn-amount"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Amount <span className="text-expense">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">
                $
              </span>
              <input
                id="txn-amount"
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => {
                  setForm({ ...form, amount: e.target.value });
                  if (errors.amount)
                    setErrors({ ...errors, amount: undefined });
                }}
                className={cn(
                  "w-full pl-7 pr-3 py-2.5 rounded-[var(--radius-button)] border text-sm min-h-[44px]",
                  errors.amount
                    ? "border-expense focus:ring-expense"
                    : "border-neutral-300 focus:ring-primary"
                )}
                placeholder="0.00"
              />
            </div>
            {errors.amount && (
              <p className="mt-1 text-xs text-expense">{errors.amount}</p>
            )}
          </div>

          {/* Account */}
          <div>
            <label
              htmlFor="txn-account"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Account <span className="text-expense">*</span>
            </label>
            <select
              id="txn-account"
              value={form.accountId}
              onChange={(e) => {
                setForm({ ...form, accountId: e.target.value });
                if (errors.accountId)
                  setErrors({ ...errors, accountId: undefined });
              }}
              className={cn(
                "w-full px-3 py-2.5 rounded-[var(--radius-button)] border text-sm min-h-[44px] bg-white",
                errors.accountId
                  ? "border-expense focus:ring-expense"
                  : "border-neutral-300 focus:ring-primary"
              )}
            >
              <option value="">Select account...</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={String(acc.id)}>
                  {acc.name}
                </option>
              ))}
            </select>
            {errors.accountId && (
              <p className="mt-1 text-xs text-expense">{errors.accountId}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Category
            </label>
            <CategorySelect
              value={form.category}
              onChange={(val) => setForm({ ...form, category: val })}
              placeholder="Select category..."
            />
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="txn-notes"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Notes
            </label>
            <textarea
              id="txn-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-sm min-h-[44px] focus:ring-primary"
              placeholder="Optional notes..."
            />
          </div>

          {/* Transfer Toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <label
                htmlFor="txn-transfer"
                className="text-sm font-medium text-neutral-700"
              >
                Mark as Transfer
              </label>
              <p className="text-xs text-neutral-500">
                Transfers are excluded from spending &amp; budgets
              </p>
            </div>
            <button
              type="button"
              id="txn-transfer"
              role="switch"
              aria-checked={form.isTransfer}
              onClick={() => setForm({ ...form, isTransfer: !form.isTransfer })}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors flex-shrink-0",
                form.isTransfer ? "bg-primary" : "bg-neutral-300"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm",
                  form.isTransfer && "translate-x-5"
                )}
              />
            </button>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 rounded-[var(--radius-button)] bg-primary text-white font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {isSubmitting
                ? "Saving..."
                : mode === "add"
                  ? "Add Transaction"
                  : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
