"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  CreditCard,
  Landmark,
  PiggyBank,
  TrendingUp,
  AlertTriangle,
  X,
  Wallet,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { PlaidLinkButton } from "@/components/plaid/PlaidLinkButton";
import type { AccountSection, AccountWithInstitution } from "@/db/queries/accounts";

// ─── Types ──────────────────────────────────────────────────────────────

interface AccountFormData {
  name: string;
  institution: string;
  type: string;
  balance: string;
}

interface FormErrors {
  name?: string;
  institution?: string;
  type?: string;
  balance?: string;
}

// ─── Type badge & icon helpers ──────────────────────────────────────────

const TYPE_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  checking: { label: "Checking", color: "text-blue-700", bg: "bg-blue-100" },
  savings: { label: "Savings", color: "text-emerald-700", bg: "bg-emerald-100" },
  credit: { label: "Credit Card", color: "text-orange-700", bg: "bg-orange-100" },
  investment: { label: "Investment", color: "text-purple-700", bg: "bg-purple-100" },
  retirement: { label: "Retirement", color: "text-indigo-700", bg: "bg-indigo-100" },
};

function TypeBadge({ type }: { type: string }) {
  const config = TYPE_CONFIG[type] ?? {
    label: type,
    color: "text-neutral-700",
    bg: "bg-neutral-100",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        config.bg,
        config.color
      )}
    >
      {config.label}
    </span>
  );
}

function SectionIcon({ section }: { section: string }) {
  switch (section) {
    case "Checking & Savings":
      return <PiggyBank className="h-5 w-5 text-blue-600" />;
    case "Credit Cards":
      return <CreditCard className="h-5 w-5 text-orange-600" />;
    case "Investments & Retirement":
      return <TrendingUp className="h-5 w-5 text-purple-600" />;
    default:
      return <Landmark className="h-5 w-5 text-neutral-600" />;
  }
}

// ─── Account Card ───────────────────────────────────────────────────────

