"use client";

import { useState, useCallback } from "react";
import {
  Landmark,
  Unplug,
  Loader2,
  AlertTriangle,
  CheckCircle,
  CreditCard,
  Wallet,
  TrendingUp,
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
  const [confirmDisconnect, setConfirmDisconnect] = useState<number | null>(null);
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
  useState(() => {
    fetchConnections();
  });

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
          {connections.map((conn) => (
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
                    <div className="flex items-center gap-2 mt-0.5">
                      <ConnectionStatus
                        lastSyncAt={conn.lastSyncAt}
                        lastSyncStatus={conn.lastSyncStatus}
                        lastSyncError={conn.lastSyncError}
                        createdAt={conn.createdAt}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {confirmDisconnect === conn.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500">
                        Are you sure?
                      </span>
                      <button
                        onClick={() => handleDisconnect(conn.id)}
                        disabled={disconnecting === conn.id}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 min-h-[36px]"
                      >
                        {disconnecting === conn.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Yes, Disconnect"
                        )}
                      </button>
                      <button
                        onClick={() => setConfirmDisconnect(null)}
                        className="px-3 py-1.5 text-xs font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors min-h-[36px]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDisconnect(conn.id)}
                      disabled={disconnecting === conn.id}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        "text-red-600 hover:bg-red-50",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "min-h-[36px] min-w-[36px]"
                      )}
                    >
                      <Unplug className="h-3.5 w-3.5" />
                      Disconnect
                    </button>
                  )}
                </div>
              </div>

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
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectionStatus({
  lastSyncAt,
  lastSyncStatus,
  lastSyncError,
  createdAt,
}: {
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  createdAt: string;
}) {
  if (lastSyncError) {
    return (
      <div className="flex items-center gap-1 text-xs text-amber-600">
        <AlertTriangle className="h-3 w-3" />
        <span>Sync error</span>
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
