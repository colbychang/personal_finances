"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  usePlaidLink,
  type PlaidLinkOnSuccess,
  type PlaidLinkOnExit,
  type PlaidLinkOptions,
} from "react-plaid-link";
import { AlertTriangle, Landmark, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import {
  exchangePublicToken,
  hasStoredPlaidConsent,
  storePlaidLinkToken,
  storePlaidConsentAccepted,
  storePlaidReturnTo,
} from "@/components/plaid/client";

interface PlaidLinkButtonProps {
  onSuccess: () => void;
  className?: string;
}

export function PlaidLinkButton({ onSuccess, className }: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingToken, setFetchingToken] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const { showToast } = useToast();
  const pathname = usePathname();

  // Fetch link token from our API
  const fetchLinkToken = useCallback(async () => {
    setFetchingToken(true);
    try {
      const response = await fetch("/api/plaid/link-token", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to create link token");
      }
      const data = await response.json();
      setLinkToken(data.link_token);
      storePlaidLinkToken(data.link_token);
    } catch (error) {
      console.error("Error fetching link token:", error);
      showToast("Failed to initialize bank connection. Please try again.", "error");
    } finally {
      setFetchingToken(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchLinkToken();
  }, [fetchLinkToken]);

  // Handle success — exchange public_token for access_token
  const handleSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      setLoading(true);
      try {
        await exchangePublicToken({
          publicToken,
          institutionId: metadata.institution?.institution_id,
          institutionName: metadata.institution?.name,
          accounts: metadata.accounts,
        });

        showToast(
          `Successfully connected ${metadata.institution?.name ?? "bank"}!`,
          "success"
        );
        onSuccess();
      } catch (error) {
        console.error("Error exchanging token:", error);
        showToast(
          error instanceof Error
            ? error.message
            : "Failed to connect bank. Please try again.",
          "error"
        );
      } finally {
        setLoading(false);
        // Fetch a new link token for next use (link_token is single-use)
        fetchLinkToken();
      }
    },
    [onSuccess, showToast, fetchLinkToken]
  );

  // Handle exit (user closes Link or error occurs)
  const handleExit = useCallback<PlaidLinkOnExit>(
    (error) => {
      if (error) {
        console.error("Plaid Link error:", error);
        // Show error only if it wasn't a user-initiated exit
        if (error.error_code !== "USER_EXIT") {
          showToast(
            "Bank connection failed. Please try again.",
            "error"
          );
        }
      }
      // Fetch fresh link token since the old one may be consumed
      fetchLinkToken();
    },
    [showToast, fetchLinkToken]
  );

  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess: handleSuccess,
    onExit: handleExit,
  };

  const { open, ready } = usePlaidLink(config);

  const isDisabled = !ready || loading || fetchingToken;
  const launchLink = useCallback(() => {
    storePlaidReturnTo(pathname);
    open();
  }, [open, pathname]);

  const handleConnectClick = useCallback(() => {
    if (hasStoredPlaidConsent()) {
      launchLink();
      return;
    }

    setConsentChecked(false);
    setShowConsentDialog(true);
  }, [launchLink]);

  return (
    <>
      <button
        onClick={handleConnectClick}
        disabled={isDisabled}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium",
          "bg-primary text-white hover:bg-primary/90 transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "min-h-[44px] min-w-[44px]",
          className
        )}
      >
        {loading || fetchingToken ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Landmark className="h-4 w-4" />
        )}
        {loading ? "Connecting..." : "Connect Bank"}
      </button>

      {showConsentDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Plaid consent"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowConsentDialog(false)}
          />
          <div className="relative bg-white rounded-[var(--radius-card)] p-6 max-w-lg w-full shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-neutral-900">
                Confirm Data Access
              </h2>
            </div>
            <p className="text-sm text-neutral-700 mb-3">
              Before continuing to Plaid Link, please confirm that you consent
              to this app collecting, processing, and storing the account and
              transaction data you choose to share.
            </p>
            <p className="text-sm text-neutral-500 mb-4">
              You can disconnect a bank later to remove locally stored Plaid
              connection data from this app.
            </p>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 mb-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(event) => setConsentChecked(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary"
                />
                <span>
                  I consent to the collection, processing, and storage of my
                  selected financial account data for use in this app.
                </span>
              </label>
            </div>
            <p className="text-xs text-neutral-500 mb-6">
              Review the{" "}
              <Link href="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/data-policy" className="text-primary underline">
                Data Deletion & Retention Policy
              </Link>
              .
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConsentDialog(false)}
                className="flex-1 px-4 py-2.5 rounded-[var(--radius-button)] border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  storePlaidConsentAccepted();
                  setShowConsentDialog(false);
                  launchLink();
                }}
                disabled={!consentChecked}
                className="flex-1 px-4 py-2.5 rounded-[var(--radius-button)] bg-primary text-white font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                Continue to Plaid
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
