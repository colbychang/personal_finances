"use client";

import { FormEvent, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function DeleteAccountCard({ email }: { email: string | null }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!email || confirmEmail.trim().toLowerCase() !== email.toLowerCase()) {
      setError("Type your account email exactly to confirm deletion.");
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmEmail }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to delete account data.");
      }

      setMessage(
        result.authUserDeleted
          ? "Your workspace data and login account were deleted."
          : "Your workspace data was deleted. Sign-in account deletion needs the Supabase service-role key configured.",
      );
      await supabase.auth.signOut();
      window.location.assign("/sign-in?message=" + encodeURIComponent("Your Glacier data has been deleted."));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete account data.",
      );
      setIsDeleting(false);
    }
  }

  return (
    <section className="mb-10 rounded-[var(--radius-card)] border border-rose-200 bg-rose-50 p-5">
      <div className="flex items-start gap-3">
        <Trash2 className="mt-0.5 h-5 w-5 text-rose-700" />
        <div>
          <h2 className="text-lg font-semibold text-rose-950">Delete Account Data</h2>
          <p className="mt-1 text-sm text-rose-900">
            Permanently delete this workspace&apos;s financial data, Plaid connections,
            budgets, categories, snapshots, and rules. This action cannot be undone.
          </p>
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-300 bg-white px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-rose-950">
            Type {email ?? "your account email"} to confirm
          </span>
          <input
            required
            type="email"
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            autoComplete="email"
            className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-neutral-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15"
          />
        </label>
        <button
          type="submit"
          disabled={isDeleting}
          className="rounded-2xl bg-rose-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDeleting ? "Deleting..." : "Delete My Data"}
        </button>
      </form>
    </section>
  );
}
