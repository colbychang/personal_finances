"use client";

import { useState, useCallback } from "react";
import {
  Camera,
  TrendingUp,
  DollarSign,
  CreditCard,
  PiggyBank,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatCurrency, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import type { SnapshotRow, AccountBalance, AccountBalanceHistoryRow } from "@/db/queries/snapshots";
import { NetWorthChart } from "./NetWorthChart";
import { AccountHistoryTable } from "./AccountHistoryTable";

// ─── Types ──────────────────────────────────────────────────────────────

interface NetWorthClientProps {
  initialSnapshots: SnapshotRow[];
  initialAccountHistory: AccountBalanceHistoryRow[];
}

// ─── Empty State ────────────────────────────────────────────────────────

function EmptyState({ onTakeSnapshot, isLoading }: { onTakeSnapshot: () => void; isLoading: boolean }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="mx-auto w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
        <TrendingUp className="h-8 w-8 text-neutral-400" />
      </div>
      <h2 className="text-lg font-semibold text-neutral-900 mb-2">
        No snapshots yet
      </h2>
      <p className="text-neutral-500 mb-6 max-w-md mx-auto">
        Take your first snapshot to start tracking your net worth over time.
        Snapshots capture all your account balances and calculate your total assets,
        liabilities, and net worth.
      </p>
      <button
        onClick={onTakeSnapshot}
        disabled={isLoading}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-[var(--radius-button)] font-medium hover:bg-primary-dark transition-colors min-h-[44px] disabled:opacity-50"
      >
        <Camera className="h-4 w-4" />
        {isLoading ? "Taking Snapshot..." : "Take Your First Snapshot"}
      </button>
    </div>
  );
}

// ─── Summary Cards ──────────────────────────────────────────────────────

function SummaryCards({ snapshot }: { snapshot: SnapshotRow }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      {/* Total Assets */}
      <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-income/10 flex items-center justify-center">
            <PiggyBank className="h-4 w-4 text-income" />
          </div>
          <span className="text-sm font-medium text-neutral-500">Total Assets</span>
        </div>
        <p className="text-xl font-bold currency text-neutral-900">
          {formatCurrency(snapshot.assets)}
        </p>
      </div>

      {/* Total Liabilities */}
      <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-expense/10 flex items-center justify-center">
            <CreditCard className="h-4 w-4 text-expense" />
          </div>
          <span className="text-sm font-medium text-neutral-500">Total Liabilities</span>
        </div>
        <p className="text-xl font-bold currency text-neutral-900">
          {formatCurrency(snapshot.liabilities)}
        </p>
      </div>

      {/* Net Worth */}
      <div className="bg-white rounded-[var(--radius-card)] border border-primary/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-medium text-neutral-500">Net Worth</span>
        </div>
        <p className={cn(
          "text-xl font-bold currency",
          snapshot.netWorth >= 0 ? "text-income" : "text-expense"
        )}>
          {formatCurrency(snapshot.netWorth)}
        </p>
      </div>
    </div>
  );
}

// ─── Snapshot History ───────────────────────────────────────────────────

