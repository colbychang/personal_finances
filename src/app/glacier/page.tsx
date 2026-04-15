import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Glacier Finance Tracker",
  description:
    "Glacier Finance Tracker helps consumers connect accounts, review transactions, and track spending trends.",
};

function InfoCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
      <h2 className="text-base font-semibold text-white mb-2">{title}</h2>
      <p className="text-sm leading-6 text-sky-50/90">{body}</p>
    </div>
  );
}

export default function GlacierLandingPage() {
  return (
    <div className="min-h-full bg-[linear-gradient(135deg,#0b1f3a_0%,#123c6a_52%,#1f77b4_100%)]">
      <div className="max-w-6xl mx-auto px-4 py-10 md:px-8 md:py-16">
        <section className="overflow-hidden rounded-[2rem] border border-white/15 bg-white/10 shadow-2xl backdrop-blur-sm">
          <div className="grid gap-10 px-6 py-8 md:grid-cols-[1.15fr_0.85fr] md:px-10 md:py-12">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-sky-50/90">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />
                OAuth institution application profile
              </div>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-5xl">
                Glacier Finance Tracker
              </h1>
              <p className="mt-4 text-lg leading-8 text-sky-50/90">
                A personal finance app for connecting accounts, importing
                transactions, tracking spending, and reviewing net worth in one
                place.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/privacy"
                  className="inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-sky-100"
                >
                  Privacy Policy
                </Link>
                <Link
                  href="/data-policy"
                  className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-white/20"
                >
                  Data Policy
                </Link>
              </div>
              <div className="mt-8 rounded-2xl border border-cyan-200/20 bg-slate-950/20 px-5 py-4 text-sm text-sky-50/90">
                <p className="font-medium text-white">Public website URL</p>
                <p className="mt-2">
                  Use this page&apos;s stable deployed URL for OAuth
                  registration, such as{" "}
                  <code className="rounded bg-white/10 px-1.5 py-0.5 text-white">
                    https://your-domain.example/glacier
                  </code>
                  .
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="w-full max-w-sm rounded-[2rem] border border-white/15 bg-slate-950/20 p-6 shadow-xl">
                <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[1.5rem] bg-white/10 ring-1 ring-white/20">
                  <Image
                    src="/glacier-icon.svg"
                    alt="Glacier Finance Tracker icon"
                    width={112}
                    height={112}
                    priority
                  />
                </div>
                <div className="mt-5 text-center">
                  <p className="text-lg font-semibold text-white">
                    Glacier Finance Tracker
                  </p>
                  <p className="mt-2 text-sm leading-6 text-sky-50/85">
                    Connect selected financial institutions through Plaid to
                    review balances, categorize transactions, and monitor
                    personal cash flow over time.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <InfoCard
            title="Connected accounts"
            body="Users can link supported financial institutions through Plaid and choose which accounts to share with the application."
          />
          <InfoCard
            title="Budgeting and analytics"
            body="Imported account and transaction data is used to power spending analysis, budgets, account views, and net worth tracking."
          />
          <InfoCard
            title="Policies"
            body="The deployed application should provide public privacy, consent, and data handling disclosures alongside the consumer finance experience."
          />
        </section>
      </div>
    </div>
  );
}
