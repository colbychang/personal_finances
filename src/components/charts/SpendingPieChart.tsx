"use client";

import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";

interface SpendingPieChartProps {
  data: Array<{
    category: string;
    amount: number; // cents
    color: string | null;
  }>;
  onCategoryClick?: (category: string) => void;
  heightClassName?: string;
  labelThresholdPercent?: number;
}

export const DEFAULT_SPENDING_CHART_COLORS = [
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
  "#0ea5e9",
  "#84cc16",
  "#fb7185",
  "#f43f5e",
  "#10b981",
  "#eab308",
  "#7c3aed",
  "#2563eb",
  "#dc2626",
  "#0891b2",
  "#4f46e5",
  "#16a34a",
];

export function resolveSpendingChartColor(color: string | null, index: number) {
  return color ?? DEFAULT_SPENDING_CHART_COLORS[index % DEFAULT_SPENDING_CHART_COLORS.length];
}

function formatTooltipValue(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(dollars);
}

export function SpendingPieChart({
  data,
  onCategoryClick,
  heightClassName,
  labelThresholdPercent = 0.05,
}: SpendingPieChartProps) {
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(() => new Set());
  const chartData = useMemo(
    () =>
      data.map((d, i) => ({
        name: d.category,
        value: d.amount,
        color: resolveSpendingChartColor(d.color, i),
      })),
    [data],
  );

  const visibleData = chartData.filter((entry) => !hiddenCategories.has(entry.name));

  if (data.length === 0) {
    return (
      <p className="text-sm text-neutral-500 text-center py-8">
        No spending data for this month.
      </p>
    );
  }

  function toggleCategory(category: string) {
    setHiddenCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className={cn("w-full h-64 md:h-80", heightClassName)}>
        {visibleData.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-neutral-200 bg-neutral-50 px-6 text-center">
            <p className="text-sm font-medium text-neutral-700">
              All categories are hidden.
            </p>
            <button
              type="button"
              onClick={() => setHiddenCategories(new Set())}
              className="mt-3 rounded-[var(--radius-button)] border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-white"
            >
              Show all categories
            </button>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={visibleData}
                cx="50%"
                cy="50%"
                innerRadius="35%"
                outerRadius="65%"
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) =>
                  percent >= labelThresholdPercent
                    ? `${name} ${(percent * 100).toFixed(0)}%`
                    : ""
                }
                labelLine={false}
                onClick={(_, index) => {
                  if (onCategoryClick) {
                    onCategoryClick(visibleData[index].name);
                  }
                }}
                style={{ cursor: onCategoryClick ? "pointer" : "default" }}
                isAnimationActive={false}
              >
                {visibleData.map((entry, index) => (
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
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {chartData.map((entry) => {
          const isHidden = hiddenCategories.has(entry.name);

          return (
            <button
              key={entry.name}
              type="button"
              onClick={() => toggleCategory(entry.name)}
              className={cn(
                "inline-flex min-h-[36px] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                isHidden
                  ? "border-neutral-200 bg-neutral-50 text-neutral-400"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
              )}
              aria-pressed={!isHidden}
              aria-label={`${isHidden ? "Show" : "Hide"} ${entry.name}`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.color, opacity: isHidden ? 0.35 : 1 }}
              />
              <span className={cn(isHidden && "line-through")}>{entry.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
