/**
 * Plaid client initialization and utilities.
 * Configured from environment variables (server-side only).
 */
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

let plaidClient: PlaidApi | null = null;

/**
 * Get (or create) a singleton Plaid API client.
 * Must only be called server-side (API routes / Server Components).
 */
export function getPlaidClient(): PlaidApi {
  if (plaidClient) return plaidClient;

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV ?? "sandbox";

  if (!clientId || !secret) {
    throw new Error(
      "Missing PLAID_CLIENT_ID or PLAID_SECRET environment variables"
    );
  }

  const basePath =
    env === "production"
      ? PlaidEnvironments.production
      : env === "development"
        ? PlaidEnvironments.development
        : PlaidEnvironments.sandbox;

  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  plaidClient = new PlaidApi(configuration);
  return plaidClient;
}
