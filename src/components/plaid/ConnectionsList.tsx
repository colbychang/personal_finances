"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Landmark,
  Unplug,
  Loader2,
  AlertTriangle,
  CheckCircle,
  CreditCard,
  Wallet,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { PlaidLinkButton } from "./PlaidLinkButton";

interface PlaidAccount {
  id: number;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  balanceCurrent: number; // already in dollars from API
}

interface Connection {
  id: number;
  institutionName: string;
  provider: string;
  createdAt: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  accounts: PlaidAccount[];
}

interface SyncResultInfo {
  status: "success" | "error";
  message: string;
}

function getAccountIcon(type: string) {
  switch (type) {
    case "credit":
      return CreditCard;
    case "investment":
    case "retirement":
      return TrendingUp;
    default:
      return Wallet;
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function ConnectionsList() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<number | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<number | null>(
    null
  );
  const [syncing, setSyncing] = useState<number | null>(null);
  const [syncResult, setSyncResult] = useState<Record<number, SyncResultInfo>>(
    {}
  );
  const { showToast } = useToast();

  const fetchConnections = useCallback(async () => {
    try {
      const response = await fetch("/api/plaid/connections");
      if (!response.ok) throw new Error("Failed to fetch connections");
      const data = await response.json();
      setConnections(data);
    } catch (error) {
      console.error("Error fetching connections:", error);
      showToast("Failed to load connections", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Fetch on mount
  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleDisconnect = async (connectionId: number) => {
    setDisconnecting(connectionId);
    setConfirmDisconnect(null);
    try {
      const response = await fetch(`/api/plaid/connections/${connectionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to disconnect");
      }

      showToast("Bank disconnected successfully", "success");
      await fetchConnections();
    } catch (error) {
      console.error("Error disconnecting:", error);
      showToast(
        error instanceof Error
          ? error.message
          : "Failed to disconnect bank",
        "error"
      );
    } finally {
      setDisconnecting(null);
    }
  };

  const handleSync = async (connectionId: number) => {
    setSyncing(connectionId);
    // Clear any previous result for this connection
    setSyncResult((prev) => {
      const next = { ...prev };
      delete next[connectionId];
      return next;
    });

    try {
      const response = await fetch("/api/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || "Failed to sync transactions";
        setSyncResult((prev) => ({
          ...prev,
          [connectionId]: { status: "error", message: errorMsg },
        }));
        showToast(errorMsg, "error");
        // Refresh connections to show updated error status
        await fetchConnections();
        return;
      }

      const totalChanges = data.added + data.modified + data.removed;
      const message =
        totalChanges === 0
          ? "Already up to date — no new transactions."
          : `Synced: ${data.added} added, ${data.modified} updated, ${data.removed} removed.`;

      setSyncResult((prev) => ({
        ...prev,
        [connectionId]: { status: "success", message },
      }));
      showToast(message, "success");
      // Refresh connections to show updated sync timestamp and balances
      await fetchConnections();
    } catch (error) {
      console.error("Error syncing:", error);
      const errorMsg =
        error instanceof Error
          ? error.message
          : "Failed to sync transactions";
      setSyncResult((prev) => ({
        ...prev,
        [connectionId]: { status: "error", message: errorMsg },
      }));
      showToast(errorMsg, "error");
    } finally {
      setSyncing(null);
    }
  };

  const handleLinkSuccess = () => {
    fetchConnections();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-neutral-500">
          Loading connections...
        </span>
      </div>
    );
  }

  return (
    <div>
      {/* Header with Connect Bank button */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-neutral-500">
            Connect your bank accounts to automatically import transactions.
          </p>
        </div>
        <PlaidLinkButton onSuccess={handleLinkSuccess} />
      </div>

      {/* Connections List */}
      {connections.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-neutral-200">
          <Landmark className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-neutral-700 mb-1">
            No Connected Banks
          </h3>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            Connect your bank accounts to automatically import transactions and
            keep your finances up to date.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {connections.map((conn) => {
            const isSyncing = syncing === conn.id;
            const result = syncResult[conn.id];

            return (
              <div
                key={conn.id}
                className="bg-white rounded-xl border border-neutral-200 overflow-hidden"
              >
                {/* Connection Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Landmark className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900">
                        {conn.institutionName}
                      </h3>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {getConnectionSummary(conn)}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <ConnectionStatus
                          lastSyncAt={conn.lastSyncAt}
                          lastSyncStatus={conn.lastSyncStatus}
                          lastSyncError={conn.lastSyncError}
                          createdAt={conn.createdAt}
                          isSyncing={isSyncing}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Sync Button */}
                    <button
                      onClick={() => handleSync(conn.id)}
                      disabled={isSyncing || disconnecting === conn.id}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        "text-primary hover:bg-primary/10",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "min-h-[44px] min-w-[44px]"
                      )}
                    >
                      <RefreshCw
                        className={cn(
                          "h-3.5 w-3.5",
                          isSyncing && "animate-spin"
                        )}
                      />
                      {isSyncing ? "Syncing..." : "Sync"}
                    </button>

                    {/* Disconnect */}
                    {confirmDisconnect === conn.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-500">
                          Are you sure?
                        </span>
                        <button
                          onClick={() => handleDisconnect(conn.id)}
                          disabled={disconnecting === conn.id}
                          className="px-3 py-2.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 min-h-[44px]"
                        >
                          {disconnecting === conn.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Yes, Disconnect"
                          )}
                        </button>
                        <button
                          onClick={() => setConfirmDisconnect(null)}
                          className="px-3 py-2.5 text-xs font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors min-h-[44px]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDisconnect(conn.id)}
                        disabled={disconnecting === conn.id || isSyncing}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors",
                          "text-red-600 hover:bg-red-50",
                          "disabled:opacity-50 disabled:cursor-not-allowed",
                          "min-h-[44px] min-w-[44px]"
                        )}
                      >
                        <Unplug className="h-3.5 w-3.5" />
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>

                {/* Sync Result Banner */}
                {result && (
                  <div
                    className={cn(
                      "px-4 py-2 text-xs flex items-center gap-2",
                      result.status === "success"
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-700"
                    )}
                  >
                    {result.status === "success" ? (
                      <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>{result.message}</span>
                  </div>
                )}

                {!result && (
                  <ConnectionGuidance
                    connection={conn}
                    isSyncing={isSyncing}
                  />
                )}

                {/* Accounts List */}
                {conn.accounts.length > 0 ? (
                  <div className="divide-y divide-neutral-50">
                    {conn.accounts.map((account) => {
                      const Icon = getAccountIcon(account.type);
                      return (
                        <div
                          key={account.id}
                          className="flex items-center justify-between px-4 py-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="h-4 w-4 text-neutral-400" />
                            <div>
                              <span className="text-sm font-medium text-neutral-800">
                                {account.name}
                              </span>
                              {account.mask && (
                                <span className="ml-2 text-xs text-neutral-400">
                                  ••••{account.mask}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-sm font-medium text-neutral-700">
                            {formatCurrency(account.balanceCurrent)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-sm text-neutral-500">
                    No accounts linked yet.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getConnectionSummary(connection: Connection) {
  const accountCount = connection.accounts.length;
  if (accountCount === 0) {
    return "Connected with no linked accounts yet.";
  }

  return `${accountCount} linked account${accountCount === 1 ? "" : "s"}`;
}

function ConnectionGuidance({
  connection,
  isSyncing,
}: {
  connection: Connection;
  isSyncing: boolean;
}) {
  if (isSyncing) {
    return null;
  }

  if (connection.lastSyncStatus === "error" && connection.lastSyncError) {
    const isPreparingTransactions =
      connection.lastSyncError ===
      "Transactions are still being loaded. Please try again in a few minutes.";

    return (
      <div className="px-4 py-2 text-xs flex items-center gap-2 bg-amber-50 text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>
          {isPreparingTransactions
            ? "Plaid is still preparing your history. Wait a few minutes, then sync again."
            : connection.lastSyncError}
        </span>
      </div>
    );
  }

  if (!connection.lastSyncAt) {
    return (
      <div className="px-4 py-2 text-xs flex items-center gap-2 bg-blue-50 text-blue-800">
        <RefreshCw className="h-3.5 w-3.5 shrink-0" />
        <span>
          Run your first sync to import recent transactions for these accounts.
        </span>
      </div>
    );
  }

  return null;
}

function ConnectionStatus({
  lastSyncAt,
  lastSyncStatus,
  lastSyncError,
  createdAt,
  isSyncing,
}: {
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  createdAt: string;
  isSyncing: boolean;
}) {
  if (isSyncing) {
    return (
      <div className="flex items-center gap-1 text-xs text-primary">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Syncing transactions...</span>
      </div>
    );
  }

  if (lastSyncError && lastSyncStatus === "error") {
    return (
      <div className="flex items-center gap-1 text-xs text-amber-600">
        <AlertTriangle className="h-3 w-3" />
        <span title={lastSyncError}>Sync error</span>
      </div>
    );
  }

  if (lastSyncStatus === "success" && lastSyncAt) {
    return (
      <div className="flex items-center gap-1 text-xs text-green-600">
        <CheckCircle className="h-3 w-3" />
        <span>
          Last synced{" "}
          {new Date(lastSyncAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>
    );
  }

  // Default: connected but never synced
  return (
    <div className="flex items-center gap-1 text-xs text-neutral-500">
      <CheckCircle className="h-3 w-3" />
      <span>
        Connected{" "}
        {new Date(createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}
      </span>
    </div>
  );
}
