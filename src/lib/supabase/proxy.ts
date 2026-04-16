import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./shared";

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, response };
}

export function redirectToSignIn(request: NextRequest) {
  const signInUrl = request.nextUrl.clone();
  signInUrl.pathname = "/sign-in";
  signInUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);

  return NextResponse.redirect(signInUrl);
}

export function unauthorizedJson(message: string, status = 401) {
  return NextResponse.json({ error: message }, { status });
}

export function redirectToAccessPending(request: NextRequest, user: User | null) {
  const accessUrl = request.nextUrl.clone();
  accessUrl.pathname = "/access-pending";
  if (user?.email) {
    accessUrl.searchParams.set("email", user.email);
  }
  return NextResponse.redirect(accessUrl);
}
