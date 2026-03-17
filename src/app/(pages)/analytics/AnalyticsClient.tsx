"use client";

import { useState, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { ArrowLeft, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────

interface CategorySpending {
  category: string;
  amount: number; // cents
  color: string | null;
}

interface MonthlyTrend {
  month: string; // YYYY-MM
  total: number; // cents
}

interface AnalyticsData {
  period: string;
  startDate: string;
  endDate: string;
  totalSpending: number;
  spendingByCategory: CategorySpending[];
  monthlyTrends: MonthlyTrend[];
}

interface DrillDownTransaction {
  id: number;
  postedAt: string;
  name: string;
  merchant: string | null;
  amount: number; // cents
  category: string | null;
  accountName: string;
  splitAmount: number | null;
}

type Period = "month" | "3months" | "6months" | "year";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "month", label: "This Month" },
  { value: "3months", label: "Last 3 Months" },
  { value: "6months", label: "Last 6 Months" },
  { value: "year", label: "Last 12 Months" },
];

const DEFAULT_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#ef4444",
  "#f59e0b",
  "#14b8a6",
  "#6366f1",
  "#64748b",
  "#a855f7",
];

// ─── Helper ─────────────────────────────────────────────────────────────

function formatMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function formatTooltipValue(cents: number): string {
  return formatCurrency(cents);
}

// ─── Spending Pie/Donut Chart ───────────────────────────────────────────