function SnapshotHistory({
  snapshots,
  onSelectMonth,
  selectedMonth,
}: {
  snapshots: SnapshotRow[];
  onSelectMonth: (month: string) => void;
  selectedMonth: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const displaySnapshots = expanded ? snapshots : snapshots.slice(-5);

  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 mb-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-neutral-800">Snapshot History</h3>
        {snapshots.length > 5 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-sm text-primary hover:text-primary-dark transition-colors min-h-[44px] px-2"
          >
            {expanded ? (
              <>
                Show Less <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                Show All ({snapshots.length}) <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200">
              <th className="text-left py-2 pr-4 font-medium text-neutral-500">Month</th>
              <th className="text-right py-2 px-4 font-medium text-neutral-500">Assets</th>
              <th className="text-right py-2 px-4 font-medium text-neutral-500">Liabilities</th>
              <th className="text-right py-2 pl-4 font-medium text-neutral-500">Net Worth</th>
            </tr>
          </thead>
          <tbody>
            {displaySnapshots.map((snap) => (
              <tr
                key={snap.month}
                className={cn(
                  "border-b border-neutral-100 cursor-pointer hover:bg-neutral-50 transition-colors",
                  selectedMonth === snap.month && "bg-primary/5"
                )}
                onClick={() => onSelectMonth(snap.month)}
              >
                <td className="py-2.5 pr-4 font-medium text-neutral-900">
                  {formatMonth(snap.month)}
                </td>
                <td className="py-2.5 px-4 text-right currency text-neutral-700">
                  {formatCurrency(snap.assets)}
                </td>
                <td className="py-2.5 px-4 text-right currency text-neutral-700">
                  {formatCurrency(snap.liabilities)}
                </td>
                <td className={cn(
                  "py-2.5 pl-4 text-right currency font-medium",
                  snap.netWorth >= 0 ? "text-income" : "text-expense"
                )}>
                  {formatCurrency(snap.netWorth)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Snapshot Detail ────────────────────────────────────────────────────

function SnapshotDetail({
  month,
  accountBalances,
}: {
  month: string;
  accountBalances: AccountBalance[];
}) {
  const assets = accountBalances.filter((ab) => ab.isAsset);
  const liabilities = accountBalances.filter((ab) => !ab.isAsset);

  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 mb-8">
      <h3 className="text-base font-semibold text-neutral-800 mb-3">
        {formatMonth(month)} — Account Balances
      </h3>

      {assets.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-income mb-2">Assets</h4>
          <div className="space-y-1">
            {assets.map((ab) => (
              <div key={ab.accountId} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-neutral-700">{ab.accountName}</span>
                <span className="text-sm currency font-medium text-neutral-900">
                  {formatCurrency(ab.balanceCurrent)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {liabilities.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-expense mb-2">Liabilities</h4>
          <div className="space-y-1">
            {liabilities.map((ab) => (
              <div key={ab.accountId} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-neutral-700">{ab.accountName}</span>
                <span className="text-sm currency font-medium text-neutral-900">
                  {formatCurrency(ab.balanceCurrent)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {accountBalances.length === 0 && (
        <p className="text-sm text-neutral-500">No account data for this snapshot.</p>
      )}
    </div>
  );
}

// ─── Main Client Component ──────────────────────────────────────────────

export function NetWorthClient({
  initialSnapshots,
  initialAccountHistory,
}: NetWorthClientProps) {
  const { showToast } = useToast();
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>(initialSnapshots);
  const [accountHistory, setAccountHistory] = useState<AccountBalanceHistoryRow[]>(initialAccountHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AccountBalance[] | null>(null);

  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  const refreshData = useCallback(async () => {
    try {
      const [snapshotsRes, historyRes] = await Promise.all([
        fetch("/api/snapshots"),
        fetch("/api/snapshots/history"),
      ]);

      if (snapshotsRes.ok) {
        const data = await snapshotsRes.json();
        setSnapshots(data.snapshots);
      }

      // History endpoint may not exist yet; gracefully handle
      if (historyRes.ok) {
        const data = await historyRes.json();
        setAccountHistory(data.history);
      }
    } catch {
      // Silently fail on refresh — initial data still shown
    }
  }, []);

  async function handleTakeSnapshot() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || "Failed to take snapshot");
        return;
      }

      showToast("Snapshot captured successfully!");
      await refreshData();
    } catch {
      showToast("Failed to take snapshot");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelectMonth(month: string) {
    if (selectedMonth === month) {
      setSelectedMonth(null);
      setSelectedDetail(null);
      return;
    }

    setSelectedMonth(month);

    try {
      const res = await fetch(`/api/snapshots/${month}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedDetail(data.accountBalances);
      }
    } catch {
      // Silently fail
    }
  }

  // ─── Empty state ──────────────────────────────────────────────────

  if (snapshots.length === 0) {
    return <EmptyState onTakeSnapshot={handleTakeSnapshot} isLoading={isLoading} />;
  }

  // ─── Data state ───────────────────────────────────────────────────

  return (
    <div>
      {/* Take Snapshot Button */}
      <div className="mb-6">
        <button
          onClick={handleTakeSnapshot}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-[var(--radius-button)] font-medium hover:bg-primary-dark transition-colors min-h-[44px] disabled:opacity-50"
        >
          <Camera className="h-4 w-4" />
          {isLoading ? "Taking Snapshot..." : "Take Snapshot"}
        </button>
      </div>

      {/* Summary Cards (latest snapshot) */}
      {latestSnapshot && <SummaryCards snapshot={latestSnapshot} />}

      {/* Net Worth Over Time Chart */}
      <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 mb-8">
        <h3 className="text-base font-semibold text-neutral-800 mb-4">Net Worth Over Time</h3>
        <NetWorthChart snapshots={snapshots} />
      </div>

      {/* Snapshot History Table */}
      <SnapshotHistory
        snapshots={snapshots}
        onSelectMonth={handleSelectMonth}
        selectedMonth={selectedMonth}
      />

      {/* Selected Snapshot Detail */}
      {selectedMonth && selectedDetail && (
        <SnapshotDetail month={selectedMonth} accountBalances={selectedDetail} />
      )}

      {/* Per-Account Balance History */}
      {accountHistory.length > 0 && (
        <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4">
          <h3 className="text-base font-semibold text-neutral-800 mb-4">
            Per-Account Balance History
          </h3>
          <AccountHistoryTable history={accountHistory} />
        </div>
      )}
    </div>
  );
}
