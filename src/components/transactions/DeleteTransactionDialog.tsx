"use client";

import { AlertTriangle } from "lucide-react";

interface DeleteTransactionDialogProps {
  transactionName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

export function DeleteTransactionDialog({
  transactionName,
  onConfirm,
  onCancel,
  isDeleting,
}: DeleteTransactionDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm delete transaction"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-[var(--radius-card)] p-6 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-expense" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900">
            Delete Transaction
          </h2>
        </div>
        <p className="text-sm text-neutral-600 mb-2">
          Are you sure you want to delete{" "}
          <span className="font-semibold">&ldquo;{transactionName}&rdquo;</span>?
        </p>
        <p className="text-sm text-neutral-500 mb-6">
          This will also remove any associated splits. This action cannot be
          undone.
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
