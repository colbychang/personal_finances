"use client";

const PLAID_LINK_TOKEN_KEY = "plaid:link-token";
const PLAID_RETURN_TO_KEY = "plaid:return-to";

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
