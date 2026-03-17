"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatMonth } from "@/lib/format";
import type { SnapshotRow } from "@/db/queries/snapshots";

interface NetWorthChartProps {
  snapshots: SnapshotRow[];
}

interface ChartDataPoint {
  month: string;
  label: string;
  assets: number;
  liabilities: number;
  netWorth: number;
}

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) {
    return `$${(dollars / 1000).toFixed(1)}k`;
  }
  return `$${dollars.toFixed(0)}`;
}

function formatTooltipValue(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(dollars);
}

export function NetWorthChart({ snapshots }: NetWorthChartProps) {
  if (snapshots.length === 0) {
    return (
      <p className="text-sm text-neutral-500 text-center py-8">
        No data to display. Take a snapshot to get started.
      </p>
    );
  }

  const data: ChartDataPoint[] = snapshots.map((s) => ({
    month: s.month,
    label: formatMonth(s.month),
    assets: s.assets,
    liabilities: s.liabilities,
    netWorth: s.netWorth,
  }));

  // For single data point, show a dot instead of a line
  const hasSinglePoint = data.length === 1;

  return (
    <div className="w-full h-64 md:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
          />
          <YAxis
            tickFormatter={formatDollars}
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            width={60}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              formatTooltipValue(value),
              name === "netWorth"
                ? "Net Worth"
                : name === "assets"
                  ? "Assets"
                  : "Liabilities",
            ]}
            labelFormatter={(label: string) => label}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              fontSize: "13px",
            }}
          />
          <Legend
            formatter={(value: string) =>
              value === "netWorth"
                ? "Net Worth"
                : value === "assets"
                  ? "Assets"
                  : "Liabilities"
            }
          />
          <Line
            type="monotone"
            dataKey="assets"
            stroke="#22c55e"
            strokeWidth={2}
            dot={hasSinglePoint ? { r: 6 } : { r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="liabilities"
            stroke="#ef4444"
            strokeWidth={2}
            dot={hasSinglePoint ? { r: 6 } : { r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="netWorth"
            stroke="#3b82f6"
            strokeWidth={3}
            dot={hasSinglePoint ? { r: 6 } : { r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
