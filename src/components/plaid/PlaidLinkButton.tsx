"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  usePlaidLink,
  type PlaidLinkOnSuccess,
  type PlaidLinkOnExit,
  type PlaidLinkOptions,
} from "react-plaid-link";
import { Landmark, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import {
  exchangePublicToken,
  storePlaidLinkToken,
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

  return (
    <button
      onClick={() => {
        storePlaidReturnTo(pathname);
        open();
      }}
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
  );
}
