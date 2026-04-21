import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppBrand } from "@/components/navigation/AppBrand";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getSafePostAuthPath(next: string) {
  if (!next.startsWith("/")) {
    return "/accounts";
  }

  return next === "/" ? "/accounts" : next;
}

async function signUp(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const next = getSafePostAuthPath(String(formData.get("next") ?? "/"));
  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  if (password !== confirmPassword) {
    redirect(
      `/sign-up?error=${encodeURIComponent("Passwords do not match.")}&next=${encodeURIComponent(next)}`,
    );
  }

  if (password.length < 8) {
    redirect(
      `/sign-up?error=${encodeURIComponent("Use at least 8 characters for your password.")}&next=${encodeURIComponent(next)}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    redirect(`/sign-up?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }

  redirect(
    `/sign-in?message=${encodeURIComponent("Check your email to confirm your account, then sign in. If you do not see it, check spam or resend the confirmation below.")}&next=${encodeURIComponent(next)}`,
  );
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string[] | string | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const next = getSafePostAuthPath(typeof params.next === "string" ? params.next : "/");

  return (
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <AppBrand className="mb-6" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900">Create your account</h1>
          <p className="text-sm text-neutral-600">
            This creates password-based access and a private Glacier workspace for your accounts,
            budgets, transactions, and rules. You&apos;ll verify your email before signing in.
          </p>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </div>
        ) : null}

        <form action={signUp} className="mt-6 space-y-4">
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
              autoComplete="new-password"
              minLength={8}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-neutral-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-neutral-700">Confirm password</span>
            <input
              required
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={8}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-neutral-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
          >
            Create Account
          </button>
        </form>

        <p className="mt-6 text-sm text-neutral-600">
          Already have an account?{" "}
          <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
