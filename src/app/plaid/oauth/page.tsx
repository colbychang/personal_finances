"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import {
  usePlaidLink,
  type PlaidLinkOnExit,
  type PlaidLinkOnSuccess,
  type PlaidLinkOptions,
} from "react-plaid-link";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  clearStoredPlaidState,
  exchangePublicToken,
  getStoredPlaidLinkToken,
  getStoredPlaidReturnTo,
  syncPlaidConnectionWithRetry,
} from "@/components/plaid/client";

export default function PlaidOAuthPage() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    const storedToken = getStoredPlaidLinkToken();
    startTransition(() => {
      if (!storedToken) {
        setError("We couldn't resume the bank connection. Please start again.");
        return;
      }

      setLinkToken(storedToken);
    });
  }, []);

  const returnToApp = useCallback(() => {
    const returnTo = getStoredPlaidReturnTo();
    clearStoredPlaidState();
    window.location.assign(returnTo);
  }, []);

  const handleSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      try {
        const exchangeResult = await exchangePublicToken({
          publicToken,
          institutionId: metadata.institution?.institution_id,
          institutionName: metadata.institution?.name,
          accounts: metadata.accounts,
        });
        try {
          await syncPlaidConnectionWithRetry(exchangeResult.connection_id, {
            maxRetries: 4,
            retryDelayMs: 5000,
          });
        } catch (syncError) {
          console.warn(
            "Initial transaction sync did not complete during OAuth resume:",
            syncError
          );
        }
        returnToApp();
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Failed to finish bank connection."
        );
      }
    },
    [returnToApp]
  );

  const handleExit = useCallback<PlaidLinkOnExit>(
    (error) => {
      if (error && error.error_code !== "USER_EXIT") {
        setError("Bank connection was interrupted. Please try again.");
      } else {
        returnToApp();
      }
    },
    [returnToApp]
  );

  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess: handleSuccess,
    onExit: handleExit,
    receivedRedirectUri:
      typeof window !== "undefined" ? window.location.href : undefined,
  };

  const { open, ready } = usePlaidLink(config);

  useEffect(() => {
    if (!ready || openedRef.current || error) return;
    openedRef.current = true;
    open();
  }, [error, open, ready]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-md bg-white border border-neutral-200 rounded-2xl p-6 text-center shadow-sm">
        {error ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <h1 className="text-lg font-semibold text-neutral-900 mb-2">
              Plaid Connection Paused
            </h1>
            <p className="text-sm text-neutral-600 mb-4">{error}</p>
            <button
              onClick={returnToApp}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium"
            >
              Return to App
            </button>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-neutral-900 mb-2">
              Resuming Your Bank Connection
            </h1>
            <p className="text-sm text-neutral-600">
              Plaid is finishing the secure sign-in flow.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
