import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { getTransactions, createTransaction } from "@/db/queries/transactions";

/**
 * GET /api/transactions — returns paginated, filtered transactions.
 *
 * Query params:
 *  - dateFrom:  YYYY-MM-DD (inclusive)
 *  - dateTo:    YYYY-MM-DD (inclusive)
 *  - category:  single or comma-separated category names
 *  - accountId: numeric account id
 *  - search:    free-text search across name, merchant, notes
 *  - page:      1-based page number (default 1)
 *  - limit:     results per page (default 20, max 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const dateFrom = searchParams.get("dateFrom") ?? undefined;
    const dateTo = searchParams.get("dateTo") ?? undefined;
    const categoryParam = searchParams.get("category") ?? undefined;
    const accountIdParam = searchParams.get("accountId") ?? undefined;
    const search = searchParams.get("search") ?? undefined;
    const pageParam = searchParams.get("page") ?? undefined;
    const limitParam = searchParams.get("limit") ?? undefined;

    // Validate date formats
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateFrom && !isoDateRegex.test(dateFrom)) {
      return NextResponse.json(
        { error: "dateFrom must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }
    if (dateTo && !isoDateRegex.test(dateTo)) {
      return NextResponse.json(
        { error: "dateTo must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    // Validate accountId
    let accountId: number | undefined;
    if (accountIdParam) {
      accountId = parseInt(accountIdParam, 10);
      if (isNaN(accountId)) {
        return NextResponse.json(
          { error: "accountId must be a number" },
          { status: 400 }
        );
      }
    }

    // Parse category (supports comma-separated for multi-select)
    let category: string | string[] | undefined;
    if (categoryParam) {
      const cats = categoryParam.split(",").map((c) => c.trim()).filter(Boolean);
      category = cats.length === 1 ? cats[0] : cats;
    }

    // Parse pagination
    const page = pageParam ? parseInt(pageParam, 10) : undefined;
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const result = getTransactions(db, {
      dateFrom,
      dateTo,
      category,
      accountId,
      search,
      page: isNaN(page as number) ? undefined : page,
      limit: isNaN(limit as number) ? undefined : limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/transactions — create a new transaction
 * Body: { date, name, amount, accountId, category?, notes?, isTransfer?, type }
 * amount is in dollars (converted to cents). type is "expense" or "income".
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, name, amount, accountId, category, notes, isTransfer, type } = body;

    // Validation
    const errors: Record<string, string> = {};

    // Date validation
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!date || typeof date !== "string" || !isoDateRegex.test(date)) {
      errors.date = "Date is required and must be in YYYY-MM-DD format";
    } else {
      // Validate it's a real date
      const parsed = new Date(date + "T00:00:00");
      if (isNaN(parsed.getTime())) {
        errors.date = "Invalid date";
      }
    }

    // Name validation
    if (!name || typeof name !== "string" || name.trim() === "") {
      errors.name = "Name is required";
    }

    // Amount validation
    if (amount === undefined || amount === null || amount === "") {
      errors.amount = "Amount is required";
    } else if (typeof amount !== "number" || isNaN(amount)) {
      errors.amount = "Amount must be a valid number";
    } else if (amount <= 0) {
      errors.amount = "Amount must be greater than zero";
    }

    // Account validation
    if (!accountId || typeof accountId !== "number") {
      errors.accountId = "Account is required";
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    // Convert dollars to cents, apply sign based on type
    const amountCents = Math.round(amount * 100);
    const signedAmount = type === "income" ? -amountCents : amountCents;

    const transaction = createTransaction(db, {
      accountId,
      postedAt: date,
      name: name.trim(),
      amount: signedAmount,
      category: category || undefined,
      notes: notes?.trim() || undefined,
      isTransfer: isTransfer ?? false,
    });

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    console.error("POST /api/transactions error:", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
