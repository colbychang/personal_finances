import { NextRequest, NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaid";
import { encrypt } from "@/lib/encryption";
import { db } from "@/db/index";
import {
  createConnection,
  findOrCreatePlaidInstitution,
  createPlaidAccount,
} from "@/db/queries/connections";

interface ExchangeTokenBody {
  public_token: string;
  institution_id?: string;
  institution_name?: string;
  accounts?: Array<{
    id: string;
    name: string;
    mask: string;
    type: string;
    subtype: string;
  }>;
}

/**
 * Map Plaid account types to our account types.
 */
function mapPlaidType(type: string): string {
  switch (type) {
    case "depository":
      return "checking"; // Will be refined by subtype
    case "credit":
      return "credit";
    case "investment":
      return "investment";
    case "loan":
      return "credit"; // Loans are liabilities
    default:
      return "checking";
  }
}

function mapPlaidSubtype(type: string, subtype: string): string {
  if (type === "depository") {
    if (subtype === "savings" || subtype === "money market" || subtype === "cd") {
      return "savings";
    }
    return "checking";
  }
  if (type === "investment" || type === "brokerage") {
    if (subtype === "401k" || subtype === "401a" || subtype === "ira" || subtype === "roth") {
      return "retirement";
    }
    return "investment";
  }
  return mapPlaidType(type);
}

/**
 * POST /api/plaid/exchange-token
 * Exchanges a public_token for an access_token, stores the connection,
 * and fetches + stores connected accounts.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ExchangeTokenBody;

    if (!body.public_token) {
      return NextResponse.json(
        { error: "public_token is required" },
        { status: 400 }
      );
    }

    const plaidClient = getPlaidClient();

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: body.public_token,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Encrypt access token before storing
    const encryptedToken = encrypt(accessToken);

    const institutionName = body.institution_name ?? "Unknown Institution";

    // Create connection record
    const connection = createConnection(db, {
      institutionName,
      provider: "plaid",
      accessToken: encryptedToken,
      itemId,
      isEncrypted: true,
    });

    // Create or find institution
    const institutionId = findOrCreatePlaidInstitution(
      db,
      institutionName,
      body.institution_id
    );

    // Fetch accounts from Plaid to get balances
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const plaidAccounts = accountsResponse.data.accounts;

    // Store accounts from Plaid response (which has balance info)
    const storedAccounts = [];
    for (const plaidAccount of plaidAccounts) {
      const accountType = mapPlaidSubtype(
        plaidAccount.type,
        plaidAccount.subtype ?? ""
      );
      const isAsset = accountType !== "credit";

      // Convert dollar amounts to cents
      const balanceCurrent = Math.round(
        (plaidAccount.balances.current ?? 0) * 100
      );
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
          type: accountType,
          subtype: plaidAccount.subtype ?? null,
          balanceCurrent,
          balanceAvailable,
          isAsset,
        },
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
    console.error("Error exchanging token:", error);
    const message =
      error instanceof Error ? error.message : "Failed to exchange token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
