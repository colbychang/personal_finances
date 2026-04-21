import { NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaid";
import { Products, CountryCode } from "plaid";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import { buildPlaidWebhookUrl } from "@/lib/plaid/webhook";
import { logError, logWarn } from "@/lib/observability/logger";

/**
 * POST /api/plaid/link-token
 * Creates a Plaid Link token for initializing the Link UI.
 */
export async function POST() {
  try {
    const { user, workspace } = await requireCurrentWorkspace();
    const plaidClient = getPlaidClient();
    const redirectUri = process.env.PLAID_REDIRECT_URI;
    const oauthRedirectUri =
      redirectUri && redirectUri.startsWith("https://")
        ? redirectUri
        : undefined;
    const baseRequest = {
      user: { client_user_id: `${user.id}:${workspace.workspaceId}` },
      client_name: "Glacier Finance Tracker",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    };
    const webhook = buildPlaidWebhookUrl();

    let response;
    try {
      response = await plaidClient.linkTokenCreate({
        ...baseRequest,
        ...(oauthRedirectUri ? { redirect_uri: oauthRedirectUri } : {}),
        ...(webhook ? { webhook } : {}),
      });
    } catch (error) {
      if (!oauthRedirectUri) {
        throw error;
      }

      logWarn("plaid.link_token.retry_without_redirect_uri", {
        hasWebhook: Boolean(webhook),
      });

      response = await plaidClient.linkTokenCreate({
        ...baseRequest,
        ...(webhook ? { webhook } : {}),
      });
    }

    return NextResponse.json({
      link_token: response.data.link_token,
      expiration: response.data.expiration,
    });
  } catch (error) {
    logError("plaid.link_token.failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to create link token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
