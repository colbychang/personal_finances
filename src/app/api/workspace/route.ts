import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-workspace";

export async function GET() {
  const context = await getCurrentAuthContext();

  if (!context) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: context.user.id,
      email: context.user.email,
    },
    workspace: context.workspace,
  });
}
