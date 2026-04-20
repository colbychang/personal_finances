import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedEmail } from "@/lib/auth/access";
import { isPublicProfileMode } from "@/lib/deployment";
import {
  redirectToAccessPending,
  redirectToSignIn,
  unauthorizedJson,
  updateSupabaseSession,
} from "@/lib/supabase/proxy";

const AUTH_USER_ID_HEADER = "x-glacier-auth-user-id";
const AUTH_EMAIL_HEADER = "x-glacier-auth-email";

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

function getSafePostAuthPath(next: string | null) {
  if (!next || !next.startsWith("/")) {
    return "/accounts";
  }

  return next === "/" ? "/accounts" : next;
}

function withAuthHeaders(
  request: NextRequest,
  response: NextResponse,
  user: { id: string; email?: string | null },
) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(AUTH_USER_ID_HEADER, user.id);
  if (user.email) {
    requestHeaders.set(AUTH_EMAIL_HEADER, user.email);
  }

  const nextResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  for (const cookie of response.cookies.getAll()) {
    nextResponse.cookies.set(cookie);
  }

  return nextResponse;
}

export async function proxy(request: NextRequest) {
  if (isPublicProfileMode()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    const { user, response } = await updateSupabaseSession(request);

    if (user && (pathname === "/sign-in" || pathname === "/sign-up")) {
      const next = getSafePostAuthPath(request.nextUrl.searchParams.get("next"));
      return NextResponse.redirect(new URL(next, request.url));
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

  return withAuthHeaders(request, response, user);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|webmanifest)$).*)",
  ],
};
