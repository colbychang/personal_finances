import { NextResponse } from "next/server";
import { db } from "@/db/index";
import { getAllCategories, createCategory, getCategoryByName } from "@/db/queries/categories";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";

/**
 * GET /api/categories — returns all categories (predefined + custom)
 */
export async function GET() {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const categories = await getAllCategories(db, workspace.workspaceId);
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("GET /api/categories error:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/categories — create a custom category
 * Body: { name, color?, icon? }
 */
export async function POST(request: Request) {
  try {
    const { workspace } = await requireCurrentWorkspace();
    const body = await request.json();
    const { name, color, icon } = body;

    // Validation
    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Category name is required" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // Check for duplicate name
    const existing = await getCategoryByName(db, trimmedName, workspace.workspaceId);
    if (existing) {
      return NextResponse.json(
        { error: `A category named "${trimmedName}" already exists` },
        { status: 409 }
      );
    }

    const category = await createCategory(db, {
      name: trimmedName,
      color: color || undefined,
      icon: icon || undefined,
    }, workspace.workspaceId);

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error("POST /api/categories error:", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 }
    );
  }
}
