"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { isPublicProfileMode } from "@/lib/deployment";
import { AppBrand } from "./AppBrand";

export function AppFooter() {
  const pathname = usePathname();
  const publicProfileMode = isPublicProfileMode();
  const showSignOut =
    !publicProfileMode &&
    !pathname.startsWith("/sign-in") &&
    !pathname.startsWith("/sign-up") &&
    !pathname.startsWith("/forgot-password") &&
    !pathname.startsWith("/reset-password") &&
    !pathname.startsWith("/access-pending");

  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 flex flex-col gap-2 text-sm text-neutral-500 md:flex-row md:items-center md:justify-between">
        <AppBrand
          className="w-fit"
          iconClassName="h-6 w-6 rounded-lg"
          textClassName="text-neutral-700"
          titleClassName="text-sm"
          subtitleClassName="text-[0.6rem] tracking-[0.16em]"
        />
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-neutral-700 transition-colors">
            Privacy Policy
          </Link>
          <Link href="/data-policy" className="hover:text-neutral-700 transition-colors">
            Data Policy
          </Link>
          {showSignOut ? <SignOutButton /> : null}
        </div>
      </div>
    </footer>
  );
}
