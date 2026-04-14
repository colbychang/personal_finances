"use client";

import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 flex flex-col gap-2 text-sm text-neutral-500 md:flex-row md:items-center md:justify-between">
        <p>Personal Finance Tracker</p>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-neutral-700 transition-colors">
            Privacy Policy
          </Link>
          <Link href="/data-policy" className="hover:text-neutral-700 transition-colors">
            Data Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
