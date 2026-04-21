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
import { AlertTriangle, Landmark, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { dispatchFinanceDataChanged } from "@/lib/client-events";
import { useToast } from "@/components/ui/Toast";
import {
  exchangePublicToken,
  hasStoredPlaidConsent,
  syncPlaidConnectionWithRetry,
  storePlaidLinkToken,
  storePlaidConsentAccepted,
  storePlaidReturnTo,
} from "@/components/plaid/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface PlaidLinkButtonProps {
  onSuccess: () => void;
  className?: string;
}

type MfaFactor = {
  id: string;
  status?: string;
};

export function PlaidLinkButton({ onSuccess, className }: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingToken, setFetchingToken] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [mfaPrompt, setMfaPrompt] = useState<"setup" | "challenge" | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [pendingLaunch, setPendingLaunch] = useState(false);
  const { showToast } = useToast();
  const pathname = usePathname();
  const supabase = createSupabaseBrowserClient();

  const fetchLinkToken = useCallback(async () => {
    setFetchingToken(true);
    try {
      const response = await fetch("/api/plaid/link-token", {
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (response.status === 403 && payload?.code === "mfa_required") {
          throw new Error("Complete MFA before connecting a bank.");
        }
        throw new Error(payload?.error ?? "Failed to create link token");
      }
      const data = await response.json();
      setLinkToken(data.link_token);
      storePlaidLinkToken(data.link_token);
      setPendingLaunch(true);
    } catch (error) {
      console.error("Error fetching link token:", error);
      showToast(
        error instanceof Error
          ? error.message
          : "Failed to initialize bank connection. Please try again.",
        "error",
      );
    } finally {
      setFetchingToken(false);
    }
  }, [showToast]);

  // Handle success — exchange public_token for access_token
  const handleSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      setLoading(true);
      const institutionName = metadata.institution?.name ?? "bank";
      try {
        const exchangeResult = await exchangePublicToken({
          publicToken,
          institutionId: metadata.institution?.institution_id,
          institutionName: metadata.institution?.name,
          accounts: metadata.accounts,
        });

        showToast(
          `Connected ${institutionName}. Importing transactions...`,
          "success"
        );
        onSuccess();

        try {
          const syncResult = await syncPlaidConnectionWithRetry(
            exchangeResult.connection_id,
            {
              maxRetries: 4,
              retryDelayMs: 5000,
            }
          );

          const importedCount = syncResult.added + syncResult.modified;
          dispatchFinanceDataChanged({
            source: "plaid-connect",
            importedTransactions: importedCount,
            affectedConnections: 1,
          });
          showToast(
            importedCount === 0
              ? `${institutionName} is connected and up to date.`
              : `${institutionName} imported ${importedCount} transaction${importedCount === 1 ? "" : "s"}.`,
            "success"
          );
        } catch (syncError) {
          console.error("Initial transaction sync failed:", syncError);
          showToast(
            syncError instanceof Error &&
              "retryable" in syncError &&
              syncError.retryable
              ? `${institutionName} connected, but Plaid is still preparing transactions. Use Sync again in a few minutes.`
              : `${institutionName} connected, but the initial transaction sync failed. You can retry from Connections.`,
            "error"
          );
        }

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
        setLinkToken(null);
      }
    },
    [onSuccess, showToast]
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
      setLinkToken(null);
    },
    [showToast]
  );

  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess: handleSuccess,
    onExit: handleExit,
  };

  const { open, ready } = usePlaidLink(config);

  useEffect(() => {
    if (pendingLaunch && ready && linkToken) {
      storePlaidReturnTo(pathname);
      open();
      setPendingLaunch(false);
    }
  }, [linkToken, open, pathname, pendingLaunch, ready]);

  const isDisabled = loading || fetchingToken;
  const launchLink = useCallback(async () => {
    await fetchLinkToken();
  }, [fetchLinkToken]);

  const startMfaCheckedFlow = useCallback(async () => {
    setMfaError(null);
    setLoading(true);

    try {
      const { data: aal, error: aalError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError) {
        throw aalError;
      }

      if (aal.currentLevel !== "aal2") {
        const { data: factors, error: factorsError } =
          await supabase.auth.mfa.listFactors();
        if (factorsError) {
          throw factorsError;
        }

        const verifiedTotp = (factors?.totp ?? []).find(
          (factor: MfaFactor) => factor.status === "verified",
        );
        if (!verifiedTotp) {
          setMfaPrompt("setup");
          return;
        }

        setMfaFactorId(verifiedTotp.id);
        setMfaPrompt("challenge");
        return;
      }

      if (hasStoredPlaidConsent()) {
        await launchLink();
        return;
      }

      setConsentChecked(false);
      setShowConsentDialog(true);
    } catch (error) {
      console.error("MFA check failed:", error);
      showToast(
        error instanceof Error
          ? error.message
          : "Failed to verify MFA status. Please try again.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [launchLink, showToast, supabase.auth.mfa]);

  const handleConnectClick = useCallback(() => {
    void startMfaCheckedFlow();
  }, [startMfaCheckedFlow]);

  const verifyMfaAndContinue = useCallback(async () => {
    if (!mfaFactorId) return;

    setMfaError(null);
    setLoading(true);

    try {
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challengeError) {
        throw challengeError;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode,
      });
      if (verifyError) {
        throw verifyError;
      }

      setMfaCode("");
      setMfaPrompt(null);
      setMfaFactorId(null);

      if (hasStoredPlaidConsent()) {
        await launchLink();
      } else {
        setConsentChecked(false);
        setShowConsentDialog(true);
      }
    } catch (error) {
      setMfaError(
        error instanceof Error ? error.message : "Failed to verify MFA code.",
      );
    } finally {
      setLoading(false);
    }
  }, [launchLink, mfaCode, mfaFactorId, supabase.auth.mfa]);

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

      {mfaPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Multi-factor authentication required"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMfaPrompt(null)}
          />
          <div className="relative w-full max-w-md rounded-[var(--radius-card)] bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-neutral-900">
                MFA Required for Plaid
              </h2>
            </div>

            {mfaPrompt === "setup" ? (
              <>
                <p className="text-sm text-neutral-700">
                  Before connecting a bank, set up an authenticator app in
                  Settings. This protects Plaid access behind a second factor.
                </p>
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setMfaPrompt(null)}
                    className="flex-1 rounded-[var(--radius-button)] border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <Link
                    href="/settings"
                    className="flex-1 rounded-[var(--radius-button)] bg-primary px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-primary/90"
                  >
                    Open Settings
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-neutral-700">
                  Enter the 6-digit code from your authenticator app to continue
                  to Plaid Link.
                </p>
                {mfaError ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {mfaError}
                  </div>
                ) : null}
                <label className="mt-4 block space-y-2">
                  <span className="text-sm font-medium text-neutral-700">
                    6-digit code
                  </span>
                  <input
                    required
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    value={mfaCode}
                    onChange={(event) =>
                      setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-neutral-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setMfaPrompt(null)}
                    className="flex-1 rounded-[var(--radius-button)] border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void verifyMfaAndContinue()}
                    disabled={loading || mfaCode.length !== 6}
                    className="flex-1 rounded-[var(--radius-button)] bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {loading ? "Verifying..." : "Verify"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
                  void launchLink();
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
