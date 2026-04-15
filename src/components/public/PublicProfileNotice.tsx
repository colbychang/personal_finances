import Link from "next/link";

export function PublicProfileNotice() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-2xl rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-sky-800">
          Public Profile Mode
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-neutral-900">
          Glacier Personal Finance Tracking
        </h1>
        <p className="mt-4 text-base leading-7 text-neutral-600">
          This deployment is currently being used as a public-facing profile for
          OAuth registration, policies, and application information. The full
          finance app is not enabled on this environment yet.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/glacier"
            className="inline-flex items-center rounded-full bg-primary px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            View Glacier Profile
          </Link>
          <Link
            href="/privacy"
            className="inline-flex items-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Privacy Policy
          </Link>
          <Link
            href="/data-policy"
            className="inline-flex items-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Data Policy
          </Link>
        </div>
      </div>
    </div>
  );
}
