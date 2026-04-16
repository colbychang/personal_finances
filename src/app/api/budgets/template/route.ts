import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import {
  getBudgetTemplates,
  replaceBudgetTemplates,
  replaceBudgetTemplatesFromMonth,
} from "@/db/queries/budgets";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

/**
 * GET /api/budgets/template
 * Returns the current default budget model.
 */
export async function GET() {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const templates = getBudgetTemplates(db, workspace.workspaceId);
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("GET /api/budgets/template error:", error);
    return NextResponse.json(
      { error: "Failed to fetch budget template" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/budgets/template
 * Replace the default budget model with the budgets currently visible for a month.
 * Body: { month: "YYYY-MM" }
 */
export async function POST(request: NextRequest) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const body = await request.json();
    const { month } = body;

    if (!month || typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "month is required in YYYY-MM format" },
        { status: 400 }
      );
    }

    const count = replaceBudgetTemplatesFromMonth(db, month, workspace.workspaceId);

    if (count === -1) {
      return NextResponse.json(
        { message: "No budgets found for this month", saved: 0 },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        message: `Saved ${count} budget(s) as the default model`,
        saved: count,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/budgets/template error:", error);
    return NextResponse.json(
      { error: "Failed to save budget template" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/budgets/template
 * Replace the default budget model with an explicit set of category amounts.
 * Body: { templates: [{ category: string, amount: number }] } where amount is dollars.
 */
export async function PUT(request: NextRequest) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const body = await request.json();
    const { templates } = body;

    if (!Array.isArray(templates)) {
      return NextResponse.json(
        { error: "templates must be an array" },
        { status: 400 }
      );
    }

    const errors: Record<string, string> = {};
    const seenCategories = new Set<string>();

    const parsedTemplates = templates.flatMap((template, index) => {
      if (!template || typeof template !== "object") {
        errors[`template_${index}`] = "Each template entry must be an object";
        return [];
      }

      const category =
        typeof template.category === "string" ? template.category.trim() : "";
      const amount = template.amount;

      if (!category) {
        errors[`category_${index}`] = "Category is required";
      } else if (seenCategories.has(category)) {
        errors[`category_${index}`] = "Categories must be unique";
      } else {
        seenCategories.add(category);
      }

      if (amount === undefined || amount === null || amount === "") {
        errors[`amount_${index}`] = "Amount is required";
      } else if (typeof amount !== "number" || Number.isNaN(amount)) {
        errors[`amount_${index}`] = "Amount must be a valid number";
      } else if (amount < 0) {
        errors[`amount_${index}`] = "Amount must not be negative";
      }

      if (!category || typeof amount !== "number" || Number.isNaN(amount) || amount < 0) {
        return [];
      }

      return [
        {
          category,
          amount: Math.round(amount * 100),
        },
      ];
    });

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const saved = replaceBudgetTemplates(db, parsedTemplates, workspace.workspaceId);

    return NextResponse.json(
      {
        message:
          saved === 0
            ? "Cleared the default budget model"
            : `Saved ${saved} budget(s) in the default model`,
        saved,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("PUT /api/budgets/template error:", error);
    return NextResponse.json(
      { error: "Failed to update budget template" },
      { status: 500 }
    );
  }
}
