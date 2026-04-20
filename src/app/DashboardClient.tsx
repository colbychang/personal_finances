"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronLeft,
  ChevronRight,
  Receipt,
  PiggyBank,
  BarChart3,
  CircleDollarSign,
} from "lucide-react";
import { formatCurrency, formatDate, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { subscribeToFinanceDataChanged } from "@/lib/client-events";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { SpendingPieChart } from "@/components/charts/SpendingPieChart";
import type { DashboardData } from "@/db/queries/dashboard";

interface DashboardClientProps {
  initialData: DashboardData;
  initialMonth: string;
  shouldHydrateOnMount?: boolean;
}

// ─── Month Navigation ───────────────────────────────────────────────────

function MonthNav({
  month,
  onPrev,
  onNext,
  isLoading,
}: {
  month: string;
  onPrev: () => void;
  onNext: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-4 mb-6">
      <button
        onClick={onPrev}
        disabled={isLoading}
        className="p-2 rounded-[var(--radius-button)] hover:bg-neutral-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
        aria-label="Previous month"
      >
        <ChevronLeft className="h-5 w-5 text-neutral-600" />
      </button>
      <span className="text-lg font-semibold text-neutral-900 min-w-[180px] text-center">
        {formatMonth(month)}
      </span>
      <button
        onClick={onNext}
        disabled={isLoading}
        className="p-2 rounded-[var(--radius-button)] hover:bg-neutral-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
        aria-label="Next month"
      >
        <ChevronRight className="h-5 w-5 text-neutral-600" />
      </button>
    </div>
  );
}

// ─── Monthly Spending Summary ───────────────────────────────────────────

function SpendingSummary({
  totalSpending,
  spendingByCategory,
}: {
  totalSpending: number;
  spendingByCategory: DashboardData["spendingByCategory"];
}) {
  const topCategories = spendingByCategory.slice(0, 5);

  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-expense/10 flex items-center justify-center">
          <DollarSign className="h-4 w-4 text-expense" />
        </div>
        <h2 className="text-base font-semibold text-neutral-800">
          Monthly Spending
        </h2>
      </div>

      <p className="text-2xl font-bold currency text-neutral-900 mb-4">
        {formatCurrency(totalSpending)}
      </p>

      {topCategories.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No spending this month. Transactions you add will appear here.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
            Top Categories
          </p>
          {topCategories.map((cat) => (
            <div
              key={cat.category}
              className="flex items-center justify-between py-1"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color ?? "#94a3b8" }}
                />
                <span className="text-sm text-neutral-700">{cat.category}</span>
              </div>
              <span className="text-sm font-medium currency text-neutral-900">
                {formatCurrency(cat.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Budget Status Widget ───────────────────────────────────────────────

type BudgetFilterStatus = "on-track" | "approaching" | "over-budget" | null;

function BudgetStatus({
  budgetStatus,
}: {
  budgetStatus: DashboardData["budgetStatus"];
}) {
  const [filter, setFilter] = useState<BudgetFilterStatus>(null);

  if (budgetStatus.total === 0) {
    return (
      <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 md:p-5 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <PiggyBank className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-neutral-800">
            Budget Status
          </h2>
        </div>
        <p className="text-sm text-neutral-500">
          No budgets set for this month. Set up budgets to track your spending
          targets.
        </p>
      </div>
    );
  }

  const filteredItems =
    filter === null
      ? budgetStatus.items
      : budgetStatus.items.filter((item) => item.status === filter);

  function toggleFilter(status: BudgetFilterStatus) {
    setFilter((prev) => (prev === status ? null : status));
  }

  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 md:p-5 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <PiggyBank className="h-4 w-4 text-primary" />
        </div>
        <h2 className="text-base font-semibold text-neutral-800">
          Budget Status
        </h2>
      </div>

      {/* Clickable status filter buttons */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <button
          type="button"
          onClick={() => toggleFilter("on-track")}
          className={cn(
            "text-center rounded-[var(--radius-button)] py-2 min-h-[44px] transition-colors cursor-pointer",
            filter === "on-track"
              ? "bg-income/10 ring-2 ring-income/40"
              : "hover:bg-neutral-50"
          )}
        >
          <p className="text-xl font-bold text-income">{budgetStatus.onTrack}</p>
          <p className="text-xs text-neutral-500">On Track</p>
        </button>
        <button
          type="button"
          onClick={() => toggleFilter("approaching")}
          className={cn(
            "text-center rounded-[var(--radius-button)] py-2 min-h-[44px] transition-colors cursor-pointer",
            filter === "approaching"
              ? "bg-warning/10 ring-2 ring-warning/40"
              : "hover:bg-neutral-50"
          )}
        >
          <p className="text-xl font-bold text-warning">{budgetStatus.approaching}</p>
          <p className="text-xs text-neutral-500">Approaching</p>
        </button>
        <button
          type="button"
          onClick={() => toggleFilter("over-budget")}
          className={cn(
            "text-center rounded-[var(--radius-button)] py-2 min-h-[44px] transition-colors cursor-pointer",
            filter === "over-budget"
              ? "bg-expense/10 ring-2 ring-expense/40"
              : "hover:bg-neutral-50"
          )}
        >
          <p className="text-xl font-bold text-expense">{budgetStatus.overBudget}</p>
          <p className="text-xs text-neutral-500">Over Budget</p>
        </button>
      </div>

      {/* Scrollable budget list */}
      <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
        {filteredItems.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-2">
            No budgets match this filter.
          </p>
        ) : (
          filteredItems.map((item) => (
            <div key={item.category} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-700 truncate mr-2">{item.category}</span>
                <span
                  className={cn(
                    "font-medium flex-shrink-0",
                    item.status === "over-budget"
                      ? "text-expense"
                      : item.status === "approaching"
                        ? "text-warning"
                        : "text-neutral-500"
                  )}
                >
                  {item.percentage}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    item.status === "over-budget"
                      ? "bg-expense"
                      : item.status === "approaching"
                        ? "bg-warning"
                        : "bg-income"
                  )}
                  style={{ width: `${Math.min(item.percentage, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span className="currency">{formatCurrency(item.spent)}</span>
                <span className="currency">of {formatCurrency(item.budgeted)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Recent Transactions Widget ─────────────────────────────────────────

function RecentTransactions({
  transactions,
}: {
  transactions: DashboardData["recentTransactions"];
}) {
  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center">
            <Receipt className="h-4 w-4 text-neutral-500" />
          </div>
          <h2 className="text-base font-semibold text-neutral-800">
            Recent Transactions
          </h2>
        </div>
        <p className="text-sm text-neutral-500">
          No transactions yet. Add transactions manually or connect a bank
          account.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center">
          <Receipt className="h-4 w-4 text-neutral-500" />
        </div>
        <h2 className="text-base font-semibold text-neutral-800">
          Recent Transactions
        </h2>
      </div>

      <div className="space-y-0 divide-y divide-neutral-100">
        {transactions.map((txn) => (
          <div
            key={txn.id}
            className="flex items-center justify-between py-2.5 first:pt-0"
          >
            <div className="flex-1 min-w-0 mr-3">
              <p className="text-sm font-medium text-neutral-900 truncate">
                {txn.name}
              </p>
              <p className="text-xs text-neutral-500">
                {formatDate(txn.postedAt)} · {txn.accountName}
                {txn.category && (
                  <span className="ml-1 text-neutral-400">
                    · {txn.category}
                  </span>
                )}
              </p>
            </div>
            <span
              className={cn(
                "text-sm font-medium currency flex-shrink-0",
                txn.isTransfer
                  ? "text-neutral-500"
                  : txn.amount < 0
                    ? "text-income"
                    : "text-expense"
              )}
            >
              {txn.amount < 0 ? "+" : "-"}
              {formatCurrency(Math.abs(txn.amount))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Net Worth Sparkline Formatters ──────────────────────────────────────

function formatCompactCurrency(cents: number): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  if (abs >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  return `$${dollars.toFixed(0)}`;
}

function formatSparklineTooltip(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(dollars);
}

function formatShortMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

// ─── Net Worth Trend Widget ─────────────────────────────────────────────

function NetWorthTrend({
  netWorth,
  netWorthHistory,
}: {
  netWorth: DashboardData["netWorth"];
  netWorthHistory: DashboardData["netWorthHistory"];
}) {
  const hasChange = netWorth.change !== null;
  const chartData = netWorthHistory.map((pt) => ({
    ...pt,
    label: formatShortMonth(pt.month),
  }));
  const isPositiveChange = hasChange && netWorth.change! > 0;
  const isNegativeChange = hasChange && netWorth.change! < 0;
  const isNoChange = hasChange && netWorth.change === 0;

  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-savings/10 flex items-center justify-center">
          <TrendingUp className="h-4 w-4 text-savings" />
        </div>
        <h2 className="text-base font-semibold text-neutral-800">Net Worth</h2>
      </div>

      <p
        className={cn(
          "text-2xl font-bold currency",
          netWorth.current >= 0 ? "text-neutral-900" : "text-expense"
        )}
      >
        {formatCurrency(netWorth.current)}
      </p>

      {hasChange ? (
        <div className="flex items-center gap-1 mt-1">
          {isPositiveChange && (
            <>
              <ArrowUpRight className="h-4 w-4 text-income" />
              <span className="text-sm font-medium text-income">
                +{formatCurrency(netWorth.change!)}
              </span>
            </>
          )}
          {isNegativeChange && (
            <>
              <ArrowDownRight className="h-4 w-4 text-expense" />
              <span className="text-sm font-medium text-expense">
                {formatCurrency(netWorth.change!)}
              </span>
            </>
          )}
          {isNoChange && (
            <>
              <Minus className="h-4 w-4 text-neutral-400" />
              <span className="text-sm font-medium text-neutral-500">
                No change
              </span>
            </>
          )}
          <span className="text-xs text-neutral-400 ml-1">vs last month</span>
        </div>
      ) : (
        <p className="text-xs text-neutral-400 mt-1">
          No previous month snapshot for comparison.
        </p>
      )}

      {/* Net Worth Sparkline */}
      {netWorthHistory.length >= 2 && (
        <div className="mt-4 w-full h-[130px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                orientation="right"
                tickFormatter={formatCompactCurrency}
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                width={54}
              />
              <Tooltip
                formatter={(value: number) => [formatSparklineTooltip(value), "Net Worth"]}
                labelFormatter={(label: string) => label}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  fontSize: "13px",
                }}
              />
              <Area
                type="monotone"
                dataKey="netWorth"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#nwGradient)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Spending by Category Chart Widget ──────────────────────────────────

function SpendingByCategoryWidget({
  spendingByCategory,
}: {
  spendingByCategory: DashboardData["spendingByCategory"];
}) {
  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-cat-bars/10 flex items-center justify-center">
          <CircleDollarSign className="h-4 w-4 text-cat-bars" />
        </div>
        <h2 className="text-base font-semibold text-neutral-800">
          Spending by Category
        </h2>
      </div>
      <SpendingPieChart data={spendingByCategory} />
    </div>
  );
}

// ─── Month-over-Month Comparison Widget ─────────────────────────────────

function MonthComparison({
  comparison,
  currentMonth,
}: {
  comparison: DashboardData["monthComparison"];
  currentMonth: string;
}) {
  if (comparison.length === 0) {
    return (
      <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-neutral-500" />
          </div>
          <h2 className="text-base font-semibold text-neutral-800">
            Month-over-Month
          </h2>
        </div>
        <p className="text-sm text-neutral-500">
          No spending data to compare. Add transactions to see how your spending
          changes month to month.
        </p>
      </div>
    );
  }

  const prevMonth = getPreviousMonthLabel(currentMonth);

  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center">
          <BarChart3 className="h-4 w-4 text-neutral-500" />
        </div>
        <h2 className="text-base font-semibold text-neutral-800">
          Month-over-Month
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200">
              <th className="text-left py-2 pr-3 font-medium text-neutral-500">
                Category
              </th>
              <th className="text-right py-2 px-3 font-medium text-neutral-500">
                {prevMonth}
              </th>
              <th className="text-right py-2 px-3 font-medium text-neutral-500">
                {formatMonth(currentMonth)}
              </th>
              <th className="text-right py-2 pl-3 font-medium text-neutral-500">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((row) => (
              <tr
                key={row.category}
                className="border-b border-neutral-100 last:border-0"
              >
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: row.color ?? "#94a3b8",
                      }}
                    />
                    <span className="text-neutral-700 truncate">
                      {row.category}
                    </span>
                  </div>
                </td>
                <td className="py-2 px-3 text-right currency text-neutral-600">
                  {formatCurrency(row.previousMonth)}
                </td>
                <td className="py-2 px-3 text-right currency font-medium text-neutral-900">
                  {formatCurrency(row.currentMonth)}
                </td>
                <td className="py-2 pl-3 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 text-xs font-medium",
                      row.change > 0
                        ? "text-expense"
                        : row.change < 0
                          ? "text-income"
                          : "text-neutral-400"
                    )}
                  >
                    {row.change > 0 && (
                      <TrendingUp className="h-3 w-3" />
                    )}
                    {row.change < 0 && (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {row.change !== 0
                      ? formatCurrency(Math.abs(row.change))
                      : "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Helper ─────────────────────────────────────────────────────────────

function getPreviousMonthLabel(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const prevDate = new Date(year, monthNum - 2, 1);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(prevDate);
}

function navigateMonth(month: string, direction: -1 | 1): string {
  const [year, monthNum] = month.split("-").map(Number);
  const newDate = new Date(year, monthNum - 1 + direction, 1);
  const newYear = newDate.getFullYear();
  const newMonth = String(newDate.getMonth() + 1).padStart(2, "0");
  return `${newYear}-${newMonth}`;
}

// ─── Main Client Component ──────────────────────────────────────────────

export function DashboardClient({
  initialData,
  initialMonth,
  shouldHydrateOnMount = false,
}: DashboardClientProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [month, setMonth] = useState(initialMonth);
  const [isLoading, setIsLoading] = useState(shouldHydrateOnMount);
  const [hasLoadedData, setHasLoadedData] = useState(!shouldHydrateOnMount);

  const fetchData = useCallback(async (newMonth: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/dashboard?month=${newMonth}`);
      if (res.ok) {
        const newData = await res.json();
        setData(newData);
        setHasLoadedData(true);
      }
    } catch {
      // Keep existing data on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    return subscribeToFinanceDataChanged(() => {
      void fetchData(month);
    });
  }, [fetchData, month]);

  useEffect(() => {
    if (month === initialMonth) {
      setData(initialData);
    }
  }, [initialData, initialMonth, month]);

  const showLoadingState = shouldHydrateOnMount && !hasLoadedData;

  if (showLoadingState) {
    return (
      <div className="space-y-4">
        <MonthNav
          month={month}
          onPrev={handlePrevMonth}
          onNext={handleNextMonth}
          isLoading
        />
        <div className="rounded-[var(--radius-card)] border border-neutral-200 bg-white p-6">
          <p className="text-sm font-medium text-neutral-700">
            Loading dashboard data...
          </p>
          <p className="mt-2 text-sm text-neutral-500">
            We are opening the page first and then pulling the latest balances,
            budget status, and recent transactions.
          </p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!shouldHydrateOnMount || month !== initialMonth) {
      return;
    }

    void fetchData(month);
  }, [fetchData, initialMonth, month, shouldHydrateOnMount]);

  function handlePrevMonth() {
    const prev = navigateMonth(month, -1);
    setMonth(prev);
    fetchData(prev);
  }

  function handleNextMonth() {
    const next = navigateMonth(month, 1);
    setMonth(next);
    fetchData(next);
  }

  return (
    <div className={cn(isLoading && "opacity-60 pointer-events-none transition-opacity")}>
      {/* Month Navigation */}
      <MonthNav
        month={month}
        onPrev={handlePrevMonth}
        onNext={handleNextMonth}
        isLoading={isLoading}
      />

      {/* Row 1: Net Worth + Spending Summary + Budget Status */}
      {/* Budget Status uses absolute positioning so it does NOT influence row height —
          only Net Worth and Monthly Spending determine the row height. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <NetWorthTrend netWorth={data.netWorth} netWorthHistory={data.netWorthHistory} />
          <SpendingSummary
            totalSpending={data.totalSpending}
            spendingByCategory={data.spendingByCategory}
          />
        </div>
        <div className="relative">
          <div className="md:absolute md:inset-0">
            <BudgetStatus budgetStatus={data.budgetStatus} />
          </div>
        </div>
      </div>

      {/* Row 2: Spending Pie Chart + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SpendingByCategoryWidget
          spendingByCategory={data.spendingByCategory}
        />
        <RecentTransactions transactions={data.recentTransactions} />
      </div>

      {/* Row 3: Month-over-Month Comparison (full width) */}
      <MonthComparison
        comparison={data.monthComparison}
        currentMonth={month}
      />
    </div>
  );
}
