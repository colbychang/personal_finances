import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { getExistingTransactionsForDuplicateCheck } from "@/db/queries/imports";
import { getAccountById } from "@/db/queries/accounts";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import { parseCSV, mapCSVRows, findDuplicates } from "@/lib/csv";
import type { ColumnMapping } from "@/lib/csv";

/**
 * POST /api/import/preview — Preview parsed transactions with duplicate detection.
 *
 * Body: {
 *   csvText: string,
 *   accountId: number,
 *   mapping: ColumnMapping
 * }
 *
 * Response: {
 *   transactions: Array<{ date, name, amount, category?, isDuplicate, duplicateOf? }>,
 *   parseErrors: string[],
 *   mapErrors: string[]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const body = await request.json();
    const { csvText, accountId, mapping } = body;

    // ── Validation ─────────────────────────────────────────────────

    const errors: Record<string, string> = {};

    if (!csvText || typeof csvText !== "string") {
      errors.csvText = "CSV content is required";
    }

    if (!accountId || typeof accountId !== "number") {
      errors.accountId = "Account is required";
    }

    if (!mapping || typeof mapping !== "object") {
      errors.mapping = "Column mapping is required";
    } else {
      if (typeof mapping.date !== "number") {
        errors["mapping.date"] = "Date column mapping is required";
      }
      if (typeof mapping.name !== "number") {
        errors["mapping.name"] = "Name column mapping is required";
      }
      if (typeof mapping.amount !== "number") {
        errors["mapping.amount"] = "Amount column mapping is required";
      }
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    // ── Parse CSV ──────────────────────────────────────────────────

    const parseResult = parseCSV(csvText);
    if (parseResult.headers.length === 0) {
      return NextResponse.json(
        {
          errors: { csvText: "Could not parse CSV file" },
          parseErrors: parseResult.errors,
        },
        { status: 400 }
      );
    }

    // ── Map Columns ────────────────────────────────────────────────

    const columnMapping: ColumnMapping = {
      date: mapping.date,
      name: mapping.name,
      amount: mapping.amount,
      category: mapping.category !== undefined && mapping.category !== null
        ? mapping.category
        : undefined,
    };

    const mapResult = mapCSVRows(parseResult.rows, parseResult.headers, columnMapping);

    // ── Duplicate Detection ────────────────────────────────────────

    const account = getAccountById(db, accountId, workspace.workspaceId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const existing = getExistingTransactionsForDuplicateCheck(db, accountId, workspace.workspaceId);
    const duplicates = findDuplicates(mapResult.transactions, existing);
    const duplicateMap = new Map(duplicates.map((d) => [d.index, d]));

    // ── Build Preview ──────────────────────────────────────────────

    const transactions = mapResult.transactions.map((txn, i) => {
      const dup = duplicateMap.get(i);
      return {
        date: txn.date,
        name: txn.name,
        amount: txn.amount,
        category: txn.category ?? null,
        isDuplicate: !!dup,
        duplicateOf: dup ? dup.existingName : null,
      };
    });

    return NextResponse.json({
      transactions,
      parseErrors: parseResult.errors,
      mapErrors: mapResult.errors,
    });
  } catch (error) {
    console.error("POST /api/import/preview error:", error);
    return NextResponse.json(
      { error: "Failed to preview import" },
      { status: 500 }
    );
  }
}
