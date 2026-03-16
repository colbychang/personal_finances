import { NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaid";
import { Products, CountryCode } from "plaid";

/**
 * POST /api/plaid/link-token
 * Creates a Plaid Link token for initializing the Link UI.
 */
export async function POST() {
  try {
    const plaidClient = getPlaidClient();

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: "personal-finance-user" },
      client_name: "Personal Finance Tracker",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });

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
