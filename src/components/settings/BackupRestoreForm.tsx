"use client";

import { ChangeEvent, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

type RestorePreview = {
  valid: boolean;
  sourceWorkspaceName: string | null;
  exportedAt: string | null;
  warnings: string[];
  counts: Record<string, number>;
};

type RestoreState = "idle" | "previewing" | "ready" | "restoring" | "restored";

function formatExportDate(value: string | null) {
  if (!value) return "Unknown export date";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function BackupRestoreForm() {
  const [backup, setBackup] = useState<unknown | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [state, setState] = useState<RestoreState>("idle");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setConfirmed(false);
    setMessage(null);
    setError(null);

    if (!file) {
      setBackup(null);
      setState("idle");
      return;
    }

    try {
      const parsed = JSON.parse(await file.text());
      setBackup(parsed);
      setState("idle");
    } catch {
      setBackup(null);
      setState("idle");
      setError("That file is not valid JSON.");
    }
  }

  async function requestRestore(dryRun: boolean) {
    if (!backup) {
      setError("Choose a Glacier backup JSON file first.");
      return;
    }

    setError(null);
    setMessage(null);
    setState(dryRun ? "previewing" : "restoring");

    try {
      const response = await fetch("/api/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          backup,
          dryRun,
          confirm: !dryRun && confirmed,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Restore request failed.");
      }

      if (dryRun) {
        setPreview(result);
        setState("ready");
        return;
      }

      setPreview(result);
      setState("restored");
      setConfirmed(false);
      setMessage("Backup restored. Refresh the app to see the restored data.");
    } catch (restoreError) {
      setState(preview ? "ready" : "idle");
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Restore request failed.",
      );
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-start gap-3">
        <RotateCcw className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h3 className="font-semibold text-neutral-900">Restore from Backup</h3>
          <p className="mt-1 text-sm text-neutral-600">
            Preview a Glacier backup before replacing this workspace&apos;s finance data.
          </p>
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <input
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          className="block w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700 file:mr-3 file:rounded-xl file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary"
        />
        <button
          type="button"
          disabled={!backup || state === "previewing" || state === "restoring"}
          onClick={() => requestRestore(true)}
          className="min-h-[44px] rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "previewing" ? "Previewing..." : "Preview Backup"}
        </button>
      </div>

      {preview ? (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <div className="font-semibold">
            {preview.sourceWorkspaceName ?? "Glacier backup"} from{" "}
            {formatExportDate(preview.exportedAt)}
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <span>{preview.counts.accounts ?? 0} accounts</span>
            <span>{preview.counts.transactions ?? 0} transactions</span>
            <span>{preview.counts.budgets ?? 0} budgets</span>
          </div>
          <div className="mt-3 flex gap-2 text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{preview.warnings.join(" ")}</p>
          </div>
          <label className="mt-4 flex items-start gap-2 text-neutral-700">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-1"
            />
            <span>
              I understand this will replace the current workspace&apos;s finance data.
            </span>
          </label>
          <button
            type="button"
            disabled={!confirmed || state === "restoring"}
            onClick={() => requestRestore(false)}
            className="mt-4 min-h-[44px] rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state === "restoring" ? "Restoring..." : "Restore Backup"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
