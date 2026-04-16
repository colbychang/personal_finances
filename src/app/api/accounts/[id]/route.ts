import { NextResponse } from "next/server";
import { db } from "@/db/index";
import {
  updateAccount,
  deleteAccountWithTransactions,
  getAccountById,
} from "@/db/queries/accounts";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/accounts/[id] — get a single account
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const { id } = await context.params;
    const accountId = parseInt(id, 10);

    if (isNaN(accountId)) {
      return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });
    }

    const account = getAccountById(db, accountId, workspace.workspaceId);

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ account });
  } catch (error) {
    console.error("GET /api/accounts/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch account" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/accounts/[id] — update an existing account
 * Body: { name?, institution?, type?, balance? }
 * balance is in dollars (converted to cents)
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const { id } = await context.params;
    const accountId = parseInt(id, 10);

    if (isNaN(accountId)) {
      return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });
    }

    const body = await request.json();
    const { name, institution, type, balance } = body;

    // Validation
    const errors: Record<string, string> = {};

    if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
      errors.name = "Name cannot be empty";
    }

    if (
      institution !== undefined &&
      (typeof institution !== "string" || institution.trim() === "")
    ) {
      errors.institution = "Institution cannot be empty";
    }

    const validTypes = [
      "checking",
      "savings",
      "credit",
      "investment",
      "retirement",
    ];
    if (type !== undefined && !validTypes.includes(type)) {
      errors.type =
        "Type must be one of: " + validTypes.join(", ");
    }

    if (balance !== undefined) {
      if (typeof balance !== "number" || isNaN(balance)) {
        errors.balance = "Balance must be a valid number";
      }
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (institution !== undefined) updates.institution = institution.trim();
    if (type !== undefined) updates.type = type;
    if (balance !== undefined) updates.balance = Math.round(balance * 100);

    const updated = updateAccount(db, accountId, updates, workspace.workspaceId);

    if (!updated) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ account: updated });
  } catch (error) {
    console.error("PUT /api/accounts/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update account" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/accounts/[id] — delete an account and its transactions
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const { id } = await context.params;
    const accountId = parseInt(id, 10);

    if (isNaN(accountId)) {
      return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });
    }

    const deleted = deleteAccountWithTransactions(db, accountId, workspace.workspaceId);

    if (!deleted) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/accounts/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
