"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { dispatchFinanceDataChanged } from "@/lib/client-events";
import { syncPlaidConnectionWithRetry } from "./client";

interface ConnectionSummary {
  id: number;
  institutionName: string;
  provider: string;
  lastSyncAt: string | null;
}

const STALE_SYNC_MS = 12 * 60 * 60 * 1000;
const SESSION_SYNC_COOLDOWN_MS = 60 * 1000;
const AUTO_SYNC_SESSION_KEY = "plaid:auto-sync:last-run";
const AUTO_SYNC_ALLOWED_PATHS = new Set(["/"]);
const AUTO_SYNC_START_DELAY_MS = 4000;
const CONNECTION_FETCH_TIMEOUT_MS = 4000;

function getLastAutoSyncRun() {
  if (typeof window === "undefined") return 0;
  const value = window.sessionStorage.getItem(AUTO_SYNC_SESSION_KEY);
  if (!value) return 0;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setLastAutoSyncRun(timestamp: number) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(AUTO_SYNC_SESSION_KEY, String(timestamp));
}

function isConnectionStale(connection: ConnectionSummary) {
  if (!connection.lastSyncAt) return true;

  const lastSync = new Date(connection.lastSyncAt).getTime();
  if (Number.isNaN(lastSync)) return true;

  return Date.now() - lastSync >= STALE_SYNC_MS;
}

export function PlaidAutoSync() {
  const startedRef = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();

  useEffect(() => {
    if (!AUTO_SYNC_ALLOWED_PATHS.has(pathname)) {
      return;
    }

    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }

    const lastRun = getLastAutoSyncRun();
    if (Date.now() - lastRun < SESSION_SYNC_COOLDOWN_MS) {
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    let timeoutId: number | undefined;

    async function runAutoSync() {
      try {
        const controller = new AbortController();
        const abortTimeout = window.setTimeout(() => {
          controller.abort();
        }, CONNECTION_FETCH_TIMEOUT_MS);

        const response = await fetch("/api/plaid/connections", {
          cache: "no-store",
          signal: controller.signal,
        }).finally(() => {
          window.clearTimeout(abortTimeout);
        });

        if (!response.ok) {
          throw new Error("Failed to load Plaid connections");
        }

        const connections = (await response.json()) as ConnectionSummary[];
        const staleConnections = connections.filter(
          (connection) =>
            connection.provider === "plaid" && isConnectionStale(connection)
        );

        if (staleConnections.length === 0) {
          setLastAutoSyncRun(Date.now());
          return;
        }

        setLastAutoSyncRun(Date.now());

        let totalImported = 0;
        let syncedConnections = 0;

        for (const connection of staleConnections) {
          if (cancelled) return;

          try {
            const result = await syncPlaidConnectionWithRetry(connection.id, {
              maxRetries: 2,
              retryDelayMs: 4000,
            });

            totalImported += result.added + result.modified;
            syncedConnections += 1;
          } catch (error) {
            console.warn(
              `Automatic sync failed for ${connection.institutionName}:`,
              error
            );
          }
        }

        if (cancelled || syncedConnections === 0) {
          return;
        }

        dispatchFinanceDataChanged({
          source: "plaid-sync",
          importedTransactions: totalImported,
          affectedConnections: syncedConnections,
        });
        router.refresh();

        if (pathname === "/transactions" || pathname === "/accounts" || pathname === "/") {
          showToast(
            totalImported > 0
              ? `Updated ${syncedConnections} bank connection${syncedConnections === 1 ? "" : "s"} and imported ${totalImported} transaction${totalImported === 1 ? "" : "s"}.`
              : `Updated ${syncedConnections} bank connection${syncedConnections === 1 ? "" : "s"}.`,
            "success"
          );
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          console.warn("Automatic Plaid sync skipped because connection lookup timed out.");
          return;
        }
        console.error("Automatic Plaid sync failed:", error);
      }
    }

    timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      void runAutoSync();
    }, AUTO_SYNC_START_DELAY_MS);

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [pathname, router, showToast]);

  return null;
}
