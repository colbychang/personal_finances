import Link from "next/link";
import { redirect } from "next/navigation";
import { AppBrand } from "@/components/navigation/AppBrand";
import { db } from "@/db/index";
import { ensurePersonalWorkspaceForAuthUser } from "@/db/queries/workspaces";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getSafePostAuthPath(next: string) {
  if (!next.startsWith("/")) {
    return "/accounts";
  }

  return next === "/" ? "/accounts" : next;
}

async function signIn(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  const redirectPath = getSafePostAuthPath(next);

  console.info("[auth] sign-in attempt", {
    email,
    next,
    redirectPath,
  });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error("[auth] sign-in failed", {
      email,
      message: error.message,
    });
    redirect(`/sign-in?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.info("[auth] sign-in success", {
    email,
    authUserId: user?.id ?? null,
  });

  if (user?.email) {
    await ensurePersonalWorkspaceForAuthUser(db, user.id, user.email);
  }

  console.info("[auth] redirecting after sign-in", {
    email,
    redirectPath,
  });
  redirect(redirectPath);
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const message = typeof params.message === "string" ? params.message : null;
  const next = getSafePostAuthPath(typeof params.next === "string" ? params.next : "/");

  return (
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <AppBrand className="mb-6" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900">Sign in to Glacier</h1>
          <p className="text-sm text-neutral-600">
            Password protection is now wired in through Supabase. We&apos;re still finishing
            per-user data isolation, so keep beta access limited to trusted testers for now.
          </p>
        </div>

        {message ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        ) : null}

        <form action={signIn} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block space-y-2">
            <span className="text-sm font-medium text-neutral-700">Email</span>
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-neutral-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-neutral-700">Password</span>
            <input
              required
              type="password"
              name="password"
              autoComplete="current-password"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-neutral-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
          >
            Sign In
          </button>
        </form>

        <p className="mt-6 text-sm text-neutral-600">
          Need an account?{" "}
          <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
