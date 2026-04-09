import { NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaid";
import { encrypt } from "@/lib/encryption";
import { db } from "@/db/index";
import {
  createConnection,
  findOrCreatePlaidInstitution,
  createPlaidAccount,
} from "@/db/queries/connections";
import { Products } from "plaid";

/**
 * POST /api/plaid/sandbox-connect
 * Creates a test connection using Plaid Sandbox public token create.
 * Only works in sandbox mode. For development/testing only.
 */
export async function POST() {
  if (process.env.PLAID_ENV !== "sandbox") {
    return NextResponse.json(
      { error: "This endpoint only works in sandbox mode" },
      { status: 403 }
    );
  }

  try {
    const plaidClient = getPlaidClient();

    // Create a sandbox public token directly (no Link UI needed)
    const sandboxResponse = await plaidClient.sandboxPublicTokenCreate({
      institution_id: "ins_109508", // First Platypus Bank
      initial_products: [Products.Transactions],
    });

    const publicToken = sandboxResponse.data.public_token;

    // Exchange for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Encrypt and store
    const encryptedToken = encrypt(accessToken);
    const institutionName = "First Platypus Bank";

    const connection = createConnection(db, {
      institutionName,
      provider: "plaid",
      accessToken: encryptedToken,
      itemId,
      isEncrypted: true,
    });

    const institutionId = findOrCreatePlaidInstitution(
      db,
      institutionName,
      "ins_109508"
    );

    // Fetch accounts
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const storedAccounts = [];
    for (const plaidAccount of accountsResponse.data.accounts) {
      const type = plaidAccount.type === "depository"
        ? (plaidAccount.subtype === "savings" ? "savings" : "checking")
        : plaidAccount.type === "credit" ? "credit" : "checking";
      const isAsset = type !== "credit";
      const balanceCurrent = Math.round((plaidAccount.balances.current ?? 0) * 100);
      const balanceAvailable = plaidAccount.balances.available
        ? Math.round(plaidAccount.balances.available * 100)
        : null;

      const account = createPlaidAccount(
        db,
        {
          institutionId,
          externalRef: plaidAccount.account_id,
          name: plaidAccount.name,
          mask: plaidAccount.mask,
          type,
          subtype: plaidAccount.subtype ?? null,
          balanceCurrent,
          balanceAvailable,
          isAsset,
        },
        connection.id,
        institutionName
      );

      storedAccounts.push({
        id: account.id,
        name: account.name,
        type: account.type,
        mask: account.mask,
      });
    }

    return NextResponse.json({
      connection_id: connection.id,
      institution_name: institutionName,
      accounts: storedAccounts,
    });
  } catch (error) {
    console.error("Sandbox connect error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create sandbox connection";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
