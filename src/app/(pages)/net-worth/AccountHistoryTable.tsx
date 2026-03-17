"use client";

import { formatCurrency, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccountBalanceHistoryRow } from "@/db/queries/snapshots";

interface AccountHistoryTableProps {
  history: AccountBalanceHistoryRow[];
}

interface AccountHistoryData {
  accountId: number;
  accountName: string;
  accountType: string;
  isAsset: boolean;
  months: { month: string; balance: number }[];
}

export function AccountHistoryTable({ history }: AccountHistoryTableProps) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-neutral-500 text-center py-4">
        No balance history available.
      </p>
    );
  }

  // Group by account
  const accountMap = new Map<number, AccountHistoryData>();
  const monthSet = new Set<string>();

  for (const row of history) {
    // Extract month from day (YYYY-MM-DD -> YYYY-MM)
    const month = row.day.substring(0, 7);
    monthSet.add(month);

    if (!accountMap.has(row.accountId)) {
      accountMap.set(row.accountId, {
        accountId: row.accountId,
        accountName: row.accountName,
        accountType: row.accountType,
        isAsset: row.isAsset,
        months: [],
      });
    }

    accountMap.get(row.accountId)!.months.push({
      month,
      balance: row.balanceCurrent,
    });
  }

  const accounts = Array.from(accountMap.values());
  const months = Array.from(monthSet).sort();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200">
            <th className="text-left py-2 pr-4 font-medium text-neutral-500 sticky left-0 bg-white">
              Account
            </th>
            {months.map((m) => (
              <th key={m} className="text-right py-2 px-3 font-medium text-neutral-500 whitespace-nowrap">
                {formatMonth(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {accounts.map((acct) => (
            <tr key={acct.accountId} className="border-b border-neutral-100">
              <td className="py-2.5 pr-4 font-medium text-neutral-900 whitespace-nowrap sticky left-0 bg-white">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      acct.isAsset ? "bg-income" : "bg-expense"
                    )}
                  />
                  {acct.accountName}
                </div>
              </td>
              {months.map((m) => {
                const entry = acct.months.find((e) => e.month === m);
                return (
                  <td key={m} className="py-2.5 px-3 text-right currency text-neutral-700">
                    {entry ? formatCurrency(entry.balance) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
