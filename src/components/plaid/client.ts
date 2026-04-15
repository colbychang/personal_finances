"use client";

const PLAID_LINK_TOKEN_KEY = "plaid:link-token";
const PLAID_RETURN_TO_KEY = "plaid:return-to";
const PLAID_CONSENT_KEY = "plaid:consent-v1";

interface ExchangeTokenInput {
  publicToken: string;
  institutionId?: string;
  institutionName?: string;
  accounts?: Array<{
    id: string;
    name: string | null;
    mask: string | null;
    type: string;
    subtype: string | null;
  }>;
}

export interface SyncPlaidConnectionResult {
  success: boolean;
  added: number;
  modified: number;
  removed: number;
  cursor: string;
}

interface SyncError extends Error {
  retryable?: boolean;
  errorCode?: string;
}

interface SyncPlaidConnectionOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  onRetry?: (attempt: number, error: SyncError) => void;
}

export async function exchangePublicToken(input: ExchangeTokenInput) {
  const response = await fetch("/api/plaid/exchange-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      public_token: input.publicToken,
      institution_id: input.institutionId,
      institution_name: input.institutionName,
      accounts: input.accounts,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to connect bank");
  }

  return data;
}

function createSyncError(
  message: string,
  retryable?: boolean,
  errorCode?: string
): SyncError {
  const error = new Error(message) as SyncError;
  error.retryable = retryable;
  error.errorCode = errorCode;
  return error;
}

export async function syncPlaidConnection(
  connectionId: number
): Promise<SyncPlaidConnectionResult> {
  const response = await fetch("/api/plaid/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw createSyncError(
      data.error || "Failed to sync transactions",
      data.retryable,
      data.errorCode
    );
  }

  return data as SyncPlaidConnectionResult;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function syncPlaidConnectionWithRetry(
  connectionId: number,
  options: SyncPlaidConnectionOptions = {}
): Promise<SyncPlaidConnectionResult> {
  const maxRetries = options.maxRetries ?? 4;
  const retryDelayMs = options.retryDelayMs ?? 5000;
  let attempt = 0;

  while (true) {
    try {
      return await syncPlaidConnection(connectionId);
    } catch (error) {
      const syncError =
        error instanceof Error
          ? (error as SyncError)
          : createSyncError("Failed to sync transactions");

      if (!syncError.retryable || attempt >= maxRetries) {
        throw syncError;
      }

      attempt += 1;
      options.onRetry?.(attempt, syncError);
      await wait(retryDelayMs * attempt);
    }
  }
}

export function storePlaidLinkToken(linkToken: string | null) {
  if (typeof window === "undefined") return;

  if (!linkToken) {
    window.localStorage.removeItem(PLAID_LINK_TOKEN_KEY);
    return;
  }

  window.localStorage.setItem(PLAID_LINK_TOKEN_KEY, linkToken);
}

export function getStoredPlaidLinkToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PLAID_LINK_TOKEN_KEY);
}

export function storePlaidReturnTo(pathname: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAID_RETURN_TO_KEY, pathname);
}

export function getStoredPlaidReturnTo() {
  if (typeof window === "undefined") return "/";
  return window.localStorage.getItem(PLAID_RETURN_TO_KEY) || "/";
}

export function clearStoredPlaidState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PLAID_LINK_TOKEN_KEY);
  window.localStorage.removeItem(PLAID_RETURN_TO_KEY);
}

export function hasStoredPlaidConsent() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PLAID_CONSENT_KEY) === "accepted";
}

export function storePlaidConsentAccepted() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAID_CONSENT_KEY, "accepted");
}
