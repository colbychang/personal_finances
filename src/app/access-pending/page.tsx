import Link from "next/link";
import { AppBrand } from "@/components/navigation/AppBrand";
import { getAuthorizedEmails } from "@/lib/auth/access";

export default async function AccessPendingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string[] | string | undefined>>;
}) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : null;
  const allowlist = getAuthorizedEmails();

  return (
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <AppBrand className="mb-6" />
        <h1 className="text-2xl font-semibold text-neutral-900">Access is staged for now</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          Supabase authentication is now in place, but the finance data is still backed by the
          original single-tenant schema. Until the database migration to per-user workspaces is
          finished, only allowlisted testers should be let into the live app.
        </p>

        <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <p>
            Signed in as <span className="font-medium">{email ?? "unknown user"}</span>
          </p>
          {allowlist.length > 0 ? (
            <p className="mt-2">
              Current allowlist: <span className="font-medium">{allowlist.join(", ")}</span>
            </p>
          ) : (
            <p className="mt-2">
              No allowlist is configured yet. Set <code>AUTHORIZED_EMAILS</code> before inviting
              testers so access stays intentional while shared-data isolation is still in flight.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/sign-in"
            className="rounded-2xl border border-neutral-200 px-4 py-2 font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Back to sign in
          </Link>
          <Link href="/glacier" className="font-medium text-primary hover:underline">
            View the public app profile
          </Link>
        </div>
      </div>
    </div>
  );
}