function AccountCard({
  account,
  onEdit,
  onDelete,
}: {
  account: AccountWithInstitution;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold text-neutral-900 truncate">
            {account.name}
          </h3>
          <TypeBadge type={account.type} />
        </div>
        <p className="text-xs text-neutral-500 flex items-center gap-1">
          <Building2 className="h-3 w-3" />
          {account.institutionName}
        </p>
      </div>
      <div className="flex items-center gap-3 ml-4">
        <span className="text-base font-semibold currency text-neutral-900 whitespace-nowrap">
          {formatCurrency(account.balanceCurrent)}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-2.5 rounded-[var(--radius-button)] text-neutral-400 hover:text-primary hover:bg-neutral-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={`Edit ${account.name}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2.5 rounded-[var(--radius-button)] text-neutral-400 hover:text-expense hover:bg-red-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={`Delete ${account.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="mx-auto w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
        <Wallet className="h-8 w-8 text-neutral-400" />
      </div>
      <h2 className="text-lg font-semibold text-neutral-900 mb-2">
        No accounts yet
      </h2>
      <p className="text-neutral-500 mb-6 max-w-md mx-auto">
        Add your first account to start tracking your finances. You can add
        checking accounts, savings, credit cards, and investment accounts.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-[var(--radius-button)] font-medium hover:bg-primary-dark transition-colors min-h-[44px]"
      >
        <Plus className="h-4 w-4" />
        Add Your First Account
      </button>
    </div>
  );
}

// ─── Account Form (Modal) ───────────────────────────────────────────────

function AccountForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  mode: "add" | "edit";
  initialData: AccountFormData;
  onSubmit: (data: AccountFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<AccountFormData>(initialData);
  const [errors, setErrors] = useState<FormErrors>({});

  function validate(): boolean {
    const newErrors: FormErrors = {};

    if (!form.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!form.institution.trim()) {
      newErrors.institution = "Institution is required";
    }

    if (!form.type) {
      newErrors.type = "Account category is required";
    }

    if (!form.balance.trim()) {
      newErrors.balance = "Balance is required";
    } else if (isNaN(parseFloat(form.balance))) {
      newErrors.balance = "Balance must be a valid number";
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
      aria-label={mode === "add" ? "Add Account" : "Edit Account"}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* Modal / Drawer */}
      <div className="relative w-full md:max-w-md bg-white rounded-t-2xl md:rounded-[var(--radius-card)] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-neutral-900">
            {mode === "add" ? "Add Account" : "Edit Account"}
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
          {/* Name */}
          <div>
            <label
              htmlFor="account-name"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Account Name <span className="text-expense">*</span>
            </label>
            <input
              id="account-name"
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
              placeholder="e.g., Main Checking"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-expense">{errors.name}</p>
            )}
          </div>

          {/* Institution */}
          <div>
            <label
              htmlFor="account-institution"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Institution <span className="text-expense">*</span>
            </label>
            <input
              id="account-institution"
              type="text"
              value={form.institution}
              onChange={(e) => {
                setForm({ ...form, institution: e.target.value });
                if (errors.institution)
                  setErrors({ ...errors, institution: undefined });
              }}
              className={cn(
                "w-full px-3 py-2.5 rounded-[var(--radius-button)] border text-sm min-h-[44px]",
                errors.institution
                  ? "border-expense focus:ring-expense"
                  : "border-neutral-300 focus:ring-primary"
              )}
              placeholder="e.g., Chase, Wells Fargo"
            />
            {errors.institution && (
              <p className="mt-1 text-xs text-expense">{errors.institution}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label
              htmlFor="account-type"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Account Category <span className="text-expense">*</span>
            </label>
            <select
              id="account-type"
              value={form.type}
              onChange={(e) => {
                setForm({ ...form, type: e.target.value });
                if (errors.type) setErrors({ ...errors, type: undefined });
              }}
              className={cn(
                "w-full px-3 py-2.5 rounded-[var(--radius-button)] border text-sm min-h-[44px] bg-white",
                errors.type
                  ? "border-expense focus:ring-expense"
                  : "border-neutral-300 focus:ring-primary"
              )}
            >
              <option value="">Select category...</option>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit Card</option>
              <option value="investment">Investment</option>
              <option value="retirement">Retirement</option>
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Investment and retirement accounts stay in net worth, but their
              transactions are excluded from spending, budgets, and AI
              categorization.
            </p>
            {errors.type && (
              <p className="mt-1 text-xs text-expense">{errors.type}</p>
            )}
          </div>

          {/* Balance */}
          <div>
            <label
              htmlFor="account-balance"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Balance <span className="text-expense">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">
                $
              </span>
              <input
                id="account-balance"
                type="text"
                inputMode="decimal"
                value={form.balance}
                onChange={(e) => {
                  setForm({ ...form, balance: e.target.value });
                  if (errors.balance)
                    setErrors({ ...errors, balance: undefined });
                }}
                className={cn(
                  "w-full pl-7 pr-3 py-2.5 rounded-[var(--radius-button)] border text-sm min-h-[44px]",
                  errors.balance
                    ? "border-expense focus:ring-expense"
                    : "border-neutral-300 focus:ring-primary"
                )}
                placeholder="0.00"
              />
            </div>
            {errors.balance && (
              <p className="mt-1 text-xs text-expense">{errors.balance}</p>
            )}
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
                  ? "Add Account"
                  : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirmation Dialog ─────────────────────────────────────────

function DeleteDialog({
  accountName,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  accountName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm delete"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-[var(--radius-card)] p-6 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-expense" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900">
            Delete Account
          </h2>
        </div>
        <p className="text-sm text-neutral-600 mb-2">
          Are you sure you want to delete{" "}
          <span className="font-semibold">{accountName}</span>?
        </p>
        <p className="text-sm text-neutral-500 mb-6">
          This will also permanently delete all transactions associated with
          this account. This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors min-h-[44px]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 rounded-[var(--radius-button)] bg-expense text-white font-medium hover:bg-red-600 transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Client Component ──────────────────────────────────────────────

interface AccountsClientProps {
  initialSections: AccountSection[];
}

export function AccountsClient({ initialSections }: AccountsClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [sections, setSections] = useState<AccountSection[]>(initialSections);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] =
    useState<AccountWithInstitution | null>(null);
  const [deletingAccount, setDeletingAccount] =
    useState<AccountWithInstitution | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasAccounts = sections.length > 0;

  async function refreshData() {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setSections(data.sections);
    } catch {
      // Fallback: force Next.js router refresh
      router.refresh();
    }
  }

  async function handleAdd(data: AccountFormData) {
    setIsSubmitting(true);
    try {
      const balance = parseFloat(data.balance);
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          institution: data.institution,
          type: data.type,
          balance,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        showToast(errorData.error || "Failed to create account");
        return;
      }

      setShowForm(false);
      await refreshData();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEdit(data: AccountFormData) {
    if (!editingAccount) return;
    setIsSubmitting(true);
    try {
      const balance = parseFloat(data.balance);
      const res = await fetch(`/api/accounts/${editingAccount.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          institution: data.institution,
          type: data.type,
          balance,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        showToast(errorData.error || "Failed to update account");
        return;
      }

      setEditingAccount(null);
      await refreshData();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deletingAccount) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/accounts/${deletingAccount.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        showToast("Failed to delete account");
        return;
      }

      setDeletingAccount(null);
      await refreshData();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {/* Add Account + Connect Bank Buttons (shown when accounts exist) */}
      {hasAccounts && (
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-[var(--radius-button)] font-medium hover:bg-primary-dark transition-colors min-h-[44px]"
          >
            <Plus className="h-4 w-4" />
            Add Account
          </button>
          <PlaidLinkButton onSuccess={refreshData} />
        </div>
      )}

      {/* Empty State */}
      {!hasAccounts && (
        <>
          <EmptyState onAdd={() => setShowForm(true)} />
          <div className="flex justify-center mt-4">
            <PlaidLinkButton onSuccess={refreshData} />
          </div>
        </>
      )}

      {/* Sections */}
      {sections.map((section) => (
        <section key={section.section} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <SectionIcon section={section.section} />
              <h2 className="text-base font-semibold text-neutral-800">
                {section.section}
              </h2>
            </div>
            <span className="text-sm font-medium currency text-neutral-500">
              {formatCurrency(section.subtotal)}
            </span>
          </div>
          <div className="space-y-2">
            {section.accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={() => setEditingAccount(account)}
                onDelete={() => setDeletingAccount(account)}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Add Form Modal */}
      {showForm && (
        <AccountForm
          mode="add"
          initialData={{ name: "", institution: "", type: "", balance: "" }}
          onSubmit={handleAdd}
          onCancel={() => setShowForm(false)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Edit Form Modal */}
      {editingAccount && (
        <AccountForm
          mode="edit"
          initialData={{
            name: editingAccount.name,
            institution: editingAccount.institutionName,
            type: editingAccount.type,
            balance: (editingAccount.balanceCurrent / 100).toFixed(2),
          }}
          onSubmit={handleEdit}
          onCancel={() => setEditingAccount(null)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Delete Confirmation */}
      {deletingAccount && (
        <DeleteDialog
          accountName={deletingAccount.name}
          onConfirm={handleDelete}
          onCancel={() => setDeletingAccount(null)}
          isDeleting={isSubmitting}
        />
      )}
    </>
  );
}
