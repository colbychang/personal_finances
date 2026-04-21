import Link from "next/link";
import { AppBrand } from "@/components/navigation/AppBrand";

export default async function AccessPendingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string[] | string | undefined>>;
}) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : null;

  return (
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <AppBrand className="mb-6" />
        <h1 className="text-2xl font-semibold text-neutral-900">Access is open for beta testers</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          Glacier now creates a private workspace for each signed-in user. If you landed here from
          an older session, sign out and sign back in so the app can finish setting up your
          workspace.
        </p>

        <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <p>
            Signed in as <span className="font-medium">{email ?? "unknown user"}</span>
          </p>
          <p className="mt-2">
            The previous allowlist gate has been retired now that per-user workspaces are active.
          </p>
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
