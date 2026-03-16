import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import {
  importTransactions,
  getExistingTransactionsForDuplicateCheck,
} from "@/db/queries/imports";
import { parseCSV, mapCSVRows, findDuplicates } from "@/lib/csv";
import type { ColumnMapping, MappedTransaction } from "@/lib/csv";

/**
 * POST /api/import — Import transactions from CSV data.
 *
 * Body: {
 *   csvText: string,        // raw CSV file content
 *   accountId: number,      // which account to import into
 *   mapping: ColumnMapping, // { date: colIdx, name: colIdx, amount: colIdx, category?: colIdx }
 *   skipDuplicates: boolean // whether to exclude flagged duplicates
 * }
 *
 * Response: {
 *   imported: number,
 *   duplicatesSkipped: number,
 *   parseErrors: string[],
 *   mapErrors: string[]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { csvText, accountId, mapping, skipDuplicates } = body;

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

    if (mapResult.transactions.length === 0) {
      return NextResponse.json(
        {
          imported: 0,
          duplicatesSkipped: 0,
          parseErrors: parseResult.errors,
          mapErrors: mapResult.errors,
        },
        { status: 200 }
      );
    }

    // ── Duplicate Detection ────────────────────────────────────────

    const existing = getExistingTransactionsForDuplicateCheck(db, accountId);
    const duplicates = findDuplicates(mapResult.transactions, existing);
    const duplicateIndices = new Set(duplicates.map((d) => d.index));

    // Filter out duplicates if requested
    let transactionsToImport: MappedTransaction[];
    let duplicatesSkipped = 0;

    if (skipDuplicates) {
      transactionsToImport = mapResult.transactions.filter(
        (_, i) => !duplicateIndices.has(i)
      );
      duplicatesSkipped = duplicateIndices.size;
    } else {
      transactionsToImport = mapResult.transactions;
    }

    // ── Import ─────────────────────────────────────────────────────

    const importInputs = transactionsToImport.map((txn) => ({
      accountId,
      postedAt: txn.date,
      name: txn.name,
      amount: Math.round(txn.amount * 100), // dollars to cents
      category: txn.category ?? null,
    }));

    const imported = importTransactions(db, importInputs);

    return NextResponse.json({
      imported,
      duplicatesSkipped,
      parseErrors: parseResult.errors,
      mapErrors: mapResult.errors,
    });
  } catch (error) {
    console.error("POST /api/import error:", error);
    return NextResponse.json(
      { error: "Failed to import transactions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/import/preview — Preview CSV parsing and duplicate detection without importing.
 *
 * This is handled as a separate action parameter in the main POST handler.
 */
