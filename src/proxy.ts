import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedEmail } from "@/lib/auth/access";
import { isPublicProfileMode } from "@/lib/deployment";
import {
  redirectToAccessPending,
  redirectToSignIn,
  unauthorizedJson,
  updateSupabaseSession,
} from "@/lib/supabase/proxy";

const PUBLIC_PATH_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/auth",
  "/privacy",
  "/data-policy",
  "/glacier",
  "/access-pending",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

export async function proxy(request: NextRequest) {
  if (isPublicProfileMode()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    const { user, response } = await updateSupabaseSession(request);

    if (user && (pathname === "/sign-in" || pathname === "/sign-up")) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return response;
  }

  const { user, response } = await updateSupabaseSession(request);

  if (!user) {
    if (isApiPath(pathname)) {
      return unauthorizedJson("Authentication required");
    }

    return redirectToSignIn(request);
  }

  if (!isAuthorizedEmail(user.email)) {
    if (isApiPath(pathname)) {
      return unauthorizedJson(
        "This beta is currently restricted to allowlisted testers while multi-user data isolation is still being completed.",
        403,
      );
    }

    return redirectToAccessPending(request, user);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|webmanifest)$).*)",
  ],
};
