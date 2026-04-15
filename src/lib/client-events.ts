"use client";

export const FINANCE_DATA_CHANGED_EVENT = "finance:data-changed";

export interface FinanceDataChangedDetail {
  source: "plaid-sync" | "plaid-connect";
  importedTransactions?: number;
  affectedConnections?: number;
}

export function dispatchFinanceDataChanged(detail: FinanceDataChangedDetail) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<FinanceDataChangedDetail>(FINANCE_DATA_CHANGED_EVENT, {
      detail,
    })
  );
}

export function subscribeToFinanceDataChanged(
  listener: (detail: FinanceDataChangedDetail) => void
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<FinanceDataChangedDetail>;
    listener(customEvent.detail);
  };

  window.addEventListener(FINANCE_DATA_CHANGED_EVENT, handler);
  return () => window.removeEventListener(FINANCE_DATA_CHANGED_EVENT, handler);
}