function SpendingDonutChart({
  data,
  onCategoryClick,
}: {
  data: CategorySpending[];
  onCategoryClick: (category: string) => void;
}) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-neutral-500 text-center py-12">
        No spending data for this period.
      </p>
    );
  }

  const chartData = data.map((d, i) => ({
    name: d.category,
    value: d.amount,
    color: d.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  return (
    <div className="w-full h-80 md:h-96">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius="35%"
            outerRadius="65%"
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            label={({ name, percent }) =>
              `${name} ${(percent * 100).toFixed(0)}%`
            }
            labelLine={{ strokeWidth: 1 }}
            onClick={(_data, index) => {
              onCategoryClick(chartData[index].name);
            }}
            style={{ cursor: "pointer" }}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [formatTooltipValue(value), "Spent"]}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              fontSize: "13px",
            }}
          />
          <Legend
            formatter={(value: string) => (
              <span className="text-xs text-neutral-700">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Monthly Trends Bar Chart ───────────────────────────────────────────

function MonthlyTrendsChart({ data }: { data: MonthlyTrend[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-neutral-500 text-center py-12">
        No spending trend data available.
      </p>
    );
  }

  const chartData = data.map((d) => ({
    name: formatMonthLabel(d.month),
    total: d.total,
  }));

  return (
    <div className="w-full h-72 md:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
          />
          <YAxis
            tickFormatter={(value: number) => {
              if (value >= 100000) return `$${(value / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
              if (value >= 10000) return `$${(value / 100).toFixed(0)}`;
              return `$${(value / 100).toFixed(0)}`;
            }}
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
          />
          <Tooltip
            formatter={(value: number) => [formatTooltipValue(value), "Spending"]}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              fontSize: "13px",
            }}
          />
          <Bar
            dataKey="total"
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
            maxBarSize={60}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Category Drill-Down Panel ──────────────────────────────────────────

function CategoryDrillDown({
  category,
  transactions,
  isLoading,
  onClose,
}: {
  category: string;
  transactions: DrillDownTransaction[];
  isLoading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 md:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="p-2 rounded-[var(--radius-button)] hover:bg-neutral-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close drill-down"
          >
            <ArrowLeft className="h-5 w-5 text-neutral-600" />
          </button>
          <h3 className="text-lg font-semibold text-neutral-800">
            {category} Transactions
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-[var(--radius-button)] hover:bg-neutral-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-neutral-600" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          <span className="ml-2 text-sm text-neutral-500">Loading transactions...</span>
        </div>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-8">
          No transactions found for this category.
        </p>
      ) : (
        <div className="space-y-0 divide-y divide-neutral-100">
          {transactions.map((txn) => (
            <div
              key={txn.id}
              className="flex items-center justify-between py-3"
            >
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {txn.name}
                </p>
                <p className="text-xs text-neutral-500">
                  {formatDate(txn.postedAt)} · {txn.accountName}
                  {txn.splitAmount !== null && (
                    <span className="ml-1 text-neutral-400">
                      (split: {formatCurrency(txn.splitAmount)})
                    </span>
                  )}
                </p>
              </div>
              <span className="text-sm font-medium currency text-expense flex-shrink-0">
                {formatCurrency(txn.splitAmount ?? txn.amount)}
              </span>
            </div>
          ))}
          <div className="pt-3 flex justify-between items-center">
            <span className="text-sm font-medium text-neutral-600">
              Total ({transactions.length} transactions)
            </span>
            <span className="text-sm font-bold currency text-neutral-900">
              {formatCurrency(
                transactions.reduce(
                  (sum, txn) => sum + (txn.splitAmount ?? txn.amount),
                  0
                )
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Category List Table ────────────────────────────────────────────────

function CategoryTable({
  data,
  totalSpending,
  onCategoryClick,
}: {
  data: CategorySpending[];
  totalSpending: number;
  onCategoryClick: (category: string) => void;
}) {
  if (data.length === 0) return null;

  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 md:p-5">
      <h3 className="text-base font-semibold text-neutral-800 mb-3">
        Category Breakdown
      </h3>
      <div className="space-y-0 divide-y divide-neutral-100">
        {data.map((cat, i) => {
          const percent = totalSpending > 0 ? (cat.amount / totalSpending) * 100 : 0;
          return (
            <button
              key={cat.category}
              onClick={() => onCategoryClick(cat.category)}
              className="flex items-center w-full py-3 text-left hover:bg-neutral-50 transition-colors -mx-2 px-2 rounded-lg min-h-[44px]"
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0 mr-3"
                style={{
                  backgroundColor:
                    cat.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
                }}
              />
              <span className="flex-1 text-sm text-neutral-700 truncate mr-3">
                {cat.category}
              </span>
              <span className="text-xs text-neutral-400 mr-3 flex-shrink-0">
                {percent.toFixed(1)}%
              </span>
              <span className="text-sm font-medium currency text-neutral-900 flex-shrink-0">
                {formatCurrency(cat.amount)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Analytics Client ──────────────────────────────────────────────

interface AnalyticsClientProps {
  initialData: AnalyticsData;
}

export function AnalyticsClient({ initialData }: AnalyticsClientProps) {
  const [data, setData] = useState<AnalyticsData>(initialData);
  const [period, setPeriod] = useState<Period>("month");
  const [isLoading, setIsLoading] = useState(false);
  const [drillDownCategory, setDrillDownCategory] = useState<string | null>(null);
  const [drillDownTransactions, setDrillDownTransactions] = useState<DrillDownTransaction[]>([]);
  const [isDrillDownLoading, setIsDrillDownLoading] = useState(false);

  const fetchData = useCallback(async (newPeriod: Period) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/analytics?period=${newPeriod}`);
      if (res.ok) {
        const newData = await res.json();
        setData(newData);
      }
    } catch {
      // Keep existing data on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handlePeriodChange = useCallback(
    (newPeriod: Period) => {
      setPeriod(newPeriod);
      setDrillDownCategory(null);
      fetchData(newPeriod);
    },
    [fetchData]
  );

  const handleCategoryClick = useCallback(
    async (category: string) => {
      setDrillDownCategory(category);
      setIsDrillDownLoading(true);
      try {
        const res = await fetch(
          `/api/analytics?period=${period}&category=${encodeURIComponent(category)}`
        );
        if (res.ok) {
          const result = await res.json();
          setDrillDownTransactions(result.transactions);
        }
      } catch {
        setDrillDownTransactions([]);
      } finally {
        setIsDrillDownLoading(false);
      }
    },
    [period]
  );

  const handleCloseDrillDown = useCallback(() => {
    setDrillDownCategory(null);
    setDrillDownTransactions([]);
  }, []);

  return (
    <div className={cn(isLoading && "opacity-60 pointer-events-none transition-opacity")}>
      {/* Period Selector */}
      <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Time period selector">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handlePeriodChange(opt.value)}
            className={cn(
              "px-4 py-2 rounded-[var(--radius-button)] text-sm font-medium transition-colors min-h-[44px]",
              period === opt.value
                ? "bg-primary text-white"
                : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            )}
            aria-pressed={period === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Total Spending Summary */}
      <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 md:p-5 mb-4">
        <p className="text-sm text-neutral-500 mb-1">
          Total Spending ({PERIOD_OPTIONS.find((o) => o.value === period)?.label})
        </p>
        <p className="text-3xl font-bold currency text-neutral-900">
          {formatCurrency(data.totalSpending)}
        </p>
      </div>

      {/* Drill-Down Panel (shown when a category is selected) */}
      {drillDownCategory && (
        <div className="mb-4">
          <CategoryDrillDown
            category={drillDownCategory}
            transactions={drillDownTransactions}
            isLoading={isDrillDownLoading}
            onClose={handleCloseDrillDown}
          />
        </div>
      )}

      {/* Spending by Category - Pie/Donut Chart */}
      <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 md:p-5 mb-4">
        <h2 className="text-base font-semibold text-neutral-800 mb-3">
          Spending by Category
        </h2>
        <p className="text-xs text-neutral-400 mb-2">
          Click a category segment to see its transactions
        </p>
        <SpendingDonutChart
          data={data.spendingByCategory}
          onCategoryClick={handleCategoryClick}
        />
      </div>

      {/* Category Breakdown Table */}
      <div className="mb-4">
        <CategoryTable
          data={data.spendingByCategory}
          totalSpending={data.totalSpending}
          onCategoryClick={handleCategoryClick}
        />
      </div>

      {/* Monthly Spending Trends - Bar Chart */}
      <div className="bg-white rounded-[var(--radius-card)] border border-neutral-200 p-4 md:p-5">
        <h2 className="text-base font-semibold text-neutral-800 mb-3">
          Monthly Spending Trends
        </h2>
        <MonthlyTrendsChart data={data.monthlyTrends} />
      </div>
    </div>
  );
}
