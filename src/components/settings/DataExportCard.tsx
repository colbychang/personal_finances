import { Download } from "lucide-react";

export function DataExportCard() {
  return (
    <section className="mb-10 rounded-[var(--radius-card)] border border-neutral-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              Backup Export
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Download a workspace-scoped JSON backup of accounts, transactions,
              budgets, categories, merchant rules, snapshots, and sanitized Plaid metadata.
            </p>
          </div>
        </div>
        <a
          href="/api/export"
          className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-button)] bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
        >
          Download Backup
        </a>
      </div>
    </section>
  );
}
