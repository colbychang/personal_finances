import { NextResponse } from "next/server";
import { db } from "@/db/index";
import { getAllAccountsGrouped, createAccount } from "@/db/queries/accounts";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

/**
 * GET /api/accounts — returns all accounts grouped by type
 */
export async function GET() {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const grouped = getAllAccountsGrouped(db, workspace.workspaceId);
    return NextResponse.json({ sections: grouped });
  } catch (error) {
    console.error("GET /api/accounts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/accounts — create a new account
 * Body: { name, institution, type, balance }
 * balance is in dollars (converted to cents)
 */
export async function POST(request: Request) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const body = await request.json();
    const { name, institution, type, balance } = body;

    // Validation
    const errors: Record<string, string> = {};

    if (!name || typeof name !== "string" || name.trim() === "") {
      errors.name = "Name is required";
    }

    if (
      !institution ||
      typeof institution !== "string" ||
      institution.trim() === ""
    ) {
      errors.institution = "Institution is required";
    }

    const validTypes = [
      "checking",
      "savings",
      "credit",
      "investment",
      "retirement",
    ];
    if (!type || !validTypes.includes(type)) {
      errors.type = "Type is required and must be one of: " + validTypes.join(", ");
    }

    if (balance === undefined || balance === null || balance === "") {
      errors.balance = "Balance is required";
    } else if (typeof balance !== "number" || isNaN(balance)) {
      errors.balance = "Balance must be a valid number";
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    // Convert dollars to cents
    const balanceCents = Math.round(balance * 100);

    const account = createAccount(db, {
      name: name.trim(),
      institution: institution.trim(),
      type,
      balance: balanceCents,
    }, workspace.workspaceId);

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    console.error("POST /api/accounts error:", error);
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
