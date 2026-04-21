import { Activity, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { OperationsStatus } from "@/lib/operations/status";

function formatDateTime(value: string | null) {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "good" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-neutral-200 bg-neutral-50 text-neutral-700";

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.12em] opacity-75">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

export function OperationsStatusCard({ status }: { status: OperationsStatus }) {
  const hasWarnings =
    status.plaid.erroredConnections > 0 ||
    status.plaid.syncingConnections > 0 ||
    status.queuedSyncJobs.failed > 0;

  return (
    <section className="mb-10 rounded-[var(--radius-card)] border border-neutral-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              Operations Status
            </h2>
            <p className="text-sm text-neutral-500">
              Quick health summary for sync jobs, Plaid connections, and recovery checks.
            </p>
          </div>
        </div>
        <div
          className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
            hasWarnings
              ? "bg-amber-50 text-amber-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {hasWarnings ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {hasWarnings ? "Needs attention" : "Healthy"}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <StatusPill
          label="Plaid Connections"
          value={status.plaid.totalConnections}
          tone="neutral"
        />
        <StatusPill
          label="Sync Errors"
          value={status.plaid.erroredConnections + status.queuedSyncJobs.failed}
          tone={status.plaid.erroredConnections + status.queuedSyncJobs.failed > 0 ? "warn" : "good"}
        />
        <StatusPill
          label="Queued Jobs"
          value={status.queuedSyncJobs.pending + status.queuedSyncJobs.running}
          tone={status.queuedSyncJobs.pending + status.queuedSyncJobs.running > 0 ? "warn" : "good"}
        />
      </div>

      <div className="mt-5 grid gap-3 text-sm text-neutral-600 md:grid-cols-2">
        <div className="rounded-2xl bg-neutral-50 p-4">
          <div className="flex items-center gap-2 font-semibold text-neutral-800">
            <Clock className="h-4 w-4 text-primary" />
            Last successful sync window
          </div>
          <p className="mt-2">
            Newest sync:{" "}
            <span className="font-medium text-neutral-900">
              {formatDateTime(status.plaid.newestLastSyncAt)}
            </span>
          </p>
          <p>
            Oldest sync:{" "}
            <span className="font-medium text-neutral-900">
              {formatDateTime(status.plaid.oldestLastSyncAt)}
            </span>
          </p>
        </div>
        <div className="rounded-2xl bg-neutral-50 p-4">
          <div className="font-semibold text-neutral-800">Recovery</div>
          <p className="mt-2">
            Use the backup export below before major data cleanup or category changes.
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Checked {formatDateTime(status.checkedAt)}
          </p>
        </div>
      </div>
    </section>
  );
}
