import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { getTransactions } from "@/db/queries/transactions";

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
