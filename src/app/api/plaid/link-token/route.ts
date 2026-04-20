import { NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaid";
import { Products, CountryCode } from "plaid";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

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

    let response;
    try {
      response = await plaidClient.linkTokenCreate({
        ...baseRequest,
        ...(oauthRedirectUri ? { redirect_uri: oauthRedirectUri } : {}),
      });
    } catch (error) {
      if (!oauthRedirectUri) {
        throw error;
      }

      console.warn(
        "Plaid link token creation failed with redirect_uri; retrying without redirect_uri.",
        error,
      );

      response = await plaidClient.linkTokenCreate(baseRequest);
    }

    return NextResponse.json({
      link_token: response.data.link_token,
      expiration: response.data.expiration,
    });
  } catch (error) {
    console.error("Error creating link token:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create link token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
